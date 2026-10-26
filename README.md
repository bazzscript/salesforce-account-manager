# Salesforce Account Manager

A small, production-minded full-stack app for working with Salesforce **Accounts**: a Vue 3 + TypeScript single-page console on top of an Express + TypeScript API that authenticates to a real org with the OAuth 2.0 **Client Credentials** flow via [jsforce](https://jsforce.github.io/).

It is deliberately scoped: one object, full CRUD, real org telemetry (API limits), and enough error handling, tests, and packaging to show how the pieces fit together. It also ships with an in-memory demo mode so the UI can be reviewed without a Salesforce org.

```
┌──────────────────────────┐        ┌───────────────────────────┐        ┌──────────────────────┐
│  Browser (Vue 3 + Pinia) │  /api  │  Express API (TypeScript) │ OAuth  │  Salesforce org      │
│  Vite dev server / dist  │ ─────► │  jsforce, Zod, Helmet     │ ─────► │  REST API v62.0      │
└──────────────────────────┘        └───────────────────────────┘        └──────────────────────┘
        no credentials,                     client id + secret,                Account records
        no access token                     access token cached in memory      + org limits
```

## What it demonstrates

- **OAuth 2.0 client credentials** with jsforce 3 (its `OAuth2.requestToken({ grant_type: 'client_credentials' })`, then a `Connection` bound to the returned instance URL).
- **Layered backend**: routes → services → Salesforce gateway, with interfaces (`AccountService`, `LimitsService`) so every test runs without credentials.
- **Typed API boundary**: Salesforce's `Id` / `Name` / `Industry` are mapped to camelCase DTOs; request bodies are validated with Zod.
- **Resilient session handling**: one shared connection, a 90-minute TTL, and a single automatic retry after `INVALID_SESSION_ID`.
- **Honest errors**: Salesforce/auth/network failures are translated into a small set of HTTP codes; 5xx responses never leak stack traces or raw payloads.
- **Vue 3 `<script setup>` + Pinia** stores for accounts and org telemetry, with fully client-side search, optimistic-feeling CRUD, accessible modals, and responsive table→card layout.
- **Tests that mean something**: Supertest against the real Express app with fake services, plus Pinia/utility specs in the browser workspace.
- **Deployable artifact**: a multi-stage Docker image where Express serves the built SPA; health endpoint and Docker `HEALTHCHECK` included.

## Learning from this repo

New to Salesforce? [`docs/salesforce-interview-primer.md`](docs/salesforce-interview-primer.md) is a study guide built
from this codebase: platform fundamentals (orgs, objects, IDs, SOQL, limits), an OAuth 2.0 deep dive (including the
My Domain host trap and the env-shadowing gotcha from the troubleshooting table), a layer-by-layer walkthrough of the
implementation, a 56-question Q&A bank, an honest limitations list, and a live demo script.

## Stack

| Layer          | Choice                                                        |
| -------------- | ------------------------------------------------------------- |
| Front end      | Vue 3.5, TypeScript, Pinia, Vite 7                            |
| Styling        | Hand-written CSS (custom properties, no UI framework)         |
| Back end       | Node.js 22, Express 5, TypeScript (ESM), Zod 4                |
| Salesforce     | jsforce 3.12, REST API `v62.0` (configurable)                 |
| Tests          | Vitest 5, Supertest 7, `@vitest/coverage-v8`                  |
| Tooling        | npm workspaces, tsx, vue-tsc, concurrently                    |
| Packaging      | Multi-stage Dockerfile, Docker Compose, GitHub Actions CI     |

## Features

- List the **20 most recently modified accounts**, with a manual refresh and a "last synced" timestamp.
- **Create / edit / delete** accounts with inline validation, duplicate-name handling, and a confirmation dialog for deletes.
- **Search** by name or industry instantly on the client; `/` focuses the search box.
- **Org telemetry**: daily API request usage (with a compact badge in the header), data/file storage, API version, and live-vs-demo mode.
- **Responsive**: a real table on desktop, stacked cards on narrow screens, with the same semantics preserved.
- **Accessible**: labelled controls, focus-trapped dialogs, Escape to close, `aria-live` status messages, visible focus rings, reduced-motion support.
- **Demo mode** (`SF_MOCK=true`) with seeded accounts and simulated limits, refused in production.

## Requirements

- **Node.js 22.19 or newer** (jsforce pulls in `undici@8`, which requires it). `.nvmrc` pins major 22.
- npm 10+ (the repo was built with npm 11).
- Optional: a Salesforce Developer Edition or sandbox org for live mode.
- Optional: Docker 24+ and Docker Compose v2 for the container path.

## Quick start (demo mode, no Salesforce org)

```bash
git clone <your-fork-url> salesforce-account-manager
cd salesforce-account-manager

npm install

cp server/.env.example server/.env
# Open server/.env and set:
#   SF_MOCK=true
# The placeholder SF_CLIENT_ID / SF_CLIENT_SECRET are then ignored.

npm run dev
```

- UI: <http://localhost:5173>
- API: <http://localhost:4000/api/health>

Vite proxies `/api` to Express, so the browser only ever talks to its own origin. Demo data lives in memory: restarting the server restores the eight seeded accounts.

To review the production build locally:

```bash
npm run build
# server/.env: SERVE_CLIENT=true, NODE_ENV=development (SF_MOCK may be true here)
npm start
# open http://localhost:4000 — Express serves client/dist and the API
```

## Connect a real Salesforce org

### 1. Create an External Client App (or Connected App)

1. In Salesforce: **Setup → Quick Find → App Manager → New External Client App**.
2. **Basic Information**: name it (e.g. `Account Manager`), add a contact email, and choose the **Local** distribution state for internal use.
3. **API (Enable OAuth Settings)**:
   - Enable OAuth.
   - Callback URL: `http://localhost:4000/oauth/callback` (the client-credentials grant never redirects, but Salesforce requires a value).
   - OAuth scopes: **Manage user data via APIs (`api`)**. Refresh tokens are not needed.
   - Leave the web-server-flow/PKCE settings at their defaults.
4. **OAuth Flows**: enable **Client Credentials Flow** and pick a **Run As** user.
   - That user must be **active**, have **API Enabled**, and be allowed to read/create/edit/delete Accounts.
   - Client-credentials tokens act as this user, not as an end user.
5. Save, then open the app's **OAuth Settings** (or App Manager → View) and copy the **Consumer Key** and **Consumer Secret**.
6. Allow a few minutes for a new app to propagate. For local development behind a changing IP, IP relaxation (or an explicit trusted range) avoids surprise `invalid_grant` responses.

> A classic **Connected App** works the same way: enable OAuth, tick **Enable Client Credentials Flow**, assign a Run As user, and copy the consumer key/secret.

> **My Domain vs. Setup host:** with an External Client App, `SF_LOGIN_URL` must be the org's My Domain host (`https://<org>.my.salesforce.com`), which is what appears in the browser once you leave Setup. The `*.my.salesforce-setup.com` host shown while you are inside Setup is the UI only, and `login.salesforce.com` does not serve the client-credentials grant for an ECA (`invalid_grant: request not supported on this domain`).

### 2. Configure `server/.env`

```bash
SF_LOGIN_URL=https://login.salesforce.com   # sandbox: https://test.salesforce.com
# External Client App? Use the org's My Domain host instead, e.g.
# SF_LOGIN_URL=https://your-org-dev-ed.develop.my.salesforce.com
SF_CLIENT_ID=your_consumer_key
SF_CLIENT_SECRET=your_consumer_secret
SF_API_VERSION=62.0
PORT=4000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
SERVE_CLIENT=false
SF_MOCK=false
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `SF_LOGIN_URL` | `https://login.salesforce.com` | OAuth host. Sandboxes: `https://test.salesforce.com`. **External Client Apps must use the org's My Domain host** (`https://<org>.my.salesforce.com`); client-credentials tokens are not issued from `login.salesforce.com`. |
| `SF_CLIENT_ID` | — | Consumer key. Required unless `SF_MOCK=true`. Server-side only. |
| `SF_CLIENT_SECRET` | — | Consumer secret. Required unless `SF_MOCK=true`. Never expose to Vite (`VITE_*`). |
| `SF_API_VERSION` | `62.0` | REST/SOQL version; must be supported by the org. |
| `PORT` | `4000` | Express port (also what Vite proxies to). |
| `NODE_ENV` | `development` | `production` forbids demo mode. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Comma-separated CORS allowlist. Only relevant when the SPA is not same-origin with the API. |
| `SERVE_CLIENT` | `false` | Serve `client/dist` from Express (Docker/production build). |
| `SF_MOCK` | `false` | Use the in-memory demo instead of a real org. Rejected in production. |

`server/.env` is located relative to the compiled module, so commands work from the repo root, from `server/`, and inside Docker. Real environment variables always win over the file.

### 3. Start live

```bash
npm run dev
```

`GET /api/health` should report `"mode":"live"`, and the header badge switches from **Demo data** to **Live org**. The startup log prints the login URL, API version, and only the last four characters of the consumer key — never the secret.

> The browser never receives the client id, secret, or access token. It calls `/api`, and Express attaches the Salesforce session server-side.

## Scripts

From the repository root:

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs Express (`tsx watch`, port 4000) and Vite (port 5173) together. |
| `npm run build` | Compiles the server (`tsc`) and builds the SPA (`vue-tsc` + `vite build`). |
| `npm start` | Runs the compiled API: `node server/dist/index.js`. Set `SERVE_CLIENT=true` to also serve the SPA. |
| `npm test` | Runs the server suite, then the client suite. |
| `npm run test:coverage` | Same, with V8 coverage (text + HTML per workspace). |
| `npm run typecheck` | Strict TypeScript check for both workspaces. |

Workspace-specific commands follow the same names, e.g. `npm run test -w server`, `npm run dev -w client`, `npm run preview -w client`.

## API reference

All responses are JSON. `/api/*` responses are sent with `Cache-Control: no-store`.

### `GET /api/health`

```json
{
  "status": "ok",
  "mode": "live",
  "salesforceApiVersion": "62.0",
  "uptimeSeconds": 42,
  "timestamp": "2026-03-14T12:00:00.000Z"
}
```

### `GET /api/limits`

Reads the org's `/services/data/vXX.X/limits` endpoint and normalises the three limits the UI shows.

```json
{
  "dailyApiRequests": { "max": 15000, "remaining": 14872, "used": 128 },
  "dataStorageMb": { "max": 1024, "remaining": 810, "used": 214 },
  "fileStorageMb": { "max": 512, "remaining": 497, "used": 15 },
  "fetchedAt": "2026-03-14T12:00:00.000Z"
}
```

### `GET /api/accounts`

Returns up to 20 records, most recently modified first:

```soql
SELECT Id, Name, Industry FROM Account ORDER BY LastModifiedDate DESC LIMIT 20
```

```json
[
  { "id": "0015g00000AbCdEAAV", "name": "Acme Logistics", "industry": "Transportation" },
  { "id": "0015g00000AbCdFAAV", "name": "Brightwave Analytics", "industry": "Technology" }
]
```

### `POST /api/accounts`

```bash
curl -X POST http://localhost:4000/api/accounts \
  -H 'Content-Type: application/json' \
  -d '{"name":"Acme Logistics","industry":"Transportation"}'
```

- `name` is required, trimmed, 1–255 characters.
- `industry` is optional text or `null`; blank strings become `null`.
- Unknown fields are rejected (`strictObject`).
- Returns **201** with the created account and a `Location` header. The body is built from the validated input, so no extra API call is spent reading it back.

### `PATCH /api/accounts/:id`

```bash
curl -X PATCH http://localhost:4000/api/accounts/0015g00000AbCdEAAV \
  -H 'Content-Type: application/json' \
  -d '{"industry":"Logistics"}'
```

At least one field is required. IDs must look like 15- or 18-character Salesforce IDs. The API performs a read-after-write so the response is the record as Salesforce now stores it (this also catches fields changed by validation rules or automation).

### `DELETE /api/accounts/:id`

Returns **204 No Content**.

### Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Name is required.",
    "details": [{ "field": "name", "message": "Name is required." }]
  }
}
```

`details` is present only when there is field-level information. The Vue form renders those next to the relevant input.

| Status | Code | Typical cause |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body failed Zod validation. |
| 400 | `INVALID_JSON` | Malformed JSON from `express.json()`. |
| 400 | `INVALID_ACCOUNT_ID` | ID is not a 15/18-character Salesforce ID. |
| 400 | `SALESFORCE_BAD_QUERY` | The org rejected the SOQL query (often an unsupported API version). |
| 401 | `SALESFORCE_SESSION_EXPIRED` | Cached session rejected; one automatic retry already happened. |
| 404 | `ACCOUNT_NOT_FOUND` | Record was deleted or is not visible to the run-as user. |
| 404 | `ROUTE_NOT_FOUND` | Unknown `/api` path (still JSON, never the SPA). |
| 409 | `DUPLICATE_ACCOUNT` | Duplicate rule / `DUPLICATE_VALUE`. |
| 413 | `PAYLOAD_TOO_LARGE` | Body over the 32 KB limit. |
| 422 | `SALESFORCE_VALIDATION_FAILED` | Validation rule, required field, or string length rejected by the org. |
| 429 | `SALESFORCE_LIMIT_EXCEEDED` | Daily API request limit reached. |
| 502 | `SALESFORCE_AUTH_FAILED` | Bad consumer key/secret, flow disabled, or run-as user problem. |
| 502 | `SALESFORCE_ERROR` | Other Salesforce-side failure with a safe, human-readable message. |
| 503 | `SALESFORCE_UNREACHABLE` | DNS/TCP/TLS failure reaching Salesforce. |
| 503 | `SALESFORCE_UNAVAILABLE` | Salesforce-side outage or lock contention. |
| 500 | `INTERNAL_ERROR` | Unexpected failure; details are logged server-side only. |

## Project structure

```
salesforce-account-manager/
├── .github/workflows/ci.yml      # typecheck → test → build on push/PR
├── client/
│   ├── public/favicon.svg
│   ├── src/
│   │   ├── api/accounts.ts       # fetch wrapper, ApiError, typed endpoints
│   │   ├── components/           # AccountList, AccountFormModal, ConfirmDialog, …
│   │   ├── stores/
│   │   │   ├── accounts.ts       # list, search, CRUD state
│   │   │   └── org.ts            # limits + health via Promise.allSettled
│   │   ├── styles/main.css       # design tokens, buttons, loading primitives
│   │   ├── types/account.ts
│   │   ├── utils/format.ts
│   │   ├── App.vue
│   │   └── main.ts
│   ├── index.html
│   └── vite.config.ts            # /api proxy + Vitest config
├── server/
│   ├── src/
│   │   ├── config/env.ts         # Zod-validated environment
│   │   ├── errors/httpError.ts
│   │   ├── middleware/           # error handler, request logger
│   │   ├── routes/               # accounts, health, limits, parseBody
│   │   ├── salesforce/
│   │   │   ├── client.ts         # OAuth 2.0 client credentials + TTL cache
│   │   │   ├── accountService.ts # SOQL + CRUD, read-after-write
│   │   │   ├── limitsService.ts
│   │   │   ├── mockServices.ts   # SF_MOCK demo implementation
│   │   │   ├── errors.ts         # jsforce → HttpError translation
│   │   │   └── soql.ts           # string escaping
│   │   ├── types/                # Account DTOs + service interfaces
│   │   ├── app.ts                # Express factory (CORS, Helmet, SPA)
│   │   └── index.ts              # bootstrap, graceful shutdown
│   ├── tests/                    # Vitest + Supertest
│   └── .env.example
├── Dockerfile                    # multi-stage build, Express serves the SPA
├── docker-compose.yml            # live org (production settings)
├── docker-compose.demo.yml       # no-credentials demo overlay
├── package.json                  # npm workspaces + root scripts
└── README.md
```

### Design notes

- **Dependency inversion instead of mocking jsforce in routes.** `CreateAppOptions.services` takes `AccountService` / `LimitsService`, so HTTP tests use small fakes and the real Salesforce gateway stays thin.
- **One connection, reused.** The OAuth token is cached in a promise (concurrent requests share one token exchange) for 90 minutes, then rebuilt. `INVALID_SESSION_ID` triggers one fresh-token retry; failures are never cached.
- **Cheap writes.** Create responds with the validated input (no read-back); update does one read-after-write because automation may have changed other visible fields.
- **Small payloads.** Only `Id, Name, Industry` are selected, and the JSON body limit is 32 KB.
- **Client search is local.** The list endpoint returns a fixed top-20 window, so filtering by name/industry happens in the Pinia getter without extra API calls (and without spending daily API quota).
- **Static hosting is opt-in.** Express serves `client/dist` only when `SERVE_CLIENT=true` and a build exists; unknown `/api` paths still return JSON, and other GETs fall back to `index.html` for deep links. Requests that look like files (missing hashed assets) 404 instead of receiving HTML.

## Testing

```bash
npm test                 # server (34 tests) + client (21 tests)
npm run test:coverage    # HTML reports in server/coverage and client/coverage
npm run typecheck        # strict TS in both workspaces
```

- **Server** (`server/tests/`): unit tests for SOQL escaping and the Salesforce→HTTP error mapper, plus Supertest integration tests against `createApp()` with fake services. They cover validation, 404/409/422/429/503 mapping, malformed JSON, the 32 KB limit, cache headers, CORS, the JSON-only `/api` 404, and static SPA hosting.
- **Client** (`client/src/**/*.spec.ts`): utility specs (formatting, initials, stable industry hues) and Pinia store specs with a mocked `accountsApi` covering load/filter/create/update/delete, validation details, and failure paths.
- **No credentials required.** `SF_MOCK=true` is not needed for the test suite; the app is exercised through injected services.
- **CI** (`.github/workflows/ci.yml`) runs install → typecheck → test → build on Node 22 for every push to `main` and every pull request.

## Docker

The image builds both workspaces, then installs **only the API's production dependencies** into a slim Node 22 Alpine runtime. Express serves the built SPA and the API on one port, as a non-root user, with a `HEALTHCHECK` that calls `/api/health`.

```bash
docker build -t salesforce-account-manager:local .
```

**Live org** (set `SF_MOCK=false` in `server/.env` first):

```bash
docker run --rm -p 4000:4000 \
  --env-file server/.env \
  -e NODE_ENV=production \
  -e SERVE_CLIENT=true \
  -e CLIENT_ORIGIN=http://localhost:4000 \
  salesforce-account-manager:local
