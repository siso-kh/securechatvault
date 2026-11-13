# SecureChat Vault: Project Description

> A MERN chat application that detects and masks sensitive data (passwords, API keys, IDs, emails, card numbers) **before** any message reaches an LLM, with an admin dashboard to manage detection policies and monitor leaks. Packaged as containers, run with Docker Compose, and orchestrated with Kubernetes (Minikube).

**Subjects covered:** Full Stack Development (MERN) and Virtualization and Cloud Computing (Proposition 2: containerization and orchestration).
**Team:** 2 students. **Duration:** 14 days (about 2h per day each).

---

## 1. Context and motivation

Employees and students paste text into AI assistants all the time, and that text often contains secrets: API keys, passwords, personal IDs, emails, internal URLs. Once sent to a third-party LLM, that data is out of their control.

**SecureChat Vault** places a security layer between the user and the LLM:

1. The user writes a message.
2. A dedicated **redactor microservice** scans it using rules (regex patterns) defined by an administrator.
3. Sensitive parts are masked, blocked, or flagged according to the policy.
4. Only the **masked** text is sent to the LLM. The LLM never sees the raw secrets.
5. Every detection is logged so the admin can see what is leaking and how often.

## 2. Objectives

**Full stack objectives**
- Build a complete MERN application with authentication, role-based access, and full CRUD.
- Show React hooks in real use cases (state, effects, context, refs, memoization, custom hooks).
- Use MongoDB with different kinds of data (documents, embedded arrays, logs, configuration).
- Provide both a user dashboard and an admin dashboard.

**Cloud objectives (Proposition 2)**
- Write optimized Dockerfiles (multi-stage, slim images, non-root users).
- Compose the full stack locally with Docker Compose (networks, volumes, environment files).
- Deploy on Kubernetes (Minikube) with Deployments, Services, Secrets, ConfigMaps, and a PersistentVolumeClaim.
- Demonstrate scalability by changing the replica count of a service live.

**Security objectives**
- Prevent sensitive data leakage to external AI services.
- Apply authentication, authorization (RBAC), input validation, rate limiting, and network isolation.

---

## 3. Architecture

### 3.1 Global diagram

```
                    ┌────────────────────────────┐
   Browser  ──────► │  React (nginx container)   │
                    └──────────────┬─────────────┘
                                   │ REST + JWT
                    ┌──────────────▼─────────────┐        ┌───────────────┐
                    │  Express API (Node)        │ ─────► │  LLM API      │
                    │  auth, CRUD, stats, RBAC   │ HTTPS  │ (Gemini/Groq) │
                    └───────┬─────────────┬──────┘        └───────────────┘
                            │             │ POST /redact
                  ┌─────────▼───┐   ┌─────▼──────────────┐
                  │  MongoDB    │   │ Redactor (Node)    │
                  │  + volume   │   │ regex rules, scale │
                  └─────────────┘   └────────────────────┘
```

### 3.2 Services

| Service | Role | Exposed? | Scalable? |
|---|---|---|---|
| `frontend` | Serves the React build through nginx | Yes (the only public entry) | Yes |
| `backend` | REST API: auth, CRUD, stats, orchestration of the message flow | Internal (reached through the frontend) | Yes (stateless, JWT) |
| `redactor` | Detects and masks sensitive data | Internal only | Yes (main scaling demo) |
| `mongo` | Persistent storage | Internal only | No (single instance with a volume) |

### 3.3 Message flow

1. The user sends `POST /conversations/:id/messages` with the raw text.
2. The backend loads the active policies from MongoDB.
3. The backend calls the redactor: `POST /redact { text, rules }`.
4. The redactor returns `{ maskedText, detections[], blocked }`.
5. The backend stores the detections in `redaction_events`.
6. If a rule with the action `block` was triggered, the message is rejected with an explanation. Otherwise, the masked text is sent to the LLM API.
7. The LLM reply and the masked user message are saved in the conversation, and the reply goes back to the user.

### 3.4 Network isolation

- **Public network:** only `frontend` is reachable from outside.
- **Internal network:** `backend`, `redactor`, and `mongo` talk to each other, but are not reachable from outside.
- `mongo` accepts connections only from `backend`.
- `redactor` accepts requests only from `backend`.

---

## 4. Functional description

### 4.1 Roles

| Role | Capabilities |
|---|---|
| **User** | Register and log in, chat with the AI, manage their own conversations, see their personal redaction statistics |
| **Admin** | Everything a user can do, plus: manage users, manage policies, see global statistics, see audit and health information |

### 4.2 User features
- Registration and login (JWT).
- Chat interface with a "typing..." state and a visual indicator on masked parts of a message.
- Conversation history: create, rename, read, and delete conversations.
- Personal dashboard: number of messages, number of redactions, most common data types.

### 4.3 Admin features
- **Users table:** list, search, change role, ban or delete.
- **Policy editor:** create, edit, enable or disable, and delete rules (name, regex, category, severity, action: `mask`, `block`, or `warn`).
- **Global charts:** redactions per day, top leaked data types, most active users.
- **Audit and health view:** recent admin actions and a status card for each service (up or down, replica count when available).

