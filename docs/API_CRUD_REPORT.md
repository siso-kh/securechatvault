# SecureChat Vault — CRUD & API Report

Scope: the whole application — Express backend (`server/`), React client (`client/`), redaction service (`redactor/`), and model router gateway (`prior-router/gateway`).

- **Backend base URL (direct):** `http://localhost:5000`
- **Through Vite dev proxy:** `http://localhost:5173/api` (the SPA uses this; `/api` is forwarded to `:5000`)
- **Auth:** JWT in `Authorization: Bearer <token>`. Two privileged scopes: any signed-in user, and `admin`.
- **Content type:** `application/json` everywhere. Backend body limit is 100 kb.
- **Admin account:** `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `server/.env` (seeded via `npm run seed`); the admin passcode login uses `ADMIN_PASSWORD` (`aaazzzeee` in dev).

---

## 1. CRUD at a glance

| Resource | Create | Read | Update | Delete | Persistence |
|---|---|---|---|---|---|
| **Accounts** | `POST /api/auth/register` (public) | `GET /api/auth/me` (self), `POST /api/auth/login`, `POST /api/auth/admin-login` | — (no profile/password edit endpoint) | — (self-service) | `users` |
| **Users (admin)** | — (invite removed) | `GET /api/users` | `PATCH /api/users/:id/role`, `PATCH /api/users/:id/ban` | `DELETE /api/users/:id` | `users` |
| **Conversations** | `POST /api/conversations`; also auto-created by `POST /api/chat` | `GET /api/conversations`, `GET /api/conversations/:id` | `PUT /api/conversations/:id` (rename); chat appends messages | `DELETE /api/conversations/:id` | `conversations` |
| **Messages** | only via `POST /api/chat` | via `GET /api/conversations/:id` | — | only via conversation delete | embedded in `conversations.messages` |
| **Policies (redaction rules, admin)** | `POST /api/policies` | `GET /api/policies` | `PUT /api/policies/:id`, `PATCH /api/policies/:id/enabled` | `DELETE /api/policies/:id` | `policies` |
| **Redaction events** | internal only (`POST /api/chat`) | aggregated by `GET /api/stats/me` | — | — | `redactionevents` |
| **Audit log** | internal only (admin actions) | `GET /api/audit` | — | — | `auditlogs` |
| **Report / stats** | — | `GET /api/stats/me` | — | — | derived |
| **Health** | — | `GET /health` | — | — | — |

### Where each CRUD lives in the UI

- **Accounts:** `/auth` (register + login), `/admin/login` (passcode-only admin).
- **Users:** `/admin/users` — list/search, click role to flip User ↔ Admin, Ban/Unban, Delete (inline confirm). Your own row cannot be demoted/banned/deleted.
- **Conversations:** `/chat` (list, send, rename, delete), `/history`.
- **Policies:** `/admin/policies` — add-rule drawer, edit, enable toggle, delete with confirm.
- **Audit:** `/admin/audit` — searchable, newest first.
- **Report:** `/report` — per-message redaction history from `/api/stats/me`.

### What is *not* CRUD-able (by design)

- **Redaction events** are written by the chat pipeline only; there is no endpoint to edit or delete them.
- **Audit logs** are append-only; only the admin list endpoint exists.
- **Messages** have no standalone endpoint — they are appended by chat and removed with their conversation.
- **Self-service account updates** (name/password change) and **invites** do not exist.

---

## 2. Endpoint reference

All routes below are under `http://localhost:5000`. `🔒` = Bearer JWT required, `👑` = admin role required.

### Health

| # | Method | Path | Auth | Body / query | Success | Errors |
|---|---|---|---|---|---|---|
| 1 | GET | `/health` | — | — | `200 {status:"ok",service:"backend"}` | — |

### Auth

| # | Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|---|
| 2 | POST | `/api/auth/register` | — | `{ "name", "email", "password" }` | `201 { token, user:{id,email,name,role:"user"} }` | `400` validation / invalid email; `409` `Email already in use` |
| 3 | POST | `/api/auth/login` | — | `{ "email", "password" }` | `200 { token, user }` | `401 Invalid email or password`; `403 Account banned` |
| 4 | POST | `/api/auth/admin-login` | — | `{ "passcode" }` | `200 { token, user }` | `400 Passcode is required`; `401 Invalid passcode`; `403 Account banned` |
| 5 | GET | `/api/auth/me` | 🔒 | — | `200 { user:{id,email,name,role} }` | `401 Missing/invalid token` |