# http://localhost:4000
```

**Demo mode inside Docker** — `NODE_ENV=production` intentionally rejects `SF_MOCK=true`, so override it for a throwaway demo container:

```bash
docker run --rm -p 4000:4000 \
  -e NODE_ENV=development \
  -e SF_MOCK=true \
  -e SERVE_CLIENT=true \
  salesforce-account-manager:local
```

**Docker Compose — demo, no credentials needed:**

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build
# http://localhost:4000 — in-memory data, resets when the container restarts
```

The overlay keeps the production image but switches the container to `NODE_ENV=development` + `SF_MOCK=true`, because the API deliberately refuses the in-memory demo in production.

**Docker Compose — live org:** fill in real credentials in `server/.env`, then:

```bash
docker compose up --build
```

The base file reuses `server/.env`, forces `NODE_ENV=production` and `SF_MOCK=false`, and maps `${PORT:-4000}`. Run with the checked-in demo `.env` and it fails fast with a configuration error instead of silently serving demo data.

## Deployment

Any Node host works (Render, Railway, Fly.io, a VM behind nginx). Configure:

- **Build**: `npm ci && npm run build`
- **Start**: `node server/dist/index.js`
- **Environment**: `NODE_ENV=production`, `SERVE_CLIENT=true`, the `SF_*` values, and let the platform inject `PORT`. Set `CLIENT_ORIGIN` to the public URL (or leave it; same-origin requests need no CORS entry).
- **Health check path**: `/api/health`
- **TLS**: terminate at the platform/proxy; Express already sets `trust proxy`.

