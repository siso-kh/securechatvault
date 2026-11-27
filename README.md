# SecureChat Vault

A MERN chat application that detects and masks secrets **before** any text reaches an
LLM. A React client talks to an Express API; the API asks a dedicated Node redactor
service to scan every message against administrator-managed regex policies, then sends
only the masked text to a Python gateway that routes the request across free model
providers with automatic failover. Admins get a console for policies, users, and audit
logs, and every user gets a personal redaction report.

The core rule is **fail closed**: if policies cannot be loaded, none are active, or the
redactor is unreachable, the message is rejected. Unredacted text is never forwarded.

---

## 1. Services at a glance

| Service | Directory | Runtime | Default port | Responsibility |
|---|---|---|---|---|
| Client (SPA) | `client/` | React 19 + Vite 8 | `5173` | UI, routing, auth session, calls the REST API |
| Backend API | `server/` | Node.js + Express 5 + Mongoose 9 | `5000` | Auth/RBAC, CRUD, redaction orchestration, stats, audit |
| Redactor | `redactor/` | Node.js + Express 5 | `4000` | Applies regex policies, returns masked text + detections |
| LLM gateway | `prior-router/gateway/` | Python + FastAPI | `8090` | OpenAI-compatible endpoint; routes by task, fails over, quarantines bad models |
| Router pipeline / SDK | `prior-router/src/`, `prior-router/agent_tool/` | Python | — | Discovers/ranks free models, produces catalogues; thin client SDK |
| MongoDB | external | MongoDB | `27017` | Users, conversations, policies, redaction events, audit logs |

```
Browser
  │  HTTP /api  (Vite dev proxy or nginx)
  ▼
┌─────────────────────────────┐        ┌────────────────────────┐
│ client :5173                │        │ MongoDB :27017         │
│ React SPA                   │        │ users, conversations,  │
└─────────────┬───────────────┘        │ policies, events, logs │
              │ REST + JWT             └───────────▲────────────┘
              ▼                                    │ Mongoose
┌─────────────────────────────┐                    │
│ server :5000                │────────────────────┘
│ Express API                 │
│  ├─ POST /api/chat ─────────┼──► redactor :4000  (POST /redact)
│  └─ POST /api/chat ─────────┼──► gateway  :8090  (POST /v1/chat/completions)
└─────────────────────────────┘          │
                                         ▼
                                  Free model providers
                                  (OpenRouter, Bynara)
```

Only the client is meant to be public. The backend, redactor, gateway, and Mongo are
internal services in a real deployment.

---

## 2. The message flow, end to end

This is the path that matters most; every service below exists to support it.

1. **User sends a message.** The chat page posts to `POST /api/chat` with the message
   history and an optional `conversationId`. The API also accepts an optional router
   task (`general`, `coding`, `reasoning`, `vision`), though the current client does
   not send one and therefore gets the `general` chain.
2. **Ownership check.** The backend verifies the JWT, then — if a conversation id was
   given — loads it with `{ _id, userId }` so a user can never post into someone
   else's conversation. Unknown ids return `404`.
3. **Load active policies.** `policyService.getActive()` reads enabled policies from
   MongoDB (cached for 15 s) and orders them `block → mask → warn`, with a stable
   tie-break on id. This ordering matters because the first matching rule claims a
   span.
4. **Redact outbound text.** For every message, the backend calls
   `POST http://redactor:4000/redact` with `{ text, rules }`. The redactor returns
   `{ maskedText, detections, blocked, servedBy }`.
5. **Apply the policy outcome.**
   - `block` rule hit → the API returns `422 CONTENT_BLOCKED` with the detections
     (blocking rule first) and logs the events. Nothing is sent upstream.
   - redactor down/timeout/invalid response → `503`/`500`, nothing is sent upstream.
   - otherwise → continue with masked text only.
6. **Call the LLM.** The backend posts the **masked** messages to the gateway at
   `POST /v1/chat/completions`, model `router/auto` (or `router/auto:<task>`).
7. **Gateway routing.** The gateway picks the ranked chain for the task, skips
   quarantined models, and tries each upstream until one succeeds. Provider keys and
   errors are redacted; failures feed the in-memory quarantine ledger.
8. **Persist.** The backend saves the assistant reply and the masked user message to
   the conversation, writes one `RedactionEvent` per detection (category, rule, action,
   batch id — **never the matched value**), and returns the OpenAI-shaped response plus
   `conversation_id`, `masked_messages`, and `redactor_report`.
9. **Render.** The client replaces the typed text with the masked version, shows the
   assistant reply, and surfaces blocked/rejected states with a `BlockedNotice`.

Optional: `redact_response: true` also runs the assistant reply through the same
pipeline before returning it (off by default).

---

## 3. Repository layout

