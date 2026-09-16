# Fireshot: Defesa de Rede

FPS educacional de redes e cibersegurança. Cada setor da rede corporativa é uma fase com um
conceito (LAN, sub-redes, DNS/HTTPS, firewall, senhas, phishing…), uma ameaça que encarna esse
conceito e uma contramedida que só funciona se você entendeu a ideia. Entre os combates há
**terminais**: questões geradas a partir de uma seed, com explicação no erro. O servidor é a
autoridade para XP, badges, progresso e certificado.

UI e conteúdo em **pt-BR**.

## Pilha

| Parte | Tecnologia |
|---|---|
| `packages/sim` | simulação pura em TypeScript (sem DOM): grid, movimento, hitscan, IA, fases, terminais |
| `packages/content` | JSON do jogo (fases, inimigos, armas, upgrades, badges, bancos de questões) + schemas |
| `apps/web` | Preact + signals, Three.js (render neon procedural), Vite |
| `apps/api` | FastAPI + SQLAlchemy 2 async + PostgreSQL, Alembic, argon2id, JWT em cookie, WeasyPrint |

Monorepo pnpm. `PLAN.md` tem o plano completo (arquitetura, modelo de dados, contratos, marcos);
`CLAUDE_CHECKPOINT.md` registra o estado de cada sessão de trabalho.

## Rodando com Docker

```bash
cp .env.example .env                                     # ajuste JWT_SECRET e a senha do banco
openssl genpkey -algorithm ed25519 -out infra/cert-key.pem   # chave que assina os certificados
docker compose up --build                                # → http://localhost:8080
```

O nginx serve a SPA, a página pública `/verificar/{codigo}` e faz proxy de `/api` para a API.
A API roda `alembic upgrade head` no start.

## Desenvolvimento

```bash
pnpm install

# banco de desenvolvimento
docker run -d --name fireshot-pg -e POSTGRES_USER=fireshot -e POSTGRES_PASSWORD=fireshot \
  -e POSTGRES_DB=fireshot -p 55432:5432 postgres:16-alpine

# API (uv; sem pip no sistema)
cd apps/api && uv sync
DATABASE_URL=postgresql+asyncpg://fireshot:fireshot@localhost:55432/fireshot uv run alembic upgrade head
DATABASE_URL=postgresql+asyncpg://fireshot:fireshot@localhost:55432/fireshot COOKIE_SECURE=false \
  uv run uvicorn app.main:app --reload --port 8000

# front (proxy de /api → localhost:8000)
pnpm dev                                                 # → http://localhost:5173
```

Sem API no ar o front continua jogável em **modo sem conta** (tutorial e laboratório), só não
salva progresso.

## Testes

```bash
pnpm -r test                     # sim (72) + content (60) + web (29)
cd apps/api && uv run pytest -q  # 56 testes (conformidade TS↔Python, auth, sessão, loja, certificado)
cd apps/api && uv run ruff check .

cd apps/web && npx playwright test                 # E2E sem backend
E2E_API=1 npx playwright test e2e/api.spec.ts      # E2E com a API no ar
```

O E2E com backend precisa da API com `MIN_TIME_SCALE=0` (a checagem de tempo mínimo por fase
rejeitaria uma partida automatizada de poucos segundos).

Fixtures de conformidade (200 seeds por gerador, com sha256 da questão canônica e vereditos de
`checkAnswer`) ficam em `packages/content/fixtures/`. Depois de mudar um gerador:

```bash
cd packages/content && UPDATE_FIXTURES=1 npx vitest run test/fixtures.test.ts
cd apps/api && uv run pytest tests/test_conformance.py   # o espelho em Python precisa bater
```

## Como o anti-cheat funciona

O gerador roda no cliente (para dar feedback imediato, o bundle sabe o gabarito), mas **o servidor
regenera a questão a partir da seed da sessão** e revalida cada resposta; XP e badges saem só do
que ele aceitou. Eventos de jogo (abates, coletas, mortes) passam por checagens de plausibilidade
(armas disponíveis na fase, tetos de abates e bytes, taxa de abates, tempo) e a conclusão exige
tempo mínimo, terminais obrigatórios resolvidos e relógio do cliente coerente.

## Certificado

Emitido quando o jogador conclui todas as fases do currículo, acerta ≥ 70% dos terminais e acumula
o tempo ativo mínimo (padrão: 3 h, medido por heartbeats — `min(30 s, lacuna)`, lacuna > 90 s não
conta). O PDF (WeasyPrint) traz um QR para `/verificar/{codigo}`.

A assinatura Ed25519 cobre `holderHash = sha256(nome + salt)` em vez do nome em claro: a exclusão
de conta (LGPD) apaga nome e salt do banco **sem invalidar a assinatura**, e a página pública passa
a mostrar o titular como anonimizado. A chave pública fica em `/.well-known/certificate-public-key`.

É um certificado de conclusão livre, sem reconhecimento do MEC — o texto do PDF e os termos de
emissão dizem isso explicitamente.

## Acessibilidade

Remapeamento de teclas, sensibilidade e inversão de mira, legendas para o áudio, formas
geométricas distintas por tipo de ameaça (não só cor) e alto contraste na HUD.
