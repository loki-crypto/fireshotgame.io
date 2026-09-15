# PLAN.md — FPS educacional de cibersegurança e redes

Documento de arquitetura e ordem de implementação. Aprovado em 2026-09-15 (sem consentimento de responsável).

---

## 1. Decisões de arquitetura

| Tema | Decisão | Motivo |
|---|---|---|
| Monorepo | `pnpm` workspaces: `apps/web`, `apps/api`, `packages/content`, `packages/sim` | Conteúdo JSON e regras de simulação compartilhados entre cliente (feedback imediato) e testes; API valida contra os mesmos schemas |
| Cliente | Vite + TypeScript + Three.js, HUD em HTML/CSS. Preact só se a UI do hub crescer (M4) | Conforme spec |
| Separação no cliente | `sim/` (puro, sem DOM/Three), `render/` (Three.js), `net/` (API client), `ui/` (HUD/menus) | Testabilidade com Vitest sem WebGL |
| Loop de jogo | Simulação em passo fixo (60 Hz, acumulador); render interpola | Determinismo nos testes, física estável |
| Geometria | Grid de células 2 m; layout da fase é uma matriz ASCII + objetos posicionados | Navegação por grid trivial, autoria fácil em JSON |
| IA | FSM por inimigo + pathfinding A* sobre o grid da fase | Spec pede grid ou waypoints; grid cobre ambos |
| Aleatoriedade | PRNG determinístico (mulberry32) semeado por `seed` da sessão de fase | Terminais parametrizados reproduzíveis no servidor |
| Backend | FastAPI + SQLAlchemy 2 (async) + Alembic + PostgreSQL 16, `uv` + `ruff` + `pytest` | Conforme spec |
| Auth | argon2id; JWT access (15 min) + refresh (7 dias, rotativo, hash armazenado) em cookies `httpOnly; SameSite=Lax; Secure` | Conforme spec; CSRF mitigado por SameSite + header `X-Requested-With` exigido em mutações |
| Conteúdo | JSON em `packages/content/{phases,enemies,weapons,upgrades,badges}` com JSON Schema (validado via `ajv` no build e `jsonschema` no pytest) | Princípio 5: engine não muda ao adicionar fase |
| Geradores de questões | Em `packages/sim/src/terminals/generators/*.ts` (TS) e espelhados em `apps/api/app/terminals/generators/*.py` (Python), com fixtures de conformidade cruzada | Cliente valida localmente; servidor revalida a partir da seed. Um teste compara saídas TS vs Python para 200 seeds |
| i18n | `apps/web/src/i18n/pt-BR.json`; código só usa `t('chave')` | Spec |
| Infra | Docker Compose: `web` (nginx + build estático), `api`, `db` | Spec |

### Diagrama de fluxo

```
Navegador                          Servidor
┌───────────────────────────┐      ┌────────────────────────────┐
│ ui/  (HUD, menus, hub)    │      │ FastAPI                    │
│   ↕ eventos               │      │  /auth  /progress /events  │
│ sim/ (estado, regras, IA) │─────▶│  /terminals /heartbeat     │
│   ↕ snapshot              │ HTTP │  /certificates /verify     │
│ render/ (Three.js)        │      │   ↓                        │
│ net/  (fila de eventos,   │◀─────│ rules/ (XP, badges,        │
│        heartbeat)         │      │   plausibilidade, tempo)   │
└───────────────────────────┘      │   ↓ SQLAlchemy → Postgres  │
                                   └────────────────────────────┘
```

---

## 2. Estrutura de pastas