Notes:

- `SF_MOCK` must be absent or `false` in production — the env schema refuses to boot otherwise.
- Each instance keeps its own in-memory Salesforce token, which is fine to scale horizontally; there is no shared cache to operate.
- `client/dist/assets/*` is served `immutable` for a year (Vite hashes filenames), while `index.html` and `/api/*` are `no-store`.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `Invalid server configuration` at startup | Copy `server/.env.example` → `server/.env`, or set `SF_MOCK=true`. The message lists every offending variable. |
| `docker compose up` refuses `SF_MOCK=true` | The base Compose file is the live path; use the demo overlay: `docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build`. |
| `SALESFORCE_AUTH_FAILED` / `invalid_client_id` | Consumer key is wrong, or `SF_LOGIN_URL` points at the wrong environment (sandbox vs. production). |
| `SALESFORCE_AUTH_FAILED` / `invalid_grant` | Client Credentials Flow is not enabled, the Run As user is inactive or lacks **API Enabled**, the app has not finished propagating, or the secret was rotated. |
| `SALESFORCE_AUTH_FAILED` / `request not supported on this domain` | `SF_LOGIN_URL` is `https://login.salesforce.com` but the app is an **External Client App**. Use the org's My Domain host (`https://<org>.my.salesforce.com`); the `*.my.salesforce-setup.com` host in Setup URLs is the UI, not the API. |
| `SALESFORCE_AUTH_FAILED` / `no client credentials user enabled` | The OAuth flow is enabled but no **Run As** user is saved (Policies tab), or that user is inactive. |
| `SALESFORCE_SESSION_EXPIRED` persists | The org is invalidating sessions (admin revoked the token, IP restrictions, or very short session timeout). The API retried once already. |
| `SALESFORCE_BAD_QUERY` | `SF_API_VERSION` is not supported by the org. Check **Setup → Company Information** for the current version. |
| Empty account list, no error | The org genuinely has no Accounts, or the Run As user cannot see them. Salesforce returns an empty result rather than a 403. |
| Delete returns `INSUFFICIENT_ACCESS_OR_READONLY` | The Run As user lacks Delete permission on Accounts. |
| `SALESFORCE_UNREACHABLE` | DNS/proxy/firewall issue from the server to `*.salesforce.com`. |
| `EADDRINUSE` | Port 4000 is taken; change `PORT` in `server/.env` (and `VITE_PROXY_TARGET` if you move the API). |
| Changed `server/.env` but the server still uses the old host | A variable exported in your shell (e.g. from an earlier `set -a; . .env`) wins over `.env` — both `dotenv` and `--env-file` never overwrite existing values. Restart the shell or run `unset SF_LOGIN_URL SF_CLIENT_ID SF_CLIENT_SECRET SF_MOCK`. |
| `npm install` warns about `undici` engines | You are on Node < 22.19. Upgrade Node (22 LTS or newer). |
| Browser shows a CORS error | You are calling the API from a different origin than `CLIENT_ORIGIN`. Use the Vite proxy or add the exact origin (scheme + host + port). |