Notes:

- Registration always creates a `user`; promotion happens only through the admin endpoint.
- Admin login resolves the account from `ADMIN_EMAIL` (fallback: first admin) and bcrypt-compares the passcode; the client never sends an email.
- `/api/auth/me` is available but the SPA currently relies on the session object returned by login instead of calling it.

### Conversations (any signed-in user, own data only)

| # | Method | Path | Auth | Body / query | Success | Errors |
|---|---|---|---|---|---|---|
| 6 | POST | `/api/conversations` | 🔒 | `{ "title"?: string }` (default `New conversation`) | `201 { conversation }` | `401`; `400` validation |
| 7 | GET | `/api/conversations` | 🔒 | — | `200 { conversations:[{_id,title,createdAt,updatedAt}] }` (no message bodies) | `401` |
| 8 | GET | `/api/conversations/:id` | 🔒 | — | `200 { conversation }` (includes `messages[]`) | `404 Conversation not found`; `400 Invalid id format` |
| 9 | PUT | `/api/conversations/:id` | 🔒 | `{ "title": string }` | `200 { conversation }` | `404`; `400` validation / invalid id |
| 10 | DELETE | `/api/conversations/:id` | 🔒 | — | `200 { deleted:true }` | `404`; `400 Invalid id format` |

Ownership is part of every query, so another user's id returns `404`, not `403`.

### Chat (the redaction workflow)

| # | Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|---|
| 11 | POST | `/api/chat` | 🔒 | see below | `200` — LLM response plus `conversation_id`, `masked_messages`, `redactor_report` | `400` `messages[] is required`; `404` conversation not found/owned; `422` `CONTENT_BLOCKED`; `503` `NO_ACTIVE_POLICIES` / `POLICIES_UNAVAILABLE` / `REDACTOR_UNAVAILABLE`; `502` `Router unavailable` |

Request body:

```json
{
  "messages": [{ "role": "user", "content": "My badge is EMP-654321 and mail is a@b.co" }],
  "conversationId": "optional — omit to create a new conversation",
  "task": "optional — maps to router/auto:<task>",
  "model": "optional — overrides router/auto",
  "temperature": 0.7,
  "max_tokens": 512,
  "redact_response": false
}
```

Behaviour to expect:

- All messages go through the redactor with the **active DB policies** before the gateway call.
- **No active policy → 503** (`NO_ACTIVE_POLICIES`), nothing is sent.
- Block rule match → **422** with `redactor_report.detections` (blocking rule first); the message is not forwarded and the block event is logged.
- Redactor/gateway failures fail closed (`503` / `502`).
- On success the masked user message and assistant reply are appended to the conversation, and one `RedactionEvent` per detection is stored (category/rule/action only — never the matched value).
- `redact_response: true` also masks the assistant's reply (off by default).

### Policies (admin only)

| # | Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|---|
| 12 | GET | `/api/policies` | — | `200 { policies:[…] }` (newest first) | `401`; `403` |
| 13 | POST | `/api/policies` | `{ "name", "pattern", "category", "severity"?, "action", "enabled"? }` | `201 { policy }` | `400` `INVALID_PATTERN`; `400` validation; `409` duplicate name |
| 14 | PUT | `/api/policies/:id` | any of `name`, `pattern`, `category`, `severity`, `action`, `enabled` | `200 { policy }` | `404 Policy not found`; `400 INVALID_PATTERN`/validation |
| 15 | PATCH | `/api/policies/:id/enabled` | `{ "enabled": true\|false }` | `200 { policy }` | `400` `"enabled" (boolean) is required`; `404` |
| 16 | DELETE | `/api/policies/:id` | — | `200 { deleted:true }` | `404` |

Field rules:

- `name`: 1–80 chars, **unique**.
- `pattern`: string, ≤ 200 chars, validated by `utils/regexSafety`; invalid regex → `400 INVALID_PATTERN`.
- `category`: normalized to uppercase snake case (`"api key"` → `API_KEY`), must be 2–40 chars starting with a letter; becomes the `[CATEGORY]` placeholder.
- `severity`: `low | medium | high` (default `medium`).
- `action`: `mask | block | warn` (required).
- `enabled`: boolean, default `true`. Only enabled policies reach the redactor; order is block → mask → warn.