```
fireshotgame/
├── PLAN.md
├── README.md
├── package.json                 # workspaces, scripts raiz
├── pnpm-workspace.yaml
├── docker-compose.yml
├── .env.example
├── infra/
│   ├── nginx.conf
│   ├── web.Dockerfile
│   └── api.Dockerfile
├── packages/
│   ├── content/                 # dados puros (JSON) + schemas
│   │   ├── schemas/             # phase.schema.json, enemy.schema.json, weapon.schema.json,
│   │   │                        # upgrade.schema.json, badge.schema.json, question.schema.json
│   │   ├── phases/              # 00-tutorial.json … 09-incident.json
│   │   ├── enemies.json
│   │   ├── weapons.json
│   │   ├── upgrades.json
│   │   ├── badges.json
│   │   ├── scripts/validate.ts  # ajv sobre tudo
│   │   └── package.json
│   └── sim/                     # simulação pura (TS, sem DOM)
│       ├── src/
│       │   ├── core/            # rng.ts, vec.ts, grid.ts, events.ts, clock.ts
│       │   ├── world/           # world.ts (estado), loader.ts (JSON→World)
│       │   ├── player/          # player.ts, movement.ts, stamina.ts, inventory.ts
│       │   ├── weapons/         # weapon.ts, hitscan.ts, damage.ts (multiplicadores)
│       │   ├── enemies/         # fsm.ts, pathfinding.ts, behaviors/{worm,rootkit,…}.ts
│       │   ├── terminals/       # terminal.ts, generators/{mc,match,subnet,classify,firewall}.ts
│       │   ├── phase/           # phase.ts (briefing→…→debrief), checkpoint.ts, scoring.ts
│       │   ├── progression/     # xp.ts, level.ts, upgrades.ts
│       │   └── index.ts
│       ├── test/
│       └── package.json
├── apps/
│   ├── web/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── src/
│   │   │   ├── main.ts          # boot, loop, wiring
│   │   │   ├── render/          # scene.ts, materials.ts, meshes/{player,enemies,pickups,level}.ts,
│   │   │   │                    # camera.ts, effects.ts (tracers, flashes)
│   │   │   ├── input/           # keyboard.ts, mouse.ts, bindings.ts (remapeável)
│   │   │   ├── audio/           # synth.ts (osciladores/ruído), sfx.ts
│   │   │   ├── ui/              # hud.ts, menu.ts, briefing.ts, terminal-ui.ts, debrief.ts, hub/
│   │   │   ├── net/             # api.ts, event-queue.ts, heartbeat.ts, session.ts
│   │   │   ├── i18n/            # pt-BR.json, t.ts
│   │   │   └── styles/
│   │   ├── test/                # vitest (ui pura, input, i18n)
│   │   ├── e2e/                 # playwright
│   │   └── package.json
│   └── api/
│       ├── pyproject.toml
│       ├── alembic/
│       ├── app/
│       │   ├── main.py
│       │   ├── config.py
│       │   ├── db.py
│       │   ├── models/          # user.py, heartbeat.py, phase_progress.py, terminal_attempt.py,
│       │   │                    # event.py, badge_earned.py, upgrade_owned.py, certificate.py
│       │   ├── schemas/         # pydantic
│       │   ├── routers/         # auth.py, me.py, progress.py, events.py, terminals.py,
│       │   │                    # heartbeat.py, upgrades.py, badges.py, certificates.py, verify.py
│       │   ├── services/        # auth.py, xp.py, badges.py, plausibility.py, active_time.py,
│       │   │                    # certificate.py (WeasyPrint + Ed25519), content.py (carrega JSON)
│       │   ├── terminals/       # generators/*.py espelho dos TS
│       │   └── security/        # jwt.py, passwords.py, rate_limit.py, csrf.py
│       └── tests/
└── docs/
    ├── curriculo.md             # objetivos por fase (texto dos briefings)
    └── privacidade.md, termos.md
```

---

## 3. Modelo de dados

### 3.1 Estado de simulação (cliente, `packages/sim`)

