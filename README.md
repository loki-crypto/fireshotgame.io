# Fireshot: Defesa de Rede

**Jogue agora: <https://fireshot.vercel.app>** — no computador, com teclado e mouse.

![Tela inicial do Fireshot: escolha do agente em pixel art e as 10 fases da campanha](docs/tela-inicial.png)

FPS educacional de redes e cibersegurança. Cada setor da rede corporativa é uma fase com um
conceito (LAN, sub-redes, DNS/HTTPS, firewall, senhas, phishing…), uma ameaça que encarna esse
conceito e uma contramedida que só funciona se você entendeu a ideia. Entre os combates há
**terminais**: questões geradas a partir de uma seed, com explicação no erro. O servidor é a
autoridade para XP, badges, progresso e certificado.

São **10 fases**: tutorial, LAN, sub-redes (Rootkit/Scanner), DNS e HTTPS (MITM/VPN Shield),
firewall e DDoS (Botnet/Firewall Cannon), autenticação (Brute Forcer/lockout), phishing (Phisher),
trojan, injeção (Injector/Sanitizer) e o chefe Ransomware com ciclo de resposta a incidentes.
UI e conteúdo em **pt-BR**.

Com conta, você escolhe um agente em pixel art, sobe de nível, compra upgrades, disputa o rank
(geral e por fase) e, ao concluir o percurso, emite um certificado verificável. Sem conta dá para
jogar o tutorial e o laboratório de treino.

## Como jogar

| Ação | Tecla |
|---|---|
| Mover / pular / correr | `W` `A` `S` `D` / `Espaço` / `Shift` |
| Atirar / mirar | botão esquerdo / botão direito do mouse |
| Recarregar / interagir com terminal | `R` / `E` |
| Trocar de arma | `1` a `5` |
| Denunciar phishing / backup | `F` / `B` |
| Pausar | `P` |

Todas as teclas podem ser trocadas em **Configurações**, que também tem sensibilidade, campo de
visão, narração e "reduzir movimento". Em celular e tablet o site mostra um aviso: as fases não
funcionam com toque.

## Pilha

| Parte | Tecnologia |
|---|---|
| `packages/sim` | simulação pura em TypeScript (sem DOM): grid, movimento, hitscan, IA, fases, terminais |
| `packages/content` | JSON do jogo (fases, inimigos, armas, upgrades, badges, bancos de questões) + schemas |
| `apps/web` | Preact + signals, Three.js (render neon procedural), Vite |
| `apps/api` | FastAPI + SQLAlchemy 2 async + PostgreSQL, Alembic, argon2id, JWT em cookie, WeasyPrint |

Monorepo pnpm. `PLAN.md` tem o plano de arquitetura (modelo de dados, contratos e marcos).

## Rodando com Docker

```bash
cp .env.example .env                                     # ajuste JWT_SECRET e a senha do banco
openssl genpkey -algorithm ed25519 -out infra/cert-key.pem   # chave que assina os certificados
docker compose up --build                                # → http://localhost:8080
```

O nginx serve a SPA, a página pública `/verificar/{codigo}` e faz proxy de `/api` para a API.
A API roda `alembic upgrade head` no start. `WEB_PORT` troca a porta publicada (padrão 8080).

A imagem de produção **não** inclui os ganchos de teste (`window.__fireshot`), que dependem de
`VITE_E2E=1` no build — contra a pilha do compose rodam apenas os specs que não dirigem o jogo.

## Deploy na Vercel

Em produção: <https://fireshot.vercel.app>

Um projeto, dois serviços (`vercel.json`), servidos na mesma origem — o que faz os cookies de
sessão funcionarem sem CORS:

| Serviço | Como roda | Por quê |
|---|---|---|
| `web` | build estático do Vite | SPA + `verificar.html` |
| `api` | **container** (`Dockerfile.vercel`) | o PDF do certificado usa WeasyPrint, que precisa de cairo/pango — bibliotecas nativas que o runtime Python da Vercel não traz |

Banco: **Neon Postgres** (Marketplace). A URL vem no formato libpq, então
`normalize_database_url` a converte para o dialeto asyncpg, troca `sslmode` por `ssl` e desliga o
cache de prepared statements quando o endpoint é o pooler (PgBouncer em modo transação).

Variáveis obrigatórias em produção: `DATABASE_URL` (a integração do Neon preenche), `JWT_SECRET`,
`COOKIE_SECURE=true`, `TRUST_PROXY=true`, `CERT_PRIVATE_KEY_PEM` e `VERIFY_BASE_URL`.