---

## 5. Data model (MongoDB)

| Collection | Type of data | Main fields |
|---|---|---|
| `users` | Profile and credentials | `email`, `passwordHash`, `name`, `role` (user/admin), `isBanned`, `createdAt` |
| `conversations` | Nested documents | `userId`, `title`, `messages[]` (each: `role`, `content`, `maskedContent`, `createdAt`), `updatedAt` |
| `policies` | Configuration | `name`, `pattern`, `category`, `severity`, `action` (mask/block/warn), `enabled`, `createdBy` |
| `redaction_events` | Log-style time data | `userId`, `conversationId`, `policyId`, `category`, `severity`, `action`, `createdAt` (never the raw value) |
| `audit_logs` (optional) | Admin traceability | `actorId`, `action`, `target`, `createdAt` |

Design notes:
- Messages are **embedded** in conversations because they are always read together.
- `redaction_events` is a separate collection because it is queried and aggregated across users.
- Raw secrets are **never stored** in `redaction_events`, only the category and metadata.
- Indexes: unique on `users.email`, and on `redaction_events` for `createdAt` and `category`.

---

## 6. Backend API (Express)

| Area | Routes | Access |
|---|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` | Public / authenticated |
| Conversations | `GET /conversations`, `POST /conversations`, `GET /conversations/:id`, `PUT /conversations/:id`, `DELETE /conversations/:id` | User (own data) |
| Messages | `POST /conversations/:id/messages` (redaction, then LLM) | User |
| Policies | `GET /policies`, `POST /policies`, `PUT /policies/:id`, `DELETE /policies/:id` | Admin (read by backend internally) |
| Users | `GET /users`, `PATCH /users/:id/role`, `PATCH /users/:id/ban`, `DELETE /users/:id` | Admin |
| Stats | `GET /stats/me`, `GET /stats/global` (aggregation pipelines) | User / Admin |
| Health | `GET /health` | Public (used by Docker and Kubernetes probes) |

**Middleware:** JWT verification, role-based access control, input validation (express-validator), rate limiting, centralized error handler, request logging.

---

## 7. Frontend (React)

### 7.1 Pages

| Page | Route | Access |
|---|---|---|
| Login / Register | `/login`, `/register` | Public |
| Chat | `/chat/:id?` | User |
| History | `/history` | User |
| My stats | `/stats` | User |
| Admin: users | `/admin/users` | Admin |
| Admin: policies | `/admin/policies` | Admin |
| Admin: analytics | `/admin/analytics` | Admin |
| Admin: audit and health | `/admin/system` | Admin |

React Router with protected and role-protected routes.

### 7.2 Hooks demonstration

| Hook | Where it is used |
|---|---|
| `useState` | Forms, input fields, modals |
| `useReducer` | Chat state (messages, loading, error) |
| `useEffect` | Data fetching, polling the health card |
| `useContext` | `AuthContext` (user, token, login/logout), optional theme |
| `useRef` | Auto-scroll to the last chat message, focus on the input |
| `useMemo` | Filtered and sorted tables, chart data transformation |
| `useCallback` | Stable handlers passed to child components |
| Custom hooks | `useFetch`, `useAuth`, `usePolling` |

---

## 8. The redactor microservice

**Contract**

```
POST /redact
Request:  { "text": "my key is sk-abc123...", "rules": [ { "id", "pattern", "category", "action" } ] }
Response: { "maskedText": "my key is [API_KEY]",
            "detections": [ { "ruleId", "category", "start", "end", "action" } ],
            "blocked": false,
            "servedBy": "<hostname>" }