```ts
World {
  tick: number; seed: number; rng: Rng;
  phase: PhaseDef; grid: Grid;             // Grid: células walkable/solid, custo
  player: Player;                          // pos, yaw, pitch, vel, hp, shield, stamina,
                                           // weapons: WeaponState[], activeWeapon, upgrades
  enemies: Map<id, Enemy>;                 // type, pos, hp, state(FSM), target, revealedUntil,
                                           // path, timers (worm.replicateAt, etc.)
  pickups: Map<id, Pickup>;                // kind: ammo|health|bytes|backup|fake(trojan), pos
  terminals: Map<id, Terminal>;            // def, status: locked|open|solved|corrupted,
                                           // corruptedBy?: injectorId, mitmActive?: boolean
  doors: Map<id, Door>;                    // unlockedBy: terminalId
  spawners: Map<id, Spawner>;              // enemyType, interval, max, disabledBy?: terminalId
  hudMessages: HudMessage[];               // inclui phishing falsos com flags sutis
  flow: 'briefing'|'explore'|'terminal'|'arena'|'boss'|'debrief'|'dead';
  stats: PhaseStats;                       // kills por tipo, dano tomado, terminais 1ª tentativa,
                                           // tempo, mortes, armas usadas, fakePickups, mitmHits
  checkpoint?: WorldSnapshot;
  outbox: GameEvent[];                     // eventos para o servidor
}
```

Regra de dano (`weapons/damage.ts`):
`dmg = base × (counter === 'strong' ? 2.5 : counter === 'weak' ? 0.5 : 1) × upgradeMult`. A tabela de ameaça↔contramedida vive em `enemies.json` (`counters: { strong: ['scanner'], weak: ['patch_pistol'] }`), não no código.

### 3.2 Schemas de conteúdo (resumo)

**phase.schema.json**
```jsonc
{
  "id": "01-lan", "version": 1, "order": 1,
  "title": "…", "learningObjectives": ["…"],
  "briefing": { "paragraphs": ["…"], "maxReadSeconds": 60 },
  "parTime": 300, "minTime": 60,             // minTime usado pelo servidor
  "layout": { "cellSize": 2, "rows": ["####…", "#..S…"] },   // S spawn, T terminal, D door,
                                                              // A arena trigger, B boss, . chão, # parede
  "objects": [
    { "type": "terminal", "id": "t1", "cell": [3,4], "terminal": "term-mac-ip", "unlocks": ["d1"] },
    { "type": "door", "id": "d1", "cell": [9,4] },
    { "type": "spawner", "id": "s1", "cell": [12,8], "enemy": "worm", "interval": 8, "max": 6,
      "activeIn": ["arena"], "disabledBy": "t2" },
    { "type": "pickup", "kind": "ammo", "weapon": "patch_pistol", "cell": [5,5] },
    { "type": "enemy", "enemy": "worm", "cell": [7,7], "patrol": [[7,7],[7,12]] }
  ],
  "terminals": [
    { "id": "term-mac-ip", "kind": "match", "generator": "mac_ip_match",
      "params": { "pairs": 4 }, "hintUpgrade": "analysis.hints" }
  ],
  "weaponsAvailable": ["patch_pistol"], "unlocksWeapon": null,
  "arena": { "trigger": "A", "waves": [{ "enemy": "worm", "count": 4 }] },
  "boss": null,
  "debriefing": { "summary": ["…"] },
  "maxKills": 40                              // teto de plausibilidade
}
```

**enemy.schema.json**: `id, concept, shape ('cube'|'octa'|'tetra'|'torus'|…), color, hp, speed, damage, attackRange, attackCooldown, fsm: { alertRadius, chaseRadius, loseRadius }, counters: { strong: [], weak: [] }, special: { replicateEvery?, hiddenUntilScanned?, disguiseAs?, mitmRange?, bruteForceTarget?, phishMessages?, corruptsTerminals?, encryptsUpgrades? }, xp`.

**weapon.schema.json**: `id, name, kind ('hitscan'|'area'|'utility'|'shield'), damage, rof, magazine, reserveMax (null = infinito), reloadSeconds, spread, range, energy?: { max, drainPerSecond, regen }, effect?: 'reveal'|'barrier'|'nullify_mitm'`.