```bash
vercel link --project fireshot
vercel integration add neon                  # provisiona o Postgres e injeta as variáveis
DATABASE_URL="$DATABASE_URL_UNPOOLED" uv run alembic upgrade head   # migração: endpoint direto
vercel deploy --prod
```

Duas coisas que a Vercel impõe e o projeto respeita:

- **Migração não roda no boot.** O container escala a zero e várias instâncias subiriam
  concorrentes; `alembic upgrade head` é executado no deploy, fora da imagem.
- **Container sem estado.** A primeira requisição depois de ~5 min sem tráfego paga um cold start
  (alguns segundos até o briefing aparecer), e o rate limit em memória passa a valer por instância.

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
pnpm -r test                     # sim (101) + content (99) + web (34)
cd apps/api && uv run pytest -q  # 110 testes (conformidade TS↔Python, auth, sessão, loja, certificado, rank, segurança)
cd apps/api && uv run ruff check .

cd apps/web && npx playwright test                 # E2E sem backend (inclui o aviso em celular)
E2E_API=1 npx playwright test e2e/api.spec.ts      # E2E com a API no ar
```

O E2E com backend precisa da API no ar com dois ajustes, porque uma partida automatizada dura
segundos: `MIN_TIME_SCALE=0` (desliga o tempo mínimo por fase) e `CERT_MIN_ACTIVE_HOURS=0`
(deixa o certificado elegível sem horas de heartbeat).

Fora do Docker, aponte também `CERT_PRIVATE_KEY_FILE` para `infra/cert-key.pem`: o `.env` da raiz usa
o caminho do segredo dentro do container (`/run/secrets/…`), e sem o ajuste a emissão do
certificado responde 500:

```bash
cd apps/api && DATABASE_URL=… COOKIE_SECURE=false MIN_TIME_SCALE=0 CERT_MIN_ACTIVE_HOURS=0 \
  CERT_PRIVATE_KEY_FILE=$PWD/../../infra/cert-key.pem uv run uvicorn app.main:app --port 8000