```
securechat-vault/
├── client/                     React SPA (+ Vite config, Playwright tests)
│   ├── src/
│   │   ├── pages/              auth, user, and admin screens
│   │   ├── components/         chat, common, policies, users, report
│   │   ├── services/           one module per API area (axios)
│   │   ├── context/            AuthContext (session in localStorage)
│   │   ├── routes/             AppRouter, ProtectedRoute, AdminRoute
│   │   ├── layouts/            AppShell, AdminLayout
│   │   └── styles/             Tailwind v4 + per-page CSS
│   ├── tests/e2e/              Playwright admin-policy flows
│   ├── playwright.config.js
│   └── vite.config.js          dev server + /api proxy to :5000
├── server/                     Express API
│   ├── src/
│   │   ├── app.js              middleware + route mounting
│   │   ├── index.js            env load, DB connect, listen
│   │   ├── config/db.js        Mongoose connection
│   │   ├── routes/             auth, conversations, chat, policies, users,
│   │   │                       audit, stats, health
│   │   ├── controllers/        auth, conversation, policy, user, audit
│   │   ├── services/           policyService, redactorPipeline,
│   │   │                       redactorClient, routerClient
│   │   ├── models/             User, Conversation, Policy,
│   │   │                       RedactionEvent, AuditLog
│   │   ├── middlewares/        auth/JWT + role guard, error handler
│   │   └── utils/              regexSafety, audit helper
│   ├── scripts/                start_stack, seed, integration scripts
│   ├── tests/                  Jest + supertest (unit/API/workflow)
│   └── postman/                Newman collection + environment
├── redactor/                   Redaction microservice
│   ├── src/
│   │   ├── app.js              HTTP contract
│   │   ├── engine.js           rule application + overlap logic
│   │   ├── rules.js            optional default rule set (library/tests)
│   │   └── utils/luhn.js       card-number validation
│   └── tests/                  Jest tests
├── prior-router/               Python router + gateway
│   ├── gateway/                FastAPI gateway, catalogues, ledger
│   ├── src/llm_circuit_router/ discovery, benchmarks, ranking, failover
│   ├── agent_tool/             thin SDK for calling ranked models
│   └── tests/                  pytest suite (offline)
├── docs/
│   ├── API_CRUD_REPORT.md      CRUD matrix + every endpoint + Postman guide
│   └── architecture/           original project description/design document
├── k8s/                        namespace, ConfigMap/Secret and Deployments +
│   │                           Services for mongo, redactor, prior-router,
│   │                           backend, frontend; plus the seed Job
│   └── examples/               secret template (copy, fill, never commit)
├── docker-compose.yml          full local stack: mongo, seed, redactor,
│                               prior-router, backend, frontend
├── .env.example                Compose variables/template
└── README.md
```

> `docs/architecture/PROJECT_DESCRIPTION.md` describes the original design
> (Gemini/Groq direct calls, Docker Compose, Minikube). The implementation has since
> moved to the `prior-router` gateway. The Compose and Kubernetes manifests described
> in sections 9 and 10 are the supported deployment paths; treat this README as the
> source of truth for what actually runs.

---

## 4. Client (`client/`)

A Vite + React 19 single-page app styled with Tailwind v4 tokens and plain CSS files
under `src/styles/`.

**Startup.** `src/main.jsx` mounts `App`; `App.jsx` nests `AuthProvider` inside
`BrowserRouter` and renders `AppRouter`. The router defines public routes (`/auth`,
`/admin/login`), a protected user area wrapped in `AppShell`, and an admin area
wrapped in `AdminRoute` + `AdminLayout`.

| Route | Page | Access |
|---|---|---|
| `/auth` | `AuthPage` | public; login or register |
| `/admin/login` | `AdminLogin` | public; passcode unlock |
| `/` | `HomePage` | user |
| `/chat/:id?` | `ChatPage` | user |
| `/history` | `HistoryPage` | user |
| `/report` | `ReportPage` | user |
| `/admin/dashboard` | `AdminDashboard` | admin |
| `/admin/policies` | `AdminPolicies` | admin |
| `/admin/users` | `UsersPage` | admin |
| `/admin/audit` | `AdminAudit` | admin |

**Session.** `AuthContext` stores `{ token, user }` in `localStorage` under
`vault_session` and exposes `login`, `register`, `adminLogin`, `logout`, `user`, and
`token`. `ProtectedRoute` redirects to `/admin/login` for admin paths and `/auth`
otherwise when there is no session; `AdminRoute` redirects non-admins to
`/admin/login`.

**HTTP layer.** `src/services/http.js` creates an axios instance with
`baseURL = VITE_API_URL || '/api'`. A request interceptor attaches the bearer token;
a response interceptor clears the session and redirects to the right login page on
`401`, or on `403 Account banned`. Each API area has a thin service module
(`auth`, `conversations`, `chat`, `policies`, `users`, `audit`, `stats`).

**Mock mode.** Setting `VITE_USE_MOCK=true` swaps `auth` and `chat` for local mocks
(`auth.mock.js`, `chat.mock.js`) so the UI can run without a backend.

**Chat state.** `hooks/useChat.js` wraps the chat flow (messages, loading, error,
`send`, `load`). `ChatPage` reopens a conversation by id, accepts a first message
passed through router state from `HomePage`, and writes the returned conversation id
into the URL. `services/chat.js` maps API failures to friendly messages:
`422 CONTENT_BLOCKED` → `BlockedError`, `503` → "nothing was sent", `502` → AI
unavailable.

**Admin screens.**
- `AdminPolicies` lists policies from `GET /api/policies`, supports create, edit
  (name, regex, category, severity, action), enable/disable, and delete with a
  confirmation dialog.
- `UsersPage` lists/searches users, toggles role with a single click-to-cycle button
  (`user ↔ admin`, calling `PATCH /api/users/:id/role`), bans/unbans, and deletes.
  Your own row is not actionable.
- `AdminAudit` renders `GET /api/audit` newest first with client-side search.
- `AdminDashboard` is currently a static welcome panel.