### Users (admin only)

| # | Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|---|
| 17 | GET | `/api/users` | `?search=&limit=` (limit 1–100, default 50) | `200 { users:[{id,email,name,role,isBanned,createdAt}], total }` | `401`; `403` |
| 18 | PATCH | `/api/users/:id/role` | `{ "role": "user"\|"admin" }` | `200 { user }` | `400` invalid role / `SELF_ROLE_CHANGE`; `404` |
| 19 | PATCH | `/api/users/:id/ban` | `{ "isBanned": true\|false }` | `200 { user }` | `400` invalid / `SELF_BAN`; `404` |
| 20 | DELETE | `/api/users/:id` | — | `200 { deleted:true }` | `400 SELF_DELETE`; `404` |

Notes: `search` matches email or name, case-insensitive. Password hashes are never returned. Banning blocks login with `403 Account banned` and the SPA clears the session on any `403 Account banned`.

### Audit log (admin only)

| # | Method | Path | Query | Success | Errors |
|---|---|---|---|---|---|
| 21 | GET | `/api/audit` | `?limit=` (1–200, default 50), `?action=`, `?actorId=` | `200 { logs:[{id,action,target,meta,createdAt,actor:{id,email,name}\|null}] }` | `401`; `403` |

Recorded actions: `user.role_change`, `user.ban`, `user.unban`, `user.delete`, `policy.create`, `policy.update`, `policy.toggle`, `policy.delete`.

### Report / stats (any signed-in user)

| # | Method | Path | Auth | Success |
|---|---|---|---|---|
| 22 | GET | `/api/stats/me` | 🔒 | `200 { totals:{messagesSent,protectedCount}, items:[{id,createdAt,conversationId,title,status,categories,maskedCount,ruleName,severity}] }` |

`items` is one entry per chat message batch (max 200, newest first); `status` is `blocked | masked | warned`.

---

## 3. Internal service APIs (for debugging the pipeline)

These are not called by the browser, but they are what the backend talks to and are useful to test in Postman.

### Redactor — `http://localhost:4000`

| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/health` | — | `200 {status:"ok",service:"redactor",servedBy}` |
| POST | `/redact` | `{ "text": string, "rules"?: [{ "id", "pattern", "category", "severity", "action" }] }` | `200 { maskedText, detections, blocked, servedBy }` |

- `rules` omitted → the service's built-in default rules.
- A `block` match returns `200` with `blocked: true`; the backend converts that to `422 CONTENT_BLOCKED`.
- `400` if `text` is missing or `rules` is not an array.
- Rule actions used by the backend: `mask | warn | block` (unknown actions are neither masked nor blocked). Invalid regex patterns in a rule are skipped by the engine; the backend validates policy patterns before saving them.

### Gateway — `http://127.0.0.1:8090`

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/chat/completions` | OpenAI-style; requires `Authorization: Bearer $GATEWAY_KEY`; backend uses 120 s timeout |
| GET | `/v1/models` | available models |
| GET | `/healthz`, `/readyz` | liveness / readiness |
| GET | `/v1/router/status` | routing state |
| POST | `/v1/admin/reload` | reload routing config (admin) |

---

## 4. Postman: test all app calls manually

### 4.1 Environment

Create one environment with:

| Variable | Initial value |
|---|---|
| `baseUrl` | `http://localhost:5000` |
| `adminToken` | *(empty)* |
| `adminPasscode` | `aaazzzeee` |
| `userToken` | *(empty)* |
| `userEmail` | `tester_<timestamp>@example.com` |
| `userPassword` | `Password123!` |
| `policyId` | *(empty)* |
| `conversationId` | *(empty)* |
| `userId` | *(empty)* |

Set **Authorization → Bearer Token** to `{{adminToken}}` or `{{userToken}}` per request.

### 4.2 Suggested run order