**upgrade.schema.json**: `id, branch ('offense'|'defense'|'analysis'), tier, costBytes, requiresLevel, requires: [], effect: { stat, op:'add'|'mul', value } | { flag }`.

**badge.schema.json**: `id, name, description, icon: { shape, color }, criterion: { type: 'phase_completed'|'streak'|'counter'|'phase_flag', … }`.

**question (gerada)**: `{ generator, seed, prompt, kind, options?/pairs?/rules?, answerSpec }` — o cliente recebe só o enunciado; `answerSpec` fica no servidor. O cliente valida localmente rodando o mesmo gerador (o "gabarito" existe no bundle, mas o servidor é a autoridade para XP; proporcional ao MVP).

### 3.3 Banco de dados (PostgreSQL)

```
users            id uuid pk, email citext unique, name text, password_hash text,
                 xp int default 0, level int default 1, bytes int default 0,
                 accepted_terms_at timestamptz, created_at, deleted_at null
refresh_tokens   id uuid pk, user_id fk, token_hash text, expires_at, revoked_at null
phase_sessions   id uuid pk, user_id fk, phase_id text, seed bigint, started_at,
                 completed_at null, died int, kills int, terminals_first_try int,
                 terminals_total int, duration_s int, weapons_used text[], flags jsonb
phase_progress   user_id fk, phase_id text, best_time_s int null, completed bool,
                 completions int, best_score int, pk(user_id, phase_id)
terminal_attempts id bigserial, user_id fk, session_id fk, terminal_id text, generator text,
                 seed bigint, attempt_no int, answer jsonb, correct bool, created_at
events           id bigserial, user_id fk, session_id fk, type text, payload jsonb,
                 client_ts timestamptz, server_ts timestamptz, accepted bool, reject_reason text
heartbeats       id bigserial, user_id fk, phase_id text null, client_ts, server_ts,
                 credited_s smallint
active_time      user_id fk, phase_id text ('' = total), seconds int, pk(user_id, phase_id)
badges_earned    user_id fk, badge_id text, earned_at, pk(user_id, badge_id)
badge_counters   user_id fk, key text, value int, streak int, pk(user_id, key)
upgrades_owned   user_id fk, upgrade_id text, bought_at, pk(user_id, upgrade_id)
certificates     id uuid pk, code text unique (base32, 12 chars), user_id fk null (anonimizável),
                 full_name text, active_hours numeric(5,1), modules jsonb, issued_at,
                 payload_json jsonb, signature bytea, revoked bool
```

Índices: `events(user_id, server_ts)`, `heartbeats(user_id, server_ts desc)`, `terminal_attempts(user_id, generator)`.

---

## 4. Contratos da API (`/api/v1`)

Todas as respostas de erro: `{ "error": { "code": "string", "message": "pt-BR", "details"?: {} } }`.
Mutações exigem cookie `access` + header `X-Requested-With: fetch`. Rate limit: 10 req/min em `/auth/*`, 120 req/min por usuário no resto (in-memory por processo no MVP; Redis fora do escopo).