## Security notes

- **Credentials never reach the browser.** Only the server reads `SF_CLIENT_ID` / `SF_CLIENT_SECRET`; the SPA talks to `/api`. There are no `VITE_*` secrets, and no access token is stored client-side.
- **Least privilege.** Use a dedicated Run As user with API access and only the Account permissions the app needs; nothing else is exposed by this API.
- **Hardened HTTP surface.** Helmet defaults, an explicit CORS allowlist, a 32 KB JSON limit, `no-store` on API responses, `x-powered-by` disabled, and a JSON-only 404 under `/api`.
- **Input handling.** Zod schemas reject unknown fields and over-long strings; Salesforce IDs are regex-checked; SOQL strings are escaped before interpolation.
- **Safe failures.** 5xx responses are generic; stack traces and raw Salesforce payloads are logged server-side. OAuth `error_description` values are not echoed.
- **Demo guard.** `SF_MOCK=true` is a validation error when `NODE_ENV=production`, so demo data cannot silently ship to production.
- **Shutdown.** `SIGTERM`/`SIGINT` close the HTTP server gracefully, with a 10-second forced-exit backstop.
- **Out of scope:** the app itself has no end-user authentication or per-user authorization. Put it behind your SSO/VPN, or add a session layer, before exposing Salesforce data to untrusted users.

## Limitations and next steps

- The list is a fixed 20-record window ordered by `LastModifiedDate`; there is no pagination yet (`nextRecordsUrl` / `fetchMore` would be the natural extension).
- Search filters the loaded window on the client rather than querying Salesforce.
- The UI edits `Name` and `Industry` only, on purpose; the service layer is the place to add fields.
- Possible additions: server-side search with `LIKE`, cursor pagination, an OpenAPI document, Playwright end-to-end tests, and a shared token cache (Redis) for multi-instance deployments.

## License

MIT — see the repository's license terms. Salesforce and related marks are trademarks of Salesforce, Inc.; this project is an independent demo and is not affiliated with Salesforce.