1. `GET /health`
2. `POST /api/auth/admin-login` → save the token
3. `GET /api/policies` (should be non-empty; if empty, chat fails closed by design)
4. `POST /api/policies` → save `policyId`
5. `GET /api/users`
6. `POST /api/auth/register` → save `userToken`
7. `POST /api/chat` → save `conversationId`
8. `GET /api/conversations`, `GET /api/conversations/:id`, `PUT /api/conversations/:id`
9. `GET /api/stats/me`
10. `GET /api/audit` (admin)
11. `PATCH /api/users/:id/role`, `PATCH /api/users/:id/ban`, `DELETE /api/users/:id`
12. `PUT /api/policies/:id`, `PATCH /api/policies/:id/enabled`, `DELETE /api/policies/:id`
13. `DELETE /api/conversations/:id`

### 4.3 Auto-capture tokens and ids (Tests tab)

Admin login:

```js
pm.test('200 OK', () => pm.response.to.have.status(200));
pm.collectionVariables.set('adminToken', pm.response.json().token);
```

Register (unique email per run):

```js
pm.test('201 Created', () => pm.response.to.have.status(201));
pm.collectionVariables.set('userToken', pm.response.json().token);
pm.collectionVariables.set('userId', pm.response.json().user.id);
```

Create policy:

```js
pm.test('201 Created', () => pm.response.to.have.status(201));
pm.collectionVariables.set('policyId', pm.response.json().policy._id);
```

Send chat:

```js
pm.test('200 OK', () => pm.response.to.have.status(200));
pm.collectionVariables.set('conversationId', pm.response.json().conversation_id);
const masked = pm.response.json().masked_messages.at(-1).content;
pm.test('sensitive value was masked', () => pm.expect(masked).to.include('['));
```

### 4.4 Ready-made request bodies

Register:

```json
{ "name": "Tester", "email": "tester@example.com", "password": "Password123!" }
```

User login:

```json
{ "email": "tester@example.com", "password": "Password123!" }
```

Admin login:

```json
{ "passcode": "aaazzzeee" }
```

Create an Employee-ID rule:

```json
{
  "name": "Employee badge",
  "pattern": "EMP-[0-9]{6}",
  "category": "employee id",
  "severity": "high",
  "action": "mask"
}
```

Chat (mask test):

```json
{
  "messages": [
    { "role": "user", "content": "Badge EMP-654321, email a@b.co — keep this private." }
  ]
}
```

Chat (block test) — first create a rule with `"action": "block"` and a pattern that matches the text, then send it; expect `422` with `code: "CONTENT_BLOCKED"`.

Rename conversation:

```json
{ "title": "Renamed from Postman" }
```

Change role / ban / enable rule:

```json
{ "role": "admin" }
{ "isBanned": true }
{ "enabled": false }
```

### 4.5 Negative cases worth running

| Request | Expected |
|---|---|
| `GET /api/policies` with a user token | `403 Forbidden` |
| Any protected route without a token | `401 Missing token` |
| `POST /api/auth/login` wrong password | `401 Invalid email or password` |
| `POST /api/auth/register` duplicate email | `409 Email already in use` |
| `POST /api/policies` with `"pattern": "[unclosed"` | `400`, `code: INVALID_PATTERN` |
| `PATCH /api/users/:me/role` with `{"role":"user"}` | `400`, `code: SELF_ROLE_CHANGE` |
| `DELETE /api/users/:me` | `400`, `code: SELF_DELETE` |
| `PATCH /api/policies/:id/enabled` with `{"enabled":"yes"}` | `400` |
| Disable/delete every policy, then `POST /api/chat` | `503`, `code: NO_ACTIVE_POLICIES` |
| `GET /api/conversations/:id` for another user's conversation | `404 Conversation not found` |
| `POST /api/chat` with an empty `messages` array | `400 messages[] is required` |

### 4.6 Prerequisites for the chat requests

`POST /api/chat` needs the full stack:

- backend on `:5000` (with `JWT_SECRET`, `GATEWAY_KEY`, `REDACTOR_URL` in `server/.env`),
- redactor on `:4000`,
- gateway on `:8090`,
- at least one **enabled** policy in MongoDB.

Without the redactor or gateway, chat correctly fails closed with `503` / `502`; the CRUD endpoints still work without them. The existing importable collection `server/postman/my-auth-collection.json` covers health, auth and conversation CRUD; the redactor ships `redactor/postman/redact-collection.json`.