cd apps/web && E2E_API=1 npx playwright test
```

Fixtures de conformidade (200 seeds por gerador, com sha256 da questão canônica e vereditos de
`checkAnswer`) ficam em `packages/content/fixtures/`. Depois de mudar um gerador:

```bash
cd packages/content && UPDATE_FIXTURES=1 npx vitest run test/fixtures.test.ts
cd apps/api && uv run pytest tests/test_conformance.py   # o espelho em Python precisa bater
```

## Balanceamento

`packages/sim/test/balance.test.ts` roda um **bot headless** em cada fase, com três seeds: ele
resolve os terminais que alcança (A* do próprio jogo), varre ameaças ocultas com o Scanner, escolhe
a contramedida certa, caça as ondas das arenas e vai à saída. O teste falha se uma fase deixar de
ser concluível dentro do `parTime` ou se os abates passarem do teto de plausibilidade do servidor.

Em vez de morrer, o bot é "socorrido" quando a integridade cai — o número de socorros e o dano
tomado são a medida de pressão de cada fase, sem depender da perícia de combate do bot:

```
00-tutorial    tempo=16s (par 420s) resgates=0.0 abates=5  dano=14
01-lan         tempo=23s (par 600s) resgates=0.0 abates=9  dano=30
02-subnets     tempo=25s (par 660s) resgates=1.0 abates=9  dano=125
03-dns-https   tempo=33s (par 720s) resgates=1.0 abates=8  dano=138
04-firewall    tempo=30s (par 780s) resgates=0.0 abates=35 dano=40
05-auth        tempo=40s (par 780s) resgates=1.0 abates=5  dano=198
06-phishing    tempo=26s (par 780s) resgates=0.0 abates=14 dano=44
07-trojan      tempo=31s (par 780s) resgates=1.0 abates=15 dano=187
08-injection   tempo=23s (par 840s) resgates=0.0 abates=10 dano=26
09-ransomware  tempo=27s (par 900s) resgates=2.0 abates=1  dano=312
```

`packages/sim/test/mechanics.test.ts` cobre as mecânicas de ensino que não aparecem em número:
isca de phishing × comunicado legítimo (com denúncia e falso positivo), Trojan disfarçado revelado
pelo Scanner, Injector corrompendo terminal e Sanitizer limpando, e o chefe passando de oculto a
contido e exposto conforme o ciclo identificar → conter → erradicar.

## Segurança

| Risco | Proteção |
|---|---|
| Senha fraca ou vazada | argon2id; mínimo de 8 caracteres; senhas do topo dos vazamentos, repetições (`aaaaaaaa`) e nome/e-mail + números são recusados (`common_password`) |
| Força bruta distribuída | além do rate limit por IP (em memória, por instância), a tabela `login_throttle` trava o login do e-mail por 15 min após 10 erros em 15 min — vale entre instâncias e também para e-mails inexistentes |
| Descobrir quais e-mails têm conta pelo login | a resposta é a mesma e o argon2 roda mesmo sem conta (hash fictício), então o tempo não entrega nada |
| Roubo de sessão / CSRF | JWT curto e refresh rotativo em cookies `HttpOnly; Secure; SameSite=Lax`; mutações exigem `X-Requested-With: fetch`; sem CORS |
| XSS e clickjacking | CSP sem script inline (`script-src 'self'`), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e COOP no `vercel.json` e no nginx; a UI não usa `innerHTML` com dados |
| Injeção no PDF do certificado | nome e módulos passam por `html.escape` e o WeasyPrint só aceita `data:` — sem SSRF nem arquivo local anexado ao PDF |
| Personificação no rank | nomes reservados (`admin`, `suporte`, `fireshot…`) não podem ser usados |
| Abuso de armazenamento e memória | corpo máximo de 512 KB; teto por item no JSON gravado (evento 1 KB, resposta 8 KB, resumo 4 KB); o rate limit descarta IPs ociosos |
| Dados pessoais em cache | toda resposta da API sai com `Cache-Control: no-store` |
| Configuração esquecida | com `COOKIE_SECURE=true` a API **não sobe** se `JWT_SECRET` for o padrão ou tiver menos de 32 caracteres, nem com `MIN_TIME_SCALE < 1`; o Swagger só fica ligado fora de produção |
| Intermediário entre API e banco | TLS com verificação de certificado e hostname (`ssl.create_default_context()`), não só criptografia |
| IP forjado para escapar do limite | `X-Real-IP` primeiro; do `X-Forwarded-For` vale o último salto; o nginx sobrescreve o cabeçalho |
| Segredos no upload do deploy | `.vercelignore` exclui `.env*` e chaves `.pem` |

`pnpm audit` e `pip-audit` (dependências de produção da API) sem vulnerabilidades conhecidas em
2026-09-16. Os testes de regressão estão em `apps/api/tests/test_security.py`.

## Como o anti-cheat funciona

O gerador roda no cliente (para dar feedback imediato, o bundle sabe o gabarito), mas **o servidor
regenera a questão a partir da seed da sessão** e revalida cada resposta; XP e badges saem só do
que ele aceitou. Eventos de jogo (abates, coletas, mortes) passam por checagens de plausibilidade
(armas disponíveis na fase, tetos de abates e bytes, taxa de abates, tempo) e a conclusão exige
tempo mínimo, terminais obrigatórios resolvidos e relógio do cliente coerente.

## Agentes e rank

No cadastro a pessoa escolhe um **agente** (8 bonequinhos em pixel art 12×12) e um **nome de
jogador** único, que é o que aparece no rank — o e-mail nunca é exposto. A arte vive em
`packages/content/avatars.json` e `upgrade-icons.json` (um ícone por upgrade da loja): uma string
por fileira, um caractere por pixel e uma paleta por desenho. O cliente desenha em SVG
(`PixelArt.tsx`); o servidor só valida o id do agente.

O rank é público (`GET /api/v1/leaderboard` e `/leaderboard/{fase}`) e devolve o top 20 mais a
posição de quem está logado, mesmo fora do top:

- **por fase**: melhor tempo; no empate, quem concluiu primeiro;
- **geral**: mais fases concluídas; no empate, a menor soma dos melhores tempos — assim repetir só
  a fase mais fácil não sobe ninguém no rank.

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

- **Controles**: remapeamento completo (duas teclas por ação, mouse incluído), sensibilidade,
  inversão do eixo Y e campo de visão ajustável.
- **Leitura**: briefings com legendas sempre visíveis, velocidade de digitação ajustável e narração
  opcional por síntese de voz; toda explicação de terminal e de morte é texto, não só efeito visual.
- **Movimento**: "reduzir movimento" desliga tremor de câmera, balanço ao andar e a inclinação da
  arma — honrado no renderizador e no viewmodel.
- **Cor**: cada ameaça tem forma geométrica própria além da cor (um teste garante formas e cores
  únicas), e a HUD usa contraste alto com rótulos textuais.
- **Desempenho**: modo de qualidade reduzida para máquinas sem GPU dedicada.

## Contato

Dúvidas, sugestões, pedidos sobre dados pessoais (LGPD) e relatos de falhas de segurança:
**fireshotIO@gmail.com**. Se encontrar uma vulnerabilidade, escreva antes de divulgá-la — o
contato também está em [`/.well-known/security.txt`](https://fireshot.vercel.app/.well-known/security.txt).