**Build.** `npm run build` emits static assets; `npm run lint` runs ESLint;
`npm run test:e2e:ui` runs Playwright against a live stack (see [Testing](#11-testing)).

---

## 5. Backend API (`server/`)

**Boot.** `src/index.js` loads `server/.env`, connects to MongoDB, and listens on
`PORT` (5000). `src/app.js` applies `helmet`, `cors`, and a 100 kB JSON body limit,
mounts the route groups, returns JSON `404`s, and ends with the centralized error
handler.

**Auth and roles.** `middlewares/auth.js` verifies the JWT and attaches
`{ id, role }` to `req.user`. `requireRole('admin')` guards all policy, user, and
audit routes. Conversation CRUD includes `userId` in every Mongo query so ownership
is enforced by the query itself; the chat handler performs an explicit owner lookup
before forwarding. Tokens are signed by `authController` with `JWT_SECRET` and
`JWT_EXPIRES_IN` (default `1d`).

**Login paths.**
- `POST /api/auth/register` → bcrypt-hashed user, returns a JWT + public user.
- `POST /api/auth/login` → email + password; banned accounts get `403`.
- `POST /api/auth/admin-login` → **passcode only**. The account is resolved from
  `ADMIN_EMAIL` (falling back to the first admin) and the passcode is bcrypt-compared
  to that account's stored hash. The client never sends an email.
- `GET /api/auth/me` → current user (the SPA does not currently call it).

**Redaction services.**
- `services/redactorClient.js` owns the HTTP call to the redactor with a 5 s timeout
  and translates failures into typed errors: blocked (`422`), unavailable (network,
  timeout, `5xx`), bad input (`400`), invalid response shape. It also treats a `200`
  with `blocked: true` as a block so text can never slip through.
- `services/redactorPipeline.js` loads policies, redacts every message, enriches
  detections with rule name/severity, and converts errors into `ChatRedactionError`
  with the API status/code (`422 CONTENT_BLOCKED`, `503 NO_ACTIVE_POLICIES` /
  `POLICIES_UNAVAILABLE` / `REDACTOR_UNAVAILABLE`, `500` redactor contract errors).
- `services/policyService.js` caches active rules for `POLICY_CACHE_TTL_MS` (15 s),
  sorts by action priority, and is invalidated after any policy write. With multiple
  API replicas, other replicas converge within the TTL.
- `services/routerClient.js` calls the gateway with a 2-minute timeout, requires
  `GATEWAY_KEY`, relays `X-Router-*` headers, and maps upstream/unavailable failures
  to the API's `502`/upstream status.

**Chat handler.** `routes/chatRoutes.js` performs the ownership check, redacts,
calls the gateway with masked messages, relays router headers, optionally redacts the
assistant reply, then persists the masked exchange and detection metadata. Only the
metadata is logged: `{ userId, conversationId, batchId, ruleId, category, action }`.

**Stats.** `GET /api/stats/me` aggregates `RedactionEvent`s by `batchId` (one row per
message), joins conversation titles and surviving policy names/severities, derives a
status (`blocked > masked > warned`), counts mask actions, and counts user messages
sent across the user's conversations.

**Audit.** `utils/audit.js` writes an `AuditLog` for every admin mutation. It never
throws: a failed audit write is logged to the console but does not fail the action.
Actions recorded: `user.role_change`, `user.ban`, `user.unban`, `user.delete`,
`policy.create`, `policy.update`, `policy.toggle`, `policy.delete`.

**Regex safety.** Before a policy is created or its pattern changed,
`validatePattern` rejects invalid regexes, patterns that match the empty string,
nested quantifiers (`(a+)+`), patterns longer than 200 characters, and patterns that
exceed a 100 ms sandboxed timeout on adversarial probes.

**Models.**

| Collection | Key fields | Notes |
|---|---|---|
| `users` | `email` (unique), `passwordHash`, `name`, `role`, `isBanned` | passwords bcrypt-hashed (10 rounds) |
| `conversations` | `userId`, `title`, `messages[]` | messages embedded; each has `role`, `content`, `maskedContent`, `redacted`, `createdAt` |
| `policies` | `name` (unique), `pattern`, `category`, `severity`, `action`, `enabled`, `createdBy` | category normalized to `UPPER_SNAKE_CASE`; pattern max 200 chars |
| `redaction_events` | `userId`, `conversationId`, `batchId`, `ruleId`, `category`, `action` | metadata only, indexed by user/category/date |
| `audit_logs` | `actorId`, `action`, `target`, `meta` | admin traceability, newest-first index |

---

## 6. Redactor (`redactor/`)

A deliberately small stateless service: it receives text plus rules and returns the
result. It has no database and no knowledge of users.

**HTTP contract**

```
POST /redact
{ "text": "my key is sk-live-...", "rules": [ { "id", "pattern", "category", "action" } ] }

200 { "maskedText": "my key is [API_KEY]",
      "detections": [ { "ruleId", "category", "severity", "action", "start", "end" } ],
      "blocked": false,
      "servedBy": "<container hostname>" }

400  text missing/not a string, or rules not an array
GET /health → { status: "ok", service: "redactor", servedBy }
```

**How `applyRules` works**

1. Iterate rules **in the order supplied**. Each pattern is compiled with `gi`.
   Invalid regexes are skipped (the admin layer validates them first); empty matches
   advance `lastIndex` to avoid infinite loops.
2. Optional validators run before a detection is accepted; `luhn` strips separators
   and validates card numbers.
3. A match that overlaps an existing detection is usually ignored. A `block` match is
   always recorded (even over a mask); a mask yields only to an overlapping
   non-block, never to a block.
4. `blocked` is true if any detection has action `block`.
5. Text is rebuilt from the end backwards so indices stay valid. `mask` replaces the
   span with `[CATEGORY]`; `warn` leaves the text intact and only reports;
   `block` also leaves the text but the caller must reject the message.
6. `servedBy` is `os.hostname()`, which makes load balancing visible when replicas
   are scaled.

**Policy source.** Live traffic uses the policies the backend sends in `rules`.
`src/rules.js` (`DEFAULT_RULES`) is a library/test rule set and is not applied by the
HTTP handler when `rules` is `[]`. The seed script creates a comparable starter set in
MongoDB.

**Resource limits.** `engine.js` defines `MAX_RULES = 50` and
`MAX_PATTERN_LENGTH = 500` and exports `validateRules`, but the current `POST /redact`
handler only checks that `text` is a string and `rules` is an array. Per-rule caps are
therefore advisory until the handler calls the validator; the backend's own
`regexSafety` and `Policy` schema enforce the practical limits.

**Why a separate service.** It keeps a security-critical, CPU-bound concern isolated,
lets it scale independently, and lets the backend fail closed without duplicating the
matching engine.

---

## 7. LLM gateway (`prior-router/gateway/`)

A FastAPI service that speaks the OpenAI Chat Completions API and hides the provider
pool behind two model names: `router/auto` and `router/auto:<task>`.

**Startup (`app.py`).** Reads `GATEWAY_KEY` (refuses to start without it), loads the
per-task catalogues from `gateway/catalogues/{task}.json`, and fails with a clear
message if any file is missing or no task has a usable model. `GET /healthz` is
liveness; `GET /readyz` is readiness.

**Catalogues (`catalog.py`).** Each task file is a pre-ranked list of
`{ name, base_url, api_key_env, score }`. At load time the gateway resolves
`api_key_env` against `.env` + process environment and **skips** entries whose key is
missing or whose fields are malformed, logging a warning. Catalogues are
secret-free; only env var names are stored.

**Routing (`_resolve`).**
- A model id that does not start with `router/` is treated as a pinned model and must
  exist in the loaded index, otherwise `400`.
- `router/auto` uses the task from `X-Router-Task`, defaulting to `general`.
- `router/auto:coding` (etc.) selects that task; an unknown task returns `400`.
- `vision` chains are built only from models with vision capability by the pipeline.

**Request handling.**
1. Authenticate `Authorization: Bearer <GATEWAY_KEY>` with a constant-time compare;
   failure is `401`.
2. Reject non-JSON/invalid bodies and `stream: true` (`501` in this build).
3. Walk the ranked chain. Quarantined models are skipped and recorded in the attempt
   list. Each remaining model is called at `{base_url}/chat/completions` with the
   concrete model id substituted for `router/*`.
4. Success → reset its failure counter, record latency, return the provider payload
   with `X-Router-Model`, `X-Router-Task`, `X-Router-Hops`, `X-Router-Attempts`, and
   `X-Router-Latency-Ms` (plus `X-Request-Id` when supplied).
5. Failure → record it (only for `429`/`5xx`/network/malformed JSON) and try the next
   model. A normal `4xx` means the prompt is bad for that model, so it is returned to
   the caller without quarantining.
6. If every model fails, return `502` with `code: all_upstreams_failed` and the full
   attempt list.

**Quarantine (`ledger.py`).** In-memory, per process: after
`QUARANTINE_THRESHOLD` consecutive failures (default 3) a model is quarantined for
`QUARANTINE_SECONDS` (default 900). A success clears its state. Multi-instance
deployments would need a shared store (Redis) with the same three methods.

**Other endpoints.** `GET /v1/models` lists `router/auto` plus every loaded model;
`GET /v1/router/status` returns chains and quarantine state; `POST /v1/admin/reload`
reloads catalogues atomically and swaps only after a successful load.

**Upstream safety (`upstream.py`).** The only module that talks to providers. Provider
errors and request exceptions pass through `redact_secrets` before logging, so a key
echoed back by a provider never reaches logs or the client.

---

## 8. Router pipeline and SDK (`prior-router/src`, `agent_tool/`)

The gateway consumes the output of a separate offline pipeline. Each stage reads one
JSON artifact and writes the next, so stages can be rerun independently:

| Stage | Command | Output |
|---|---|---|
| 1. Discover free models | `python -m src.llm_circuit_router.run_discovery` | `pending.json` |
| 2a. Download benchmarks | `python -m src.llm_circuit_router.fetch_raw_benchmarks` | `artificial_analysis_models.json` |
| 2b. Compile capabilities | `python -m src.llm_circuit_router.compile_capabilities` | `model_capabilities.json` |
| 3. Probe liveness | `python -m src.llm_circuit_router.run_health_check` | `reliability_ledger.json` |
| 4. Build registry | `python -m src.llm_circuit_router.generate_final_registry` | `final_model_registry.json` |
| 5. Build gateway chains | `python -m gateway.build_catalogues` | `gateway/catalogues/{task}.json` |

Ranking is `benchmark score × reliability score` per task. The gateway catalogue keeps
the top two models per task (plus a general chain derived from overall scores).

`agent_tool` is a thin SDK (`configure_ai()` + `ModelContext`) that lets any Python
project resolve a credential-free fallback chain from its own `.env` and
`models.toml`. See `prior-router/README.md` for the full pipeline and SDK reference.

---

## 9. Running locally

### Prerequisites

- Node.js 20+ and npm
- Python 3.10+ (for the gateway and pipeline)
- MongoDB reachable at `mongodb://localhost:27017/securechat` (local install or
  container)
- A `GATEWAY_KEY` value of your choosing, identical in `server/.env` and
  `prior-router/.env`

### 1. Configure

```bash
cp server/.env.example server/.env
cp redactor/.env.example redactor/.env
cp client/.env.example client/.env
cp prior-router/.env.example prior-router/.env
```

Fill in at least:

- `server/.env`: `MONGO_URI`, `JWT_SECRET`, `GATEWAY_KEY`, and for seeding
  `ADMIN_EMAIL`, `ADMIN_PASSWORD` (8+ chars), optional `ADMIN_NAME`. Optional:
  `PORT`, `REDACTOR_URL`, `GATEWAY_URL`, `POLICY_CACHE_TTL_MS`.
- `prior-router/.env`: `GATEWAY_KEY` (same value), plus `OPENROUTER_API_KEY` /
  `NARA_API_KEY` for the providers named in the catalogues.
- `client/.env`: usually just `VITE_API_URL=/api` and `VITE_USE_MOCK=false`.

Install dependencies:

```bash
cd server    && npm install && cd ..
cd redactor  && npm install && cd ..
cd client    && npm install && cd ..
cd prior-router && python -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements.txt && cd ..
```

On macOS/Linux use `.venv/bin/python` instead of `.venv/Scripts/python.exe`.

### 2. Build the gateway catalogues

The gateway refuses to start without them. They are generated from a router registry:

```bash
cd prior-router
.venv/Scripts/python.exe -m gateway.build_catalogues
```

If `final_model_registry.json` does not exist, run the pipeline stages first (see
section 8) or create the catalogue JSON files by hand.

### 3. Seed the admin and starter policies

```bash
cd server
npm run seed
```

This creates/updates the admin identified by `ADMIN_EMAIL` and inserts the starter
policy set with upserts, so re-running never overwrites admin edits. The admin login
screen accepts only the passcode (which is compared against that account's bcrypt
hash).

### 4. Start everything

```bash
cd server
npm start
```

`scripts/start_stack.js` starts, in order:

1. the Python gateway on `GATEWAY_URL` (reusing it if `/readyz` is already healthy),
2. the redactor on `REDACTOR_URL`,
3. the Express API on `PORT`.

It validates `GATEWAY_KEY`, waits for readiness, supervises the children, and stops
what it started on Ctrl+C. If a service is already running and healthy it is reused.
To start **only** the API, use `npm run start:server` (or `npm run dev` for watch
mode) and run the redactor/gateway yourself.

### 5. Start the client

```bash
cd client
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to
`http://127.0.0.1:5000`, preserving the prefix.

### Starting services individually

```bash
# redactor
cd redactor && npm start

# gateway (from prior-router, with GATEWAY_KEY exported or in .env)
cd prior-router && .venv/Scripts/python.exe -m uvicorn gateway.app:app --host 127.0.0.1 --port 8090

# API only
cd server && npm run dev
```

---

## 10. Deployment (Docker Compose and Kubernetes)

There are two supported ways to run the whole stack in containers. Both use the
per-service `Dockerfile`s and the same application contracts; only the orchestration
and networking layer differ.

| Service | Dockerfile | Listens on | Kubernetes image |
|---|---|---|---|
| Client (nginx) | `client/Dockerfile` | `8080` | `securechat-client:local` |
| Backend API | `server/Dockerfile` | `5000` | `securechat-server:local` |
| Redactor | `redactor/Dockerfile` | `5001` | `securechat-redactor:local` |
| LLM gateway | `prior-router/Dockerfile` | `8090` | `securechat-prior-router:local` |
| MongoDB | upstream `mongo:7` | `27017` | `mongo:7` |

Those are the ports Compose and Kubernetes actually configure. Running a service
directly still uses its own default (for example the redactor listens on `4000`).

The client container is not a Vite dev server: it serves the built SPA from
`nginx-unprivileged` and proxies `/api/` to `http://backend:5000` (see
`client/nginx.conf`). That hostname only resolves inside Compose/Kubernetes.

### 10.1 Environment contract

Every service reads plain environment variables; nothing is baked into the images.
This table is the quickest way to understand why a deployment can be "up" but broken.

| Variable | Read by | Compose value | Kubernetes source |
|---|---|---|---|
| `MONGO_URI` | backend, seed | built from `MONGO_USER` / `MONGO_PASSWORD` | Secret `MONGO_URI` |
| `MONGO_INITDB_ROOT_USERNAME` / `..._PASSWORD` | mongo image | `MONGO_USER` / `MONGO_PASSWORD` | Secret `MONGO_ROOT_*` |
| `REDACTOR_URL` | backend | `http://redactor:5001` | ConfigMap `REDACTOR_URL` |
| `GATEWAY_URL` | backend | `http://prior-router:5002` | ConfigMap `GATEWAY_URL` (`:8090`) |
| `GATEWAY_KEY` | backend, redactor, gateway | `.env` (required) | Secret `GATEWAY_KEY` |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | backend | `.env` | Secret / default |
| `OPENROUTER_API_KEY`, `GROQ_API_KEY` | gateway | `.env` (at least one) | Secret (optional keys) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | seed, admin login | `.env` | Secret / ConfigMap |

Two details that regularly cause failures:

- **Container hostnames, not `localhost`.** Inside a container, `localhost` is the
  container itself. Use `mongo`, `redactor`, `backend`, `prior-router` (Compose service
  names = Kubernetes Service names) or the connection fails with
  `ECONNREFUSED 127.0.0.1:27017`.
- **Compose and Kubernetes use different gateway ports.** Compose sets `PORT=5002` for
  `prior-router`; Kubernetes uses the image default `8090`. Consumers never hardcode
  it — they follow `GATEWAY_URL`. The redactor is `5001` in both.

### 10.2 Docker Compose

Compose builds the four application images (the backend and seed share the server
image), creates the `internal` network (no egress except for the gateway), and starts
the stack in dependency order using container healthchecks.

```
                       docker compose up --build
                                  │
                 ┌────────────────┼─────────────────┐
                 ▼                ▼                 ▼
            mongo :27017     redactor :5001    prior-router :5002
            (healthcheck:    (healthcheck:     (healthcheck:
             mongosh ping)    wget /health)     curl /healthz)
                 │                │                 │
                 └────────────────┴────────┬────────┘
                                           ▼
                                   backend :5000
                                  (healthcheck /health)
                                           │
                                           ▼
                              frontend nginx :8080
                              published on host :8082
                                           │
                     seed (one-shot, after mongo healthy)
                     inserts 10 policies + admin, then exits
```

1. Create the root `.env` (Compose reads this file, not `server/.env`):

   ```bash
   cp .env.example .env
   ```

   Fill in `MONGO_USER`, `MONGO_PASSWORD`, `JWT_SECRET`, `GATEWAY_KEY`, at least one
   provider key, and `ADMIN_EMAIL` / `ADMIN_PASSWORD` (8+ characters). Compose uses
   `${VAR:?message}` for the required values, so a missing key stops the start instead
   of booting a container with an empty credential.

2. Build and start:

   ```bash
   docker compose up --build -d
   docker compose ps
   ```

   Expected: `mongo`, `redactor`, `prior-router`, `backend`, `frontend` are `running`
   (or `healthy`), and `seed` is `exited (0)`. The seed container runs
   `node scripts/seed.js` once, creates the admin from `ADMIN_*`, and inserts the
   default policy set. Re-running it is safe: existing policies are never overwritten.

3. Use the app at **http://localhost:8082** (host port 8082 → container 8080; 8080/8081
   are commonly occupied on Windows). Admin login is `/admin/login`, and the passcode
   is the seeded `ADMIN_PASSWORD`.

4. Verify and inspect:

   ```bash
   docker compose logs -f backend
   docker compose exec backend wget -qO- http://127.0.0.1:5000/health
   docker compose exec backend wget -qO- http://redactor:5001/health
   docker compose exec backend wget -qO- http://prior-router:5002/healthz
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8082/
   ```

5. Stop, keeping or dropping data:

   ```bash
   docker compose down          # keep the mongo-data volume
   docker compose down -v       # also delete users/conversations/policies
   ```

### 10.3 Kubernetes

The manifests in `k8s/` deploy the same images into the `securechat-vault` namespace
with one replica per service. ClusterIP Services provide stable DNS names; only the
frontend is exposed (NodePort).

```
                              browser
                                 │
                NodePort 30428 / minikube tunnel / port-forward
                                 ▼
                    ┌──────────────────────────┐
                    │ Service  frontend        │  NodePort 80 → 8080
                    └────────────┬─────────────┘
                                 │ nginx proxies /api/ → backend:5000
                    ┌────────────▼─────────────┐
                    │ Service  backend         │  ClusterIP :5000
                    └───┬──────────────────┬───┘
          REDACTOR_URL  │                  │  GATEWAY_URL
             ┌──────────▼───────┐   ┌──────▼─────────────┐
             │ Service redactor │   │ Service prior-router│
             │ :5001            │   │ :8090               │
             └──────────────────┘   └──────┬──────────────┘
                                           │ HTTPS
                                           ▼
                                  free model providers
             ┌──────────────────────────┐
             │ Service mongo :27017     │◄──── MONGO_URI
             └──────────────────────────┘
```

| File | Objects | Notes |
|---|---|---|
| `00-namespace.yaml` | Namespace | `securechat-vault` |
| `01-configmap.yaml` | ConfigMap | `REDACTOR_URL`, `GATEWAY_URL`, `ADMIN_EMAIL`, log level |
| `02-secret.yaml` | Secret | local values only — never commit real credentials |
| `03-mongo.yaml` | Deployment + Service | `mongo:7`, probes run an authenticated `ping` |
| `04-redactor.yaml` | Deployment + Service | `PORT=5001`, probes `/health` |
| `05-prior-router.yaml` | Deployment + Service | `PORT=8090`, probes `/healthz`, optional provider keys |
| `06-backend.yaml` | Deployment + Service | `PORT=5000`, `wait-for-mongo` initContainer, probes `/health` |
| `07-frontend.yaml` | Deployment + Service | nginx on 8080, NodePort 80 → `targetPort: 8080` |
| `08-seed-job.yaml` | Job | one-shot seed with the same `wait-for-mongo` initContainer |

Startup order is enforced without `depends_on` (Kubernetes has none):

```
mongo starts ──► readiness: mongosh "<MONGO_URI>" → ping
      ├─ backend initContainer waits for the same ping, then the API starts
      ├─ seed Job initContainer waits, then runs scripts/seed.js (policies + admin)
      └─ redactor / prior-router start independently and self-report via probes
```

#### 1. Provide the Secret

`k8s/02-secret.yaml` is git-ignored (see `.gitignore`), so your local copy never
reaches the repository — only the template is committed. For a fresh cluster, copy
the template and fill it in:

```bash
cp k8s/examples/secret.example.yaml k8s/02-secret.yaml   # then edit values
```

Required keys: `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`, `MONGO_URI`,
`JWT_SECRET`, `GATEWAY_KEY`; provider keys (`OPENROUTER_API_KEY`, `GROQ_API_KEY`) are
optional at the manifest level but the gateway needs at least one to route; `ADMIN_*`
are optional (without them the seed still inserts the default policies but creates no
admin). `MONGO_URI` must point at the Service name and include `authSource=admin`:

```
mongodb://<user>:<password>@mongo:27017/securechat?authSource=admin
```

Percent-encode the password if it contains `@ : / # $`.

#### 2. Build and load the images

The manifests use `imagePullPolicy: IfNotPresent` with local tags. With minikube, build
straight into the cluster's image store:

```bash
minikube image build -t securechat-server:local       ./server
minikube image build -t securechat-redactor:local     ./redactor
minikube image build -t securechat-prior-router:local ./prior-router
minikube image build -t securechat-client:local       ./client
```

On another cluster, push the same tags to a registry and change the `image:` fields (or
run `eval $(minikube docker-env)` and build with `docker build`).

#### 3. Apply the manifests

```bash
kubectl apply -f k8s/
```

Manifests are ordered by filename, so the Namespace, ConfigMap and Secret exist before
the workloads that reference them. The seed Job runs once; **Jobs are immutable**, so
re-applying after the template changes fails until you delete it:

```bash
kubectl delete job -n securechat-vault securechat-seed --ignore-not-found
kubectl apply -f k8s/08-seed-job.yaml
```

#### 4. Open the site

With the Docker driver on Windows the minikube IP/NodePort is **not reachable from the
host**; use a tunnel. Both options below are verified:

```bash
# Option A: minikube opens a tunnel and the browser (keep the terminal open)
minikube service -n securechat-vault frontend

# Option B: port-forward, then open http://localhost:18080
kubectl port-forward -n securechat-vault svc/frontend 18080:80
```

Avoid host port `8080` on Windows — it often falls in a reserved range and another
process already answers there. On a cluster with a routable node, the NodePort is
`http://<node-ip>:<nodePort>`; read it with:

```bash
kubectl get svc -n securechat-vault frontend -o jsonpath='{.spec.ports[0].nodePort}'
```

The UI is `/`, user auth is `/auth`, and admin sign-in is `/admin/login` with
`ADMIN_PASSWORD`.

#### 5. Verify the deployment

```bash
# every workload ready, seed Completed
kubectl get pods,svc,jobs -n securechat-vault -o wide

# every Service has at least one endpoint (no selector/port typos)
kubectl get endpoints -n securechat-vault

# backend reached Mongo instead of falling back to localhost
kubectl logs -n securechat-vault deploy/backend --tail=20     # "MongoDB connected"

# seed actually ran
kubectl logs -n securechat-vault job/securechat-seed           # policies: 10 added

# full in-cluster chain, from inside the backend pod
kubectl exec -n securechat-vault deploy/backend -- sh -c \
  'wget -qO- http://redactor:5001/health; echo; \
   wget -qO- http://prior-router:8090/healthz; echo; \
   wget -qO- http://backend:5000/health; echo'

# public path through the frontend proxy
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:18080/
```

Expected: all pods `1/1 Running`, the Job `1/1 Complete`, all five Services with
endpoints, `MongoDB connected` in the backend log, `policies: 10 added` in the seed log,
and three `{"status":"ok"}` bodies.

#### 6. Redeploy, inspect, tear down

```bash
# after changing backend code
minikube image build -t securechat-server:local ./server
kubectl rollout restart -n securechat-vault deploy/backend
kubectl rollout status  -n securechat-vault deploy/backend

# why is a pod restarting?
kubectl describe pod -n securechat-vault -l app=backend
kubectl get events -n securechat-vault --sort-by=.lastTimestamp | tail -20

# remove everything
kubectl delete namespace securechat-vault
```

Rolling the mongo Deployment recreates its pod; because it mounts an `emptyDir`, that
discards users, conversations and policies. Re-run the seed Job afterwards, or move
Mongo to a PVC/StatefulSet if the data matters.

### 10.4 Troubleshooting the containerized stack

| Symptom | Cause | Fix |
|---|---|---|
| Backend logs `Mongo not reachable yet: ECONNREFUSED 127.0.0.1:27017` | `MONGO_URI` unset, so `db.js` falls back to localhost | Provide `MONGO_URI` in the Secret/`.env` |
| Backend exits with `GATEWAY_KEY is required` | `GATEWAY_KEY` missing (checked at require time) | Add it to the Secret/`.env`; it must match the gateway's |
| `502` on `POST /api/chat` | Backend cannot reach the gateway (`GATEWAY_URL` wrong host/port) | Match the Service port: `8090` in Kubernetes, `5002` in Compose |
| `503 REDACTOR_UNAVAILABLE` | `REDACTOR_URL` points at the wrong port/service | Use `http://redactor:5001` |
| Seed Job `Failed`, `0/1` | Same missing `MONGO_URI` (or Mongo not ready) | Fix the Secret; the `wait-for-mongo` initContainer handles readiness |
| `field is immutable` on the Job | Job pod templates cannot be updated in place | `kubectl delete job ...` then re-apply |
| Site unreachable at `192.168.49.2:30428` | Docker driver on Windows does not route node IPs | `minikube service ...` or `kubectl port-forward` |
| `bind: An attempt was made to access a socket ... forbidden` | Host port in a Windows reserved range (commonly 8080) | Forward another port, e.g. `18080:80` |
| UI loads but `/api/...` 404s | nginx proxies to `backend:5000`; the Service must be named `backend` on 5000 | Keep Service name/port or edit `client/nginx.conf` |
| Data disappears after a rollout | Mongo uses `emptyDir` | Accept for dev, or switch to a PVC/StatefulSet |

---

## 11. API surface

All routes are prefixed `/api` except health. `Authorization: Bearer <jwt>` is required
where noted. Full request/response bodies and Postman instructions are in
[`docs/API_CRUD_REPORT.md`](docs/API_CRUD_REPORT.md).

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/health` | public | backend liveness |
| POST | `/api/auth/register` | public | create user, return JWT |
| POST | `/api/auth/login` | public | email/password login |
| POST | `/api/auth/admin-login` | public | admin passcode login |
| GET | `/api/auth/me` | user | current user profile |
| GET | `/api/conversations` | user | list own conversations |
| POST | `/api/conversations` | user | create conversation |
| GET | `/api/conversations/:id` | owner | read one conversation |
| PUT | `/api/conversations/:id` | owner | rename conversation |
| DELETE | `/api/conversations/:id` | owner | delete conversation |
| POST | `/api/chat` | user | redact, call LLM, persist exchange |
| GET | `/api/stats/me` | user | personal redaction report |
| GET | `/api/policies` | admin | list policies |
| POST | `/api/policies` | admin | create policy |
| PUT | `/api/policies/:id` | admin | update policy |
| PATCH | `/api/policies/:id/enabled` | admin | enable/disable |
| DELETE | `/api/policies/:id` | admin | delete policy |
| GET | `/api/users` | admin | list/search users (`search`, `limit`) |
| PATCH | `/api/users/:id/role` | admin | change role (not self) |
| PATCH | `/api/users/:id/ban` | admin | ban/unban (not self-ban) |
| DELETE | `/api/users/:id` | admin | delete user (not self) |
| GET | `/api/audit` | admin | recent admin actions |

### Failure behavior of `POST /api/chat`

| Status | Code | Meaning |
|---|---|---|
| `422` | `CONTENT_BLOCKED` | a `block` policy matched; detections returned |
| `503` | `NO_ACTIVE_POLICIES` | no enabled policy; fail closed |
| `503` | `POLICIES_UNAVAILABLE` | policy read failed; fail closed |
| `503` | `REDACTOR_UNAVAILABLE` | timeout/network/5xx from redactor; fail closed |
| `500` | `REDACTOR_BAD_INPUT` / `REDACTOR_INVALID_RESPONSE` | integration bug |
| `502` | — | gateway unreachable |
| gateway status | — | upstream error relayed with `redactor_report` |

---

## 12. Testing

| Suite | Location | Command | Notes |
|---|---|---|---|
| Backend unit/API | `server/tests` | `cd server && npx jest --runInBand` | mongodb-memory-server; no live services |
| Backend live integration | `server/tests/integration.test.js` | `npm run test:integration` | requires live stack (`REQUIRE_LIVE_SERVICES=true`) |
| Backend workflow (live) | `server/tests/workflow.e2e.test.js` | `npx jest tests/workflow.e2e.test.js --runInBand` | needs Mongo + redactor + gateway |
| Redactor | `redactor/tests` | `cd redactor && npm test` | engine, rules, Luhn, HTTP contract |
| Router/gateway | `prior-router/tests` | `cd prior-router && pytest` | offline, no credentials |
| Client E2E | `client/tests/e2e` | `cd client && npm run test:e2e:ui` | Playwright with installed Chrome; needs backend + seeded admin + redactor, reuses a running Vite server or starts one |

Playwright logs in through the admin passcode screen. Set `ADMIN_PASSCODE` if the
seeded admin password differs from the test default, and `E2E_BASE_URL` to point at a
non-default host. Tests clean up policies whose names start with `E2E rule`.

Additional backend scripts: `npm run test:workflow`, `npm run test:full-pipeline`, and
`npm run test:api` (Newman against `server/postman/`).

---

## 13. Security model

- **No raw secrets upstream.** Every message is redacted before the gateway call; the
  API refuses to proceed when redaction is unavailable or unconfigured.
- **No raw secrets at rest.** `RedactionEvent` stores category/rule/action metadata only.
- **Least privilege.** Policy, user, and audit routes are admin-only; conversations and
  chat are scoped to the owner; admins cannot demote, ban, or delete themselves.
- **Credential handling.** bcrypt password hashes, JWT with expiry, constant-time
  gateway key comparison, provider keys resolved from env and redacted from gateway
  logs/errors.
- **Policy safety.** Admin-supplied regexes are validated for syntax, empty matches,
  nested quantifiers, and catastrophic backtracking before they reach the redactor.
- **Network isolation (intended).** Only the client should be public; backend,
  redactor, gateway, and Mongo stay internal.
- **Auditability.** Every admin mutation produces an audit record without being able
  to break the mutation if the write fails.

---

## 14. Current limitations and notes

- Kubernetes runs MongoDB on an `emptyDir`, so users, conversations and policies are
  lost whenever the mongo pod is recreated. Use a PVC/StatefulSet for persistence.
- The Kubernetes manifests are a dev/demo deployment: one replica per service, locally
  built `securechat-*:local` images, no Ingress and no resource requests/limits.
- `k8s/02-secret.yaml` is git-ignored and must stay that way: commit only the
  template in `k8s/examples/secret.example.yaml`, and rotate any key that has already
  been pushed.
- The gateway's quarantine ledger is in-memory per process. Multiple gateway
  instances do not share failure state.
- Catalogue files are snapshots. Models rotate and free quotas expire; rebuild the
  registry and catalogues periodically with the pipeline.
- `GET /api/stats/me` is the only stats endpoint; the admin dashboard is static and
  there is no global analytics or service-health endpoint.
- Streaming is rejected by the gateway (`501`); the client uses non-streaming
  completions.
- The redactor's `POST /redact` does not yet call `validateRules`, so its per-rule caps
  are not enforced at the HTTP boundary.
- `docs/architecture/PROJECT_DESCRIPTION.md` is the original design brief and includes
  features (Gemini/Groq, global stats, Compose, Kubernetes) that differ from the
  current implementation.

---

## 15. Further documentation

- [`docs/API_CRUD_REPORT.md`](docs/API_CRUD_REPORT.md) — CRUD matrix, every endpoint,
  Postman environment/run order, example bodies, and negative cases.
- [`prior-router/README.md`](prior-router/README.md) — pipeline stages, ranking,
  failover session, SDK, and sandbox demos.
- [`docs/architecture/PROJECT_DESCRIPTION.md`](docs/architecture/PROJECT_DESCRIPTION.md)
  — original scope, data model rationale, and cloud/security objectives.