### Auth
| Método | Rota | Body | Resposta |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, name, acceptedTerms: true }` | 201 `{ user }` + cookies |
| POST | `/auth/login` | `{ email, password }` | 200 `{ user }` + cookies |
| POST | `/auth/refresh` | — (cookie) | 200, rotaciona refresh |
| POST | `/auth/logout` | — | 204 |
| DELETE | `/me` | `{ password, anonymizeCertificates: bool }` | 204 (LGPD) |

### Perfil e progresso
| Método | Rota | Resposta |
|---|---|---|
| GET | `/me` | `{ id, name, email, xp, level, bytes, nextLevelXp, activeSeconds, badges: [id], upgrades: [id] }` |
| GET | `/progress` | `{ phases: [{ phaseId, completed, bestTimeS, bestScore, completions, activeSeconds }] }` |
| GET | `/content/version` | `{ contentVersion }` (cliente compara com bundle) |

### Sessão de fase e eventos
| Método | Rota | Body | Resposta |
|---|---|---|---|
| POST | `/phases/{phaseId}/start` | — | 201 `{ sessionId, seed }` |
| POST | `/sessions/{sessionId}/events` | `{ events: [{ type, clientTs, payload }] }` (lote, máx 100) | 200 `{ accepted: n, rejected: [{ index, reason }], xpDelta, bytesDelta, level, newBadges: [] }` |
| POST | `/sessions/{sessionId}/terminals/{terminalId}/answer` | `{ attemptNo, answer }` | 200 `{ correct, explanation, xpDelta, newBadges }` — servidor regera a questão da seed e valida |
| POST | `/sessions/{sessionId}/complete` | `{ clientTs, stats }` | 200 `{ accepted, reasons?, xpDelta, bytesDelta, level, newBadges, phaseProgress }` |

Tipos de evento e checagens de plausibilidade (`services/plausibility.py`):
- `phase_started` — implícito no `start`.
- `enemy_killed { enemyType, weapon, wasStrongCounter }` — rejeita se contagem por tipo > `maxKills` da fase.
- `pickup_collected { kind, wasFake }`.
- `terminal_answered` — só via rota dedicada (revalidada).
- `phase_completed` — só via `/complete`; rejeita se `now - started_at < minTime`, se terminais obrigatórios não têm acerto registrado, ou se `clientTs` diverge > 5 min do servidor.
- `player_died`, `mitm_interference`, `weapon_fired { weapon }` (agregado por lote, para badge Patch Only).

### Tempo ativo
| POST | `/heartbeat` | `{ clientTs, phaseId? , visible: true, hadInput: true }` | 204 |

Regra: crédito = `min(30, now − último heartbeat)`; se lacuna > 90 s, crédito 0. Soma em `active_time` total e por fase.

### Loja e badges
| GET | `/upgrades` | `{ catalog: [...], owned: [id], bytes }` |
| POST | `/upgrades/{id}/buy` | 200 `{ owned, bytes }` / 402 `insufficient_bytes` / 409 `requirements_not_met` |
| GET | `/badges` | `{ catalog: [...], earned: [{ id, earnedAt }] }` |

### Certificado
| GET | `/certificates/eligibility` | `{ eligible, requirements: [{ key, met, current, required }] }` |
| POST | `/certificates` | `{ fullName, acceptTerms: true }` → 201 `{ code, url }` (uma vez; nome imutável; o aceite dos termos do certificado é obrigatório e registrado) |
| GET | `/certificates/{code}.pdf` | PDF (dono autenticado) |
| GET | `/verify/{code}` | público, JSON `{ valid, signatureOk, fullName, activeHours, issuedAt, modules, revoked }` |
| GET | `/.well-known/certificate-public-key` | chave Ed25519 pública (PEM) |

Página `/verificar/{codigo}` no front consome `/verify/{code}`.

---

## 5. Regras de progressão (servidor, espelhadas em `packages/sim/progression` para exibir previsão no cliente)

| Evento | XP | Bytes |
|---|---|---|
| Abate (arma base) | 5 | 1–3 (drop) |
| Abate com contramedida correta | 8 | — |
| Terminal correto 1ª tentativa | 60 | 10 |
| Terminal correto em tentativa posterior | 20 | 0 |
| Fase concluída | 150 | 50 |
| Bônus sem morrer | +50 | — |
| Bônus dentro do parTime | +50 | — |

Level: `xpParaNivel(n) = 100 · n^1.5` (acumulado). Slots de upgrade: `1 + floor(level / 2)`.

---

## 6. Ordem de implementação (marcos)

Cada marco entrega: código rodando de ponta a ponta, testes verdes (`pnpm test` / `pytest`), README atualizado. Paro ao fim de cada um para confirmação.

**M1 — Engine FPS numa sala de teste**
1. Scaffold do monorepo, Vite, TS estrito, ESLint, Vitest, Playwright.
2. `packages/sim`: rng, grid, movimento (WASD, pulo, sprint/stamina, colisão com grid), hitscan, arma Patch Pistol, dano, FSM de 1 inimigo (Worm sem replicação), pathfinding A*.
3. `apps/web`: PointerLockControls, render do grid/procedural, inimigo como mesh primitivo, HUD (HP, escudo, munição, mira), áudio sintetizado para tiro/dano.
4. Testes: movimento, colisão, hitscan, FSM, A*. Smoke Playwright: página carrega, canvas presente.

**M2 — Fases via JSON; fases 0 e 1**
1. Schemas JSON + validação no build.
2. Loader JSON→World, fluxo briefing→explore→terminal→arena→debrief, checkpoints, portas, spawners.
3. Terminais: múltipla escolha e associação; geradores `mac_ip_match`, `network_basics_mc`; feedback com explicação no erro; tela de morte com explicação.
4. Worm com replicação. Fases 0 (tutorial) e 1 (LAN).
5. Sessão local (sem backend): progresso em `localStorage` atrás de uma interface `ProgressStore` que o M3 troca pela API.

**M3 — Backend**
1. FastAPI, modelos, Alembic, auth (argon2, JWT cookies, refresh rotativo), rate limit.
2. Rotas de sessão, eventos, terminais (geradores Python espelho + teste de conformidade com TS), `/complete`, plausibilidade, XP/level.
3. Cliente: `net/`, fila de eventos com retry, login/registro, `ProgressStore` remoto.
4. Docker Compose completo (web/api/db) + nginx.

**M4 — Hub, loja, upgrades, badges**
1. Hub: mapa de fases, perfil, loja, vitrine de badges.
2. `upgrades.json` + efeitos aplicados no `sim`; MFA (segunda chance) e Backup (checkpoint extra).
3. `badges.json` + avaliador no servidor sobre eventos/contadores.

**M5 — Fases 2 a 5**
Rootkit + Scanner (fase 2, gerador `subnet_same_network`); MITM + VPN Shield (fase 3, `dns_http_mc`); Botnet + Firewall Cannon com terminal de regras que altera spawns (fase 4, `firewall_rules`); Brute Forcer + MFA/lockout (fase 5, `password_strength`).

**M6 — Tempo ativo e certificado**
Heartbeat com Page Visibility + input; agregação no servidor; elegibilidade; emissão (WeasyPrint, Ed25519, QR); página `/verificar/{codigo}`; fluxo de confirmação de nome + aceite dos termos.

**M7 — Fases 6 a 9, boss, balanceamento**
Phisher (fase 6, `phishing_classify`); Trojan (fase 7); Injector + Sanitizer (fase 8); Ransomware boss + ciclo de resposta a incidente (fase 9). Balanceamento com testes de simulação headless (bots rodando fases N vezes e medindo tempo/mortes). Acessibilidade: remapeamento, sensibilidade, legendas, formas distintas por inimigo.

---

## 7. Premissas e pontos em aberto

- **Idade**: sem fluxo de consentimento de responsável. Jogo livre para todas as idades; a emissão do certificado exige apenas o aceite explícito dos termos (decisão do usuário em 2026-09-15).
- **Gabarito no cliente**: para feedback imediato, o gerador roda no cliente (o bundle sabe a resposta). O servidor recalcula da seed e é a autoridade para XP. Isso é proporcional ao anti-cheat pedido.
- **Rate limit** em memória por processo (sem Redis). Suficiente para 1 réplica da API.
- **Preact**: não incluído no M1. Avalio no M4 se o hub justificar.
- **Chave Ed25519**: gerada uma vez, lida de variável de ambiente/arquivo montado no container; nunca commitada.
- **Testes de conformidade TS↔Python** dos geradores são o ponto mais frágil do design; por isso ganham teste automatizado com fixtures compartilhadas em `packages/content/fixtures/generators/`.