```

**Default detections:** emails, phone numbers, API keys and tokens, passwords after keywords (`password:`, `pwd=`), credit card numbers (with a Luhn check), IP addresses, national ID patterns, JWTs.

**Why a separate service:** independent scaling, internal-only network exposure, and a clear micro-service responsibility. The `servedBy` field (container hostname) makes load balancing visible during the demo.

**Evolution path (bonus):** keep the same contract and swap the implementation for Python and spaCy to add named-entity detection (names, organizations, locations).

---

## 9. Technologies

### 9.1 Stack summary

| Layer | Technology | Why this choice |
|---|---|---|
| Frontend | React, React Router, Recharts, Axios (or fetch) | Required by the MERN architecture, strong hooks showcase, simple charts |
| Backend | Node.js, Express, Mongoose | Required by MERN, fast to build, schemas and validation with Mongoose |
| Auth and security | JWT, bcrypt, express-validator, express-rate-limit, helmet, cors | Stateless auth (allows scaling), standard hardening |
| Database | MongoDB | Flexible documents for chats and logs, aggregation pipelines for statistics |
| Redactor | Node.js (regex engine) | Same language as the backend, no extra learning curve, still a separate service |
| AI | Gemini or Groq API (HTTPS call from Express), with a mock fallback | Free tier, no Python needed because the model runs on the provider's servers |
| Containers | Docker (multi-stage builds), Docker Compose | Required by Proposition 2 |
| Orchestration | Kubernetes on Minikube, `kubectl` | Local cluster, no AWS Academy permission issues |
| Tooling | Git (monorepo), Postman or Thunder Client, Draw.io | Collaboration, API testing, architecture diagram |

### 9.2 Containerization details

| Image | Strategy |
|---|---|
| `frontend` | Stage 1: `node:alpine` builds the React app. Stage 2: `nginx:alpine` serves the static files. Includes an nginx config that proxies `/api` to the backend. |
| `backend` | `node:alpine`, production dependencies only, non-root user, `HEALTHCHECK`, `.dockerignore`. |
| `redactor` | `node:alpine`, minimal dependencies, non-root user. |
| `mongo` | Official `mongo` image with a named volume (Compose) or PVC (Kubernetes). |

### 9.3 Docker Compose
- Four services, two networks (`public`, `internal`).
- Named volume for MongoDB data.
- `.env` file for secrets and configuration (with a committed `.env.example`).
- `depends_on` with health checks so the backend starts after MongoDB.

### 9.4 Kubernetes (Minikube)
- **Deployments:** `frontend`, `backend`, `redactor`.
- **MongoDB:** Deployment or StatefulSet with a **PersistentVolumeClaim**.
- **Services:** `NodePort` (or Ingress as a bonus) for the frontend; `ClusterIP` for backend, redactor, and mongo.
- **Secret:** JWT secret, LLM API key, Mongo credentials.
- **ConfigMap:** non-sensitive configuration (service URLs, ports, environment).
- **Probes:** liveness and readiness on `/health`.
- **Resource requests and limits** on each container.
- **Scaling demo:** `kubectl scale deployment redactor --replicas=5`, then observe requests served by different pods.
- **Bonus:** HorizontalPodAutoscaler, Ingress, NetworkPolicies.

---

## 10. Security measures

| Threat | Measure |
|---|---|
| Secrets leaking to the LLM | Redaction pipeline before every LLM call |
| Stolen or weak credentials | bcrypt hashing, JWT with expiry and refresh |
| Privilege escalation | Role-based middleware on every admin route |
| Brute force and API abuse | Rate limiting on auth and message routes |
| Injection and malformed input | Validation and sanitization (express-validator), Mongoose schemas |
| Prompt injection | Basic filtering of known injection phrases before the LLM call |
| Container compromise | Non-root users, slim images, internal-only networks, resource limits |
| Secrets in code | `.env` files and Kubernetes Secrets, never committed |

---

## 11. Coverage of the Proposition 2 grading grid

| Criterion | Points | How the project covers it |
|---|---|---|
| Dockerfile quality | 3 | Multi-stage builds, alpine images, non-root, `.dockerignore` |
| Compose and local orchestration | 3 | 4 services, 2 networks, env file, health checks |
| Orchestrator deployment | 5 | Minikube: Deployments, Services, Secret, ConfigMap, probes, scaling |
| Volumes and inter-container network | 3 | Mongo volume or PVC, internal-only services |
| Technical report and reproducibility | 3 | README, architecture diagram, setup script or Makefile |
| Live demo and questions | 3 | Send a fake API key and show it masked, then scale the redactor live |

## 12. Demo scenario (5 to 7 minutes)

1. Show the architecture diagram.
2. Log in as a user and send: *"My AWS key is AKIA... and my email is john@mail.com"*.
3. Show the masked message and the LLM reply.
4. Log in as admin: show the new event in the charts, edit a policy (for example, switch a rule to `block`), and resend the message.
5. In the terminal: `kubectl get pods`, then `kubectl scale deployment redactor --replicas=5`.
6. Send several messages and show different `servedBy` values.
7. Delete the MongoDB pod, show it restart, and show the data still there (PVC).

## 13. Scope control

**In scope:** everything above in the trimmed version (4 services, 4 to 5 collections, regex-based redaction).

**Bonus only if time remains:** spaCy-based NER in Python, Ingress, HorizontalPodAutoscaler, NetworkPolicies, response streaming, WebSockets.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Cloud part starts too late | Docker by day 7, Kubernetes by day 9 |
| LLM API unavailable on demo day | Mock reply fallback controlled by an environment variable |
| Merge conflicts | Folder ownership per person, shared files edited by one person |
| Kubernetes learning curve | Start with one simple Deployment, then add resources step by step |
| Scope creep | Bonus features are frozen until the core works |

## 15. Repository structure

```
securechat-vault/
├── client/            # React app (+ Dockerfile, nginx.conf)
├── server/            # Express API (+ Dockerfile)
├── redactor/          # Redactor microservice (+ Dockerfile)
├── k8s/               # Kubernetes manifests
├── docs/              # api.md, architecture diagram, report
├── docker-compose.yml
├── .env.example
└── README.md
```
