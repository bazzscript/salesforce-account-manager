# Salesforce Interview Primer — built from *this* repo

> You built a Vue 3 + Express app that does live CRUD on Salesforce Accounts using **OAuth 2.0 Client Credentials**.
> This document teaches the platform you integrated with, explains every design decision in your code, and gives you
> the vocabulary and answers to defend it in an enterprise interview.

**Ground rule for the interview:** never claim something you cannot point at. Every claim below maps to a file in this
repo or to an HTTP response you personally observed. If you don't know, say *"I haven't worked with X; here's how I'd
find out"* — that reads as senior, not weak.

---

## 0. How to use this

| Time you have | Read |
| --- | --- |
| 30 minutes | §1.1–§1.6, §2.3, §3.1, §5.1, §9 |
| 2 hours | All of §1–§5, then write the flashcards in §10 by hand |
| Day before | §6 Q&A out loud, §7 weaknesses, §8 demo script practiced twice |

Priority order if you're short on time: **the request lifecycle (§3.1)** → **client credentials (§2.3–§2.5)** →
**the "why" answers (§5.2)** → **weak spots (§7)**. Interviewers spend most of their time on "why did you choose that".

---

## 1. Salesforce in one sitting

### 1.1 The org

An **org** is one isolated Salesforce instance (database + metadata + users). You used a **Developer Edition (DE) org**:
free, permanent, full API access, small storage — the standard place for a first integration.

| Environment | What it is | Why you'd use it |
| --- | --- | --- |
| **Production** | The real org. | Live users. Never point a test at it. |
| **Developer Edition** | Free standalone org, no expiry. | Learning, portfolios, small integrations. **This is what you used.** |
| **Sandbox** | A copy of production (Developer / Developer Pro / Partial / Full). | UAT, regression, training. |
| **Scratch org** | Disposable, created from a Dev Hub, defined in source, expires (30 days default). | CI pipelines, feature branches, repeatable tests. |

**My Domain** is the org's unique subdomain, e.g. `orgfarm-132e41c593-dev-ed.develop.my.salesforce.com`. It is required
for SSO and for modern app types, and it is the host your API must talk to. Note that *Setup* renders on a different
host (`*.my.salesforce-setup.com`) — that is a UI host only. Confusing those two cost you an hour of debugging (§2.5).

> **Interview line:** "A DE org is a real, permanent Salesforce instance. I used it for live verification, and I kept
> the app environment-agnostic — `SF_LOGIN_URL` is just config, so the same build points at a sandbox or production."

### 1.2 Objects, records, fields

Salesforce is a **metadata-driven** database. You don't write DDL; you define objects and fields in Setup, and the
platform creates the storage and the REST endpoints.

- **Standard object**: shipped by Salesforce. `Account`, `Contact`, `Opportunity`, `Case`, `User`, `Lead`.
- **Custom object**: you create it; API name ends in `__c` (e.g. `Invoice__c`), custom fields too (`Discount__c`).
- **Record**: one row. An Account record is one company.
- **Field**: a column. Standard fields have fixed API names (`Name`, `Industry`, `OwnerId`); the UI label can differ
  from the API name — **always integrate against API names**.

Fields you will meet: text, number, currency, date/datetime, checkbox, picklist (single/multi), lookup (foreign key),
master-detail, formula (read-only, computed), roll-up summary (read-only aggregate).

You touched three fields on `Account`: `Id`, `Name` (required text, max 255), `Industry` (picklist, optional). That
`Industry` picklist is why a bad value comes back as a Salesforce validation error (**422**) rather than your own
validation error (**400**) — see §3.6.

> **Interview line:** "Account is the standard object for companies. I deliberately scoped to one object and three
> fields so the integration surface stayed small: the read path is one SOQL query, the write path is one sObject call."

### 1.3 Record IDs

A Salesforce ID is **15 characters, case-sensitive**; the **18-character** form appends a 3-character checksum so the
ID can be matched case-insensitively (Excel exports, spreadsheets, integrations).

- `001` prefix = **Account**. Other prefixes: `003` Contact, `005` User, `006` Opportunity, `00D` Org, `00Q` Lead.
- Your live create returned `001g8000016WD7qAAG` — 18 characters, `001` prefix, so it is unmistakably an Account.
- `server/src/routes/parseBody.ts` validates `/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/` **before** the id is used in a
  URL or interpolated into SOQL. That single regex kills two classes of bug: malformed IDs (`MALFORMED_ID`) and
  injection through the path parameter.

> **Interview line:** "I accept both 15- and 18-character IDs because clients hand you either, and I reject anything
> else at the edge so junk never reaches Salesforce."

### 1.4 SOQL (and SOSL)

**SOQL** is Salesforce's SQL-like query language. It is not SQL:

- No `SELECT *` — you list fields. Asking for fewer fields costs less and respects field-level security.
- No joins — you traverse **relationships** instead: `SELECT Id, Name, (SELECT Id FROM Contacts) FROM Account`.
- `LIMIT` and `OFFSET` exist, but `OFFSET` is capped (2,000 in most contexts), so deep pagination needs a keyset
  strategy (`WHERE LastModifiedDate < :lastSeen`), not `OFFSET 10000`.
- One query returns at most **50,000 rows**; larger result sets page via `queryMore` / `nextRecordsUrl`.
- `LIKE` supports `%` and `_`; `'` and `\` must be escaped — `server/src/salesforce/soql.ts` does exactly that.

Your list query (`server/src/salesforce/accountService.ts`):

```soql
SELECT Id, Name, Industry
FROM Account
ORDER BY LastModifiedDate DESC
LIMIT 20
```

Three deliberate choices: **only the fields the UI needs**, **ORDER BY so a new record appears on top immediately**,
**LIMIT 20 so a demo never drags the whole org over the wire**. `LastModifiedDate` is indexed, so this stays cheap on a
large org.

**SOSL** is full-text search across objects (`FIND {acme} RETURNING Account(Id, Name)`). It is the right tool for a
global search box; SOQL is the right tool for filters and lists. Your search is client-side because you only hold 20
records (§7 explains what you'd change at scale).

> **Interview line:** "I used SOQL with an explicit field list, an indexed `ORDER BY`, and a `LIMIT`. At scale I'd move
> search server-side with a parameterised `LIKE` clause or SOSL, and paginate with a keyset cursor instead of `OFFSET`."

### 1.5 The API surface

Salesforce exposes several APIs on the same host, all versioned (`/services/data/v62.0/...`). Version 62.0 = Spring '25.

| API | What it's for | Used here? |
| --- | --- | --- |
| **REST** | sObject CRUD, SOQL, Composite, Limits, describe | **Yes** — via jsforce |
| **SOAP** (Partner/Enterprise) | Metadata-ish operations, `emptyRecycleBin`, login | Tried, not available on this org |
| **Bulk API 2.0** | Async ingest/export of millions of rows (CSV/JSON jobs) | No — overkill for 20 records |
| **Metadata API** | Deploy/retrieve object and field definitions | No — done in Setup UI |
| **Tooling API** | Dev tooling: Apex classes, debug logs, test runs | No |
| **Streaming / Pub-Sub** | Platform Events, Change Data Capture (push, not poll) | No — would replace polling if needed |
| **GraphQL** | Query shaped responses in one call | No |

The concrete REST calls your app makes (jsforce hides the paths):

| Action | Method + path | Response |
| --- | --- | --- |
| List | `GET /services/data/v62.0/query?q=SELECT…` | `200` + `records[]` |
| Create | `POST /services/data/v62.0/sobjects/Account` | `201` + `{ id, success, errors }` |
| Update | `PATCH /services/data/v62.0/sobjects/Account/{id}` | `204` |
| Delete | `DELETE /services/data/v62.0/sobjects/Account/{id}` | `204` (soft delete) |
| Read one | `GET /services/data/v62.0/sobjects/Account/{id}` | `200` |
| Limits | `GET /services/data/v62.0/limits` | `200` + every limit bucket |

> **Interview line:** "REST for synchronous CRUD, SOQL for reads. I'd reach for Bulk 2.0 above roughly 2,000 records,
> and Composite when a screen needs several writes in one round trip."

### 1.6 Users, permissions, and what the integration can see

An integration authenticates as an **identity**, and that identity's permissions decide everything:

- **Profile** — the base permission set on a user (e.g. "Standard User").
- **Permission sets** — additive grants; the modern way to give an integration user exactly what it needs.
- **Object permissions** — CRUD (Create/Read/Edit/Delete) per object.
- **Field-level security (FLS)** — per-field read/edit. The API enforces it: a field you cannot read is not returned
  (or the query errors with `INVALID_FIELD`), and a write to a read-only field fails.
- **Record access** — org-wide defaults + role hierarchy + sharing rules + manual shares. An integration user with a
  narrow role sees fewer records even with object access.
- **API Enabled** — a system permission; without it, every API call fails regardless of object access.

Best practice, and a strong thing to say out loud: **a dedicated integration user with least privilege**, not an admin.
In Client Credentials Flow that user is the **Run As user** configured on the app (§2.4).

> **Interview line:** "The integration inherits the Run As user's profile, permission sets, FLS and sharing. I'd give it
> a dedicated user with CRUD on Account plus read on the fields it needs, and nothing else — never 'Modify All Data'."

### 1.7 Automation that can reject your write

Salesforce is not a passive database. A write can succeed at the API layer and still be transformed or rejected by
org-side automation:

- **Validation rules** — declarative `IF(condition, error)`; reject a save with a custom message.
- **Flows / Apex triggers** — run before/after save; can change field values (which is why you re-read after write, §3.4).
- **Duplicate rules** — Alert/Block on matching names; block returns `DUPLICATE_VALUE`.
- **Required fields & field-level security** — enforced on insert/update.
- **Record types & picklists** — restricted picklists reject values outside the list.

This is the *reason* your error map has both **400** (your Zod validation failed) and **422** (Salesforce's rules
rejected a structurally valid payload). Being able to explain that distinction is a strong interview moment.

> **Interview line:** "A 400 means my contract was violated; a 422 means Salesforce's own metadata rules rejected it.
> Keeping those separate tells the caller whether to fix the payload or the data."

### 1.8 Metadata and deployment

Objects, fields, validation rules, and app definitions are **metadata**, not code in your repo (in a classic org). Ways
to move metadata between orgs:

| Tool | Use |
| --- | --- |
| **Change sets** | Point-and-click, outbound/inbound between related orgs. Legacy but everywhere. |
| **Salesforce CLI (`sf`)** | `sf project retrieve/start`, `sf deploy`; source format, scriptable, CI-friendly. |
| **Unlocked packages / 2GP** | Versioned packaging for distribution. |
| **Scratch orgs + source tracking** | Spin an org from source, run tests, throw it away. |

Your app's code is *not* metadata — it is an external client. Salesforce only holds the **External Client App** definition
(consumer key/secret, enabled flows, Run As user) and the org's data. That separation is the point of the architecture.

> **Interview line:** "The app lives in our CI/CD; Salesforce holds the metadata. I'd ship ECA config and any custom
> fields as source via the `sf` CLI so a sandbox rebuild is reproducible."

### 1.9 Limits: two different animals

Interviewers love this distinction.

**1. Per-transaction governor limits** (Apex/flow runtime, per execution): 100 SOQL queries, 150 DML statements, 10,000
DML rows, 50,000 query rows, CPU time, heap size. These protect the shared platform from one bad loop.

**2. Org-wide API request allocation** (what your header badge shows): requests per rolling 24 hours. Developer Edition
is **15,000** — which is exactly what `/api/limits` returned. Enterprise/Unlimited get substantially more (commonly
cited as 100,000 and 5,000,000; confirm in Setup → Company Information for a given org, since editions and add-ons
change).

Your `/limits` response also returned **data storage 5 MB** and **file storage 20 MB** — DE-scale numbers. Storage is a
separate quota from API calls, and deleted records still occupy it until purged (§1.10).

Practical consequences you can speak to:

- Every page load in your app costs **1** API call for accounts, **1** for limits, plus **1** per write. That's why the
  badge matters: a polling UI can burn a DE org's daily allowance in an afternoon.
- `REQUEST_LIMIT_EXCEEDED` is mapped to **429** (§3.6) — a *retryable later*, not a *retry now*.
- Ways to spend fewer calls: bigger page sizes, caching, Composite API (up to 25 subrequests per call), Bulk for
  batches, and event-driven updates instead of polling.

> **Interview line:** "Governor limits are per transaction inside Salesforce; API limits are an org-wide 24-hour budget.
> I surface the budget in the UI and map exhaustion to 429, because retrying immediately makes it worse."

### 1.10 Delete is a soft delete

`DELETE /sobjects/Account/{id}` does **not** destroy the row. It moves it to the **Recycle Bin** for 15 days, where it
can be restored, still counts toward storage, and is invisible to normal queries.

- Normal SOQL ignores deleted rows; `queryAll` (REST `/queryAll`) includes them with `IsDeleted: true`.
- Permanent removal: `emptyRecycleBin` (SOAP), Setup → Recycle Bin, or waiting 15 days.
- On your org, the SOAP `emptyRecycleBin` call returned **404** — the SOAP endpoint isn't exposed there — so the two probe
  records you deleted sat in the Recycle Bin with `IsDeleted: true` (verified via `queryAll`). That is correct Salesforce
  behaviour, not a bug in the app.

> **Interview line:** "DELETE is soft: the record goes to the Recycle Bin for 15 days and `queryAll` still returns it
> with `IsDeleted: true`. That's why I verified deletion with `queryAll` rather than trusting a 204."

---

## 2. OAuth 2.0 in Salesforce (the heart of this project)

### 2.1 The actors

| Actor | What it is | In your project |
| --- | --- | --- |
| **External Client App (ECA)** | Salesforce's modern app definition: consumer key + consumer secret, enabled OAuth flows, scopes, Run As user, IP policy. | You created one. `SF_CLIENT_ID` / `SF_CLIENT_SECRET` are its credentials. |
| **Connected App** | The older, still-supported equivalent (Setup → App Manager → New Connected App). | The docs you followed may show this UI. |
| **My Domain host** | `yourorg.my.salesforce.com` — where OAuth and REST live. | `SF_LOGIN_URL` points here. **Critical.** |
| **Token endpoint** | `POST /services/oauth2/token` | jsforce calls it for you. |
| **Run As user** | The identity the app acts as. | Set on the ECA's policy page. |

> The single most useful sentence you can say: **"The login URL is not the setup URL, and it's not the instance URL.
> The login URL is the My Domain host; the instance URL comes back in the token response."**

### 2.2 OAuth flows, and when each is right

| Flow | Identity | Refresh token? | Use when |
| --- | --- | --- | --- |
| **Web Server** (authorization code) | End user, via browser login | Yes | A user-facing app acting on behalf of each user. |
| **Authorization Code + PKCE** | End user | Yes | Same, for public clients (SPA/mobile) with no secret. |
| **JWT Bearer** | Pre-authorised integration user | No | Server-to-server, secretless (signed JWT, certificate). Best for CI and regulated shops. |
| **Client Credentials** | Fixed Run As user | **No** | Server-to-server where one app identity is acceptable. **You used this.** |
| **Device Flow** | End user on a constrained device | Yes | TVs, CLI tools. |
| **Refresh Token** | Any flow that issued one | Rotates | Silent re-auth. |

Scopes you'll encounter: `api` (manage data — **yours**), `refresh_token`/`offline_access` (needed for refresh),
`id` (identity URL), `web`, `full`, `chatter_api`, `custom_permissions`. Request the minimum.

> **Interview line:** "I chose client credentials because this is an internal server-to-server console with no per-user
> identity. If the UI needed each user's own Salesforce permissions or audit trail, I'd switch to Authorization Code with
> PKCE and keep the secret server-side."

### 2.3 Client Credentials, precisely

The whole exchange is one form POST:

```http
POST /services/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=<consumer key>
&client_secret=<consumer secret>
```

A successful response (this is the shape you observed, redacted):

```json
{
  "access_token": "<112-character bearer>",
  "instance_url": "https://orgfarm-132e41c593-dev-ed.develop.my.salesforce.com",
  "id": "https://login.salesforce.com/id/00D.../005...",
  "token_type": "Bearer",
  "issued_at": "…",
  "signature": "…",
  "scope": "api"
}
```

There is **no user login, no browser, no refresh token, no consent screen.** The token *is* the Run As user's session.

What that buys you: simple ops, no interactive auth, ideal for daemons and internal tools.

What it costs you — and you should volunteer this before the interviewer does:

- **No per-user identity.** Every record is created/updated as the Run As user; `CreatedById` is always that user. No
  per-user audit trail, no per-user sharing.
- **No refresh token**, so you must re-mint when the session expires (your 90-minute TTL, §3.3).
- **Coarse blast radius.** Anyone with the secret is that user. Rotation and secret storage matter (§7).
- **Silent failure mode:** if the Run As user is deactivated, everything 502s with `invalid_grant`.

> **Interview line:** "Client credentials is the right fit for a trusted backend with a single app identity. The tradeoff
> I accepted is that we lose per-user attribution, so if audit-by-user were a requirement I'd move to JWT bearer or
> authorization code."

### 2.4 The three settings that decide whether it works

1. **Client Credentials Flow enabled** on the app, with a **Run As user** assigned. If it's disabled, the token endpoint
   returns `invalid_grant` / `unsupported_grant_type`.
2. **IP relaxation / trusted IP ranges.** If the app enforces IP restrictions, calls from a laptop or an autoscaling
   cloud egress range fail with `invalid_grant` even though credentials are correct.
3. **Session timeout.** The access token lives as long as the Run As user's session policy (2 hours in the default
   setup). That is the number your 90-minute TTL is derived from.

> **Interview line:** "Three things break client credentials in practice: the flow is off, no Run As user, or an IP
> policy that doesn't include the caller. All three surface as `invalid_grant`, so I check them in that order."

### 2.5 The bug you actually hit (tell this story — it's your best one)

**Symptom:** `SF_LOGIN_URL=https://login.salesforce.com` → the token request failed. Raw `curl` and jsforce both
failed, so it wasn't a library problem. The ECA credentials were correct, the flow was enabled, the Run As user existed.

**Root cause:** the app is an **External Client App**, registered against your org's **My Domain**. The generic
`login.salesforce.com` front door is the right host for user-facing authorization-code flows, but for this app the
client-credentials grant is served by the **org's own My Domain host**:

```dotenv
SF_LOGIN_URL=https://orgfarm-132e41c593-dev-ed.develop.my.salesforce.com
```

**Proof it was fixed:** token request → `HTTP 200`, `scope: api`, 112-character bearer, `instance_url` = the My Domain
host. Same credentials, one env var changed.

**Extra trap you should mention** (it shows rigour): after that, a probe still failed because you had
`set -a; . ./.env`'d the file into your shell. Exported shell variables **win** over `.env` for both `dotenv` and
`node --env-file`, so the server kept using the old URL. Diagnosis: print `process.env.SF_LOGIN_URL`, not the file.

**The 60-second version for an interviewer:**

> "The integration failed to get a token even though the credentials were right. I isolated it with curl to prove it
> wasn't the SDK, then compared the hosts: the app was an External Client App, which is scoped to the org's My Domain,
> while the env pointed at the generic login host. I changed `SF_LOGIN_URL` to the My Domain URL and got a 200 with an
> `api`-scoped token. I also hit an env-shadowing trap where an exported shell variable overrode `.env`, which is now
> documented in the README so the next person doesn't lose an hour to it."

**Transferable lesson:** *authentication failures are usually routing or identity, not secrets.* Check host → flow
enabled → Run As user → IP policy → credentials, in that order.

### 2.6 Token lifecycle and why your client caches

- An access token is a **bearer** credential: whoever holds it is the Run As user until it expires. It must never reach
  the browser, logs, or a git repo. Yours stays in server memory only (§3.3).
- Expiry: session timeout (≈2 h default). Salesforce can also invalidate earlier (admin revokes, user deactivated,
  password/session policy change), which is why you handle `INVALID_SESSION_ID` **reactively** as well as by TTL.
- No refresh token in client credentials → the only recovery is to mint a new one. That's a single extra HTTP round trip,
  not a user-visible re-login.
- Your design: cache one connection, recycle it at 90 minutes (safely under 2 h), and on `INVALID_SESSION_ID` drop the
  cache and retry **exactly once**. Never cache a rejected promise.

> **Interview line:** "I treat the token as an implementation detail of the server. It's cached in memory, refreshed on a
> TTL shorter than the session timeout, and rebuilt reactively if Salesforce invalidates it mid-flight."

---

## 3. Your implementation, layer by layer

### 3.1 The request lifecycle (memorise this)

```
Browser (Vue 3 + Pinia)
  │  fetch('/api/accounts')          ← no token, no secret, same-origin
  ▼
Vite dev server (5173)  ──proxy /api──►  Express (4000)
                                          │ helmet, cors, json(32kb), no-store, logger
                                          ▼
                                        Router  /api/accounts
                                          │ zod validate → AccountInput
                                          ▼
                                        AccountService  (interface in types/services.ts)
                                          │ createSalesforceAccountService()
                                          ▼
                                        withSalesforceConnection(op)
                                          │ getConnection()  → cached promise (90 min TTL)
                                          │   └─ OAuth2.requestToken({grant_type:'client_credentials'})
                                          ▼
                                        jsforce Connection(instanceUrl, accessToken, v62.0)
                                          │ sobject('Account').find/create/update/destroy
                                          ▼
                                        Salesforce REST API  →  Account record
                                          │
                                          ▼
                                        DTO mapping { Id→id, Name→name, Industry→industry }
                                          │
                                          ▼
Browser  ◄── 201/200/204 JSON (or {error:{code,message}})  ◄── error handler
```

Two properties to highlight:

1. **The trust boundary is Express.** Everything secret lives left of the browser. The SPA has no Salesforce knowledge
   beyond your own JSON contract.
2. **There is exactly one seam for testing.** Routes depend on `AccountService`, not on jsforce (§3.9).

> **Interview line:** "The browser never sees a Salesforce credential. Vite proxies `/api` in dev so it's same-origin;
> in production Express serves the built SPA, so it stays same-origin there too."

### 3.2 Configuration: fail fast, one source of truth

`server/src/config/env.ts` is the most "production-minded" file in the repo. Things worth defending:

- **Zod-validated, typed, fail-fast.** Bad config throws at boot with a bullet list, instead of surfacing as a confusing
  runtime error three screens later. `env` is `z.infer`-typed, so `env.PORT` is a `number`, not a string.
- **Cross-field rules** via `superRefine`: credentials are required **unless** `SF_MOCK=true`, and `SF_MOCK` is
  **refused** when `NODE_ENV=production`. That's how you stop demo data from ever reaching a real deployment.
- **`.env` is located relative to the module**, not `process.cwd()`, so `npm run dev` works from the repo root, from
  `server/`, and inside Docker (where env is injected instead).
- **Precedence is deliberate:** real environment variables > `.env` file. That's why the `set -a; . ./.env` incident in
  §2.5 was so confusing — an exported var silently won.

> **Interview line:** "Config is validated once at startup, and the app refuses to boot in an invalid state. The mock
> mode is explicitly unreachable in production, so there's no path where fake data looks real."

### 3.3 The connection cache (`server/src/salesforce/client.ts`)

Four small decisions, each with a reason:

```ts
const CONNECTION_TTL_MS = 90 * 60 * 1000;        // under the ~2 h session timeout
let cached: { promise: Promise<Connection>; createdAt: number } | null = null;
```

1. **Cache the promise, not the value.** Concurrent requests during a cold start all await the *same* token request.
   Without this, ten simultaneous page loads would mint ten tokens (and burn ten API calls).
2. **TTL of 90 minutes.** Proactive refresh before Salesforce's session expiry, so a request rarely pays the mint cost.
3. **Never cache a rejection.** `.catch` resets `cached = null` before rethrowing; the next request retries instead of
   inheriting a poisoned cache.
4. **Retry once, reactively.** `withSalesforceConnection` catches only session errors (`INVALID_SESSION_ID`,
   `INVALID_AUTH_HEADER`), resets the cache, and re-runs the operation. Everything else propagates untouched.

```ts
export async function withSalesforceConnection<T>(
  operation: (connection: Connection) => PromiseLike<T>,
): Promise<T> {
  try {
    return await operation(await getConnection());
  } catch (error) {
    if (!isSalesforceSessionError(error)) throw error;
    resetConnection();
    return operation(await getConnection());
  }
}
```

Also note what it **doesn't** do: no refresh-token logic (client credentials has none), no disk cache, no multi-tenant
registry. Those are deliberate scope cuts (§7).

> **Interview line:** "One connection per process, cached promise for single-flight, 90-minute TTL under the session
> timeout, plus a single reactive retry on `INVALID_SESSION_ID`. A failed token request is never cached."

### 3.4 The Salesforce gateway (`accountService.ts`)

This is where Salesforce's shape becomes your API's shape.

| Concern | Implementation | Why |
| --- | --- | --- |
| **Field names** | `toAccount()` maps `Id/Name/Industry` → `id/name/industry` | The browser shouldn't speak Salesforce; your DTO is the contract. |
| **Nulls** | `record.Industry ?? null` | Salesforce omits empty fields; the UI gets a stable `null`. |
| **Create response** | Built from validated input + returned `result.id` | Saves one API call (and one unit of the daily quota). |
| **Update payload** | Only fields that were sent (`patch.name !== undefined`) | A partial `PATCH` must not blank fields it didn't mention. |
| **Update response** | `readAccount(id)` after the write | Returns what Salesforce actually stored, including flow/validation-rule changes. |
| **Delete** | `sobject('Account').destroy(id)` + `assertSaved` | jsforce resolves a `SaveResult`, which can still mean failure. |
| **SOQL safety** | `escapeSoqlString(id)` even though the ID is regex-validated | One obvious escape point; safe if reused for user input later. |
| **Errors** | `assertSaved` routes `SaveResult.errors[0]` into the central translator | Same error envelope whether jsforce threw or the record was rejected. |

The two subtle ones interviewers like:

**(a) `SaveResult` is not a success signal.** `create/update/destroy` resolve with
`{ id, success: false, errors: [{ errorCode, message }] }` for validation failures — no exception. If you only
`await`ed, you'd return `201` for a rejected record. `assertSaved` is the guard.

**(b) Read-after-write is a tradeoff, not a freebie.** It costs one API call, but guarantees the UI shows the truth
after automation. You applied it only to `update`, where the UI needs fields the `PATCH` didn't include, and skipped it
on `create`, where the input already is the record. That asymmetry is exactly the kind of thing to explain out loud.

> **Interview line:** "jsforce resolves a `SaveResult` even when Salesforce rejects the record, so I assert on
> `success` and translate the error through the same mapper. I re-read after update because org automation can change
> fields, but I don't re-read after create — that would spend an API call for data I already have."

### 3.5 The HTTP contract (`routes/accounts.ts`)

| Endpoint | Validation | Success | Notes |
| --- | --- | --- | --- |
| `GET /api/accounts` | — | `200` + `Account[]` | Wrapped in the cached connection; 1 API call. |
| `POST /api/accounts` | `strictObject{ name, industry? }` | `201` + `Location: /api/accounts/{id}` | Unknown fields **rejected**; blank industry → `null`. |
| `PATCH /api/accounts/:id` | `strictObject{ name?, industry? }` + "at least one field" | `200` + refreshed `Account` | Partial update semantics. |
| `DELETE /api/accounts/:id` | id regex | `204` | Soft delete in Salesforce. |

Details that show intent:

- **`z.strictObject`** rather than a permissive object: a typo'd field (`{ nmae: "x" }`) is a `400`, not a silently
  ignored input that creates an account called *null*.
- **`.trim()` + `.min(1)`** normalises whitespace before validation, so `"   "` fails as "Name is required".
- **`industry` accepts string or `null`, blank → `null`** — the "clear this field" case is explicit rather than ambiguous.
- **`201` + `Location`** is the correct REST idiom for a create; a client can follow the header later.
- **`204` with no body** for delete, so `apiRequest()` in the client returns `undefined` instead of trying to parse JSON
  (`client/src/api/accounts.ts` special-cases `204`).
- **Express 5 async handlers**: rejected promises reach the error middleware without a `try/catch` wrapper — one less
  thing to forget per route.

> **Interview line:** "The routes are thin: validate the shape, delegate, choose the status code. Strict objects mean a
> misspelled field fails loudly instead of creating bad data."

### 3.6 Error translation (`salesforce/errors.ts` + `middleware/errorHandler.ts`)

Salesforce errors arrive in *many* shapes: thrown objects with `errorCode`, OAuth bodies with `error`/
`error_description`, Node network errors with `code`, and arrays of `SaveResult` errors. `flatten()` normalises all of
them, then a lookup table maps them onto your public envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Name is required.",
             "details": [{ "field": "name", "message": "Name is required." }] } }
```

| Salesforce code | Your status + code | Why that status |
| --- | --- | --- |
| `INVALID_FIELD`, `MALFORMED_QUERY`, `INVALID_TYPE` | `400 SALESFORCE_BAD_QUERY` | The request/SOQL was wrong; retrying won't help. |
| `REQUIRED_FIELD_MISSING`, `STRING_TOO_LONG`, `FIELD_CUSTOM_VALIDATION_EXCEPTION` | `422 SALESFORCE_VALIDATION_FAILED` | Well-formed, but org rules rejected it. |
| `DUPLICATE_VALUE` | `409 DUPLICATE_ACCOUNT` | A conflict with existing state. |
| `NOT_FOUND`, `ENTITY_IS_DELETED` | `404 ACCOUNT_NOT_FOUND` | The resource is gone (or invisible to the Run As user). |
| `MALFORMED_ID`, `INVALID_ID_FIELD` | `400 INVALID_ACCOUNT_ID` | Bad identifier. |
| `REQUEST_LIMIT_EXCEEDED` | `429 SALESFORCE_LIMIT_EXCEEDED` | Org quota; retry later, not now. |
| `invalid_client*`, `invalid_grant`, `401` | `502 SALESFORCE_AUTH_FAILED` | *Your* credentials/service are broken — not the caller's fault. 502, not 401. |
| `INVALID_SESSION_ID` | `401 SALESFORCE_SESSION_EXPIRED` | Session gone even after one retry; the client may retry. |
| `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT` | `503 SALESFORCE_UNREACHABLE` | Network/DNS/TLS failure. |
| `SERVER_UNAVAILABLE`, `UNABLE_TO_LOCK_ROW` | `503 SALESFORCE_UNAVAILABLE` | Transient upstream. |

The security posture matters more than the table:

- **Only `HttpError` is considered browser-safe.** Anything else becomes a generic `500` — no stack traces, no raw
  Salesforce payloads (which can include org metadata), no `error_description` from OAuth.
- **5xx detail is logged server-side** (`console.error` in `createErrorHandler`), not returned.
- **`res.headersSent` guard**: if the response already started, delegate to Express instead of throwing a second time.
- **No-store on all `/api` responses** so limits and account data can't be cached by a proxy.

> **Interview line:** "I map Salesforce's error taxonomy onto HTTP semantics so callers can branch: 400 fix the payload,
> 404 refresh, 409 resolve the duplicate, 422 fix the data, 429 back off, 502/503 retry or escalate. Everything
> unexpected is a 500 with no internals in the body."

### 3.7 Hardening in `app.ts`

| Setting | Value | Reason |
| --- | --- | --- |
| `helmet()` | defaults | Sensible security headers for free (CSP-ish headers, `nosniff`, frameguard). |
| `cors` | allowlist from `CLIENT_ORIGIN`, `maxAge: 600` | Only your SPA origin may call cross-origin; no wildcard. |
| `express.json` | `limit: '32kb'` | The largest legitimate payload is a name and an industry. |
| `Cache-Control` | `no-store` on `/api` | Live org data must never be cached. |
| `x-powered-by` | disabled | Don't advertise the stack. |
| `trust proxy` | `1` | Correct client IP/protocol behind a reverse proxy. |
| SPA fallback | only for `GET/HEAD` + `Accept: text/html`, 404 for file-like paths | A missing `/assets/x.js` must not return HTML. |
| Static assets | `immutable` for hashed `/assets`, `no-store` for `index.html` | Correct caching for Vite's fingerprinted bundles. |

**CORS vs CSRF, be ready for this one:** there are no cookies or ambient credentials in this app, so CSRF is not the
threat model — a cross-site form post can't add a JSON `Content-Type` without a preflight, and there's no session cookie
to ride. CORS here is about *who may read responses*, not about protecting a cookie.

> **Interview line:** "No cookies means no CSRF surface; CORS is a read-restriction, not auth. The real access control is
> that the API is only reachable from inside the network — and in a real deployment I'd put SSO in front of it."

### 3.8 The Vue layer

Two Pinia stores, deliberately separate:

- `stores/accounts.ts` — items, loading/saving/deleting flags, search, `lastSyncedAt`, `hasLoadedOnce`, error message
  **and field-level error details**. `filteredAccounts` is a `computed` so search re-renders without refetching.
- `stores/org.ts` — limits + mode/API version. `Promise.allSettled([limits, health])` means a limits failure can't blank
  the account list; they're independent concerns and the UI degrades gracefully.

Notable behaviour to describe:

- **Writes update the store locally instead of refetching.** `create` prepends the returned record (matching the
  `LastModifiedDate DESC` ordering), `update` replaces in place ("reordering mid-edit would be disorienting"), `delete`
  filters it out. That's one fewer API call per mutation — which matters against a 15,000/day budget.
- **`ApiError` carries `status`, `code`, `details`.** The form renders `details[field]` next to the input; the toast
  shows `message`. That's the whole reason the server bothers to emit a structured envelope.
- **`hasLoadedOnce`** distinguishes "first load" skeletons from "refreshing" state, avoiding a flash of empty state.
- **Accessibility**: labelled controls, focus-trapped modals, Escape to close, `aria-live` status, visible focus rings,
  reduced-motion support. Interviewers notice this — it's usually the first thing cut in a demo project.
- **Responsive**: table on desktop, stacked cards on narrow screens with the same semantics.

> **Interview line:** "The store is the single source of truth for the list; mutations patch it locally rather than
> refetching, which keeps the UI instant and saves API calls. Errors are typed, so the form can show field-level
> messages from Salesforce's validation response."

### 3.9 Testing and the seam that makes it possible

- `types/services.ts` defines `AccountService` and `LimitsService`. `createApp({ services })` takes them as a parameter.
  **The HTTP layer has never heard of jsforce.** That's dependency inversion, and it's the reason the suite runs with no
  credentials and no network.
- Server tests use **Supertest against the real Express app** with fake services: status codes, envelopes, validation,
  404 routing, CORS, SPA fallback. Not mocks of Express internals — real HTTP in, real HTTP out.
- Client tests cover the Pinia store (happy path + API failure + local list mutation) and formatting utilities.
- **55 tests green, typecheck clean** on both workspaces. CI runs typecheck → test → build.

What's *not* covered, and you should say so: no contract test against a real org (deliberate — it would need secrets and
burn API calls), no E2E browser test, no load test.

> **Interview line:** "I inverted the dependency so routes take a service interface. That lets Supertest exercise the
> real Express stack with fakes — fast, deterministic, no credentials in CI — and the same interface is what makes the
> mock mode possible."

### 3.10 Packaging and CI

- **Multi-stage Dockerfile**: build stage installs dev deps and compiles server + SPA; runtime stage runs
  `node server/dist/index.js` with `SERVE_CLIENT=true`, so one container serves API and static files (no CORS in prod,
  no second web server). Secrets are injected at runtime, never baked into a layer.
- **`HEALTHCHECK`** hits `/api/health`.
- **Two compose files**: `docker-compose.yml` (live, env from your `.env`) and `docker-compose.demo.yml` (`SF_MOCK=true`)
  so a reviewer can see the UI without an org.
- **GitHub Actions**: `npm ci` → `typecheck` → `test` → `build` with `NODE_ENV=development` (because production env
  validation would demand real credentials it must not have).

> **Interview line:** "One image serves the API and the built SPA, so production is same-origin and the CORS allowlist is
> only needed for dev. CI runs typecheck, tests and build on every push; credentials never enter CI."

---

## 4. What you actually proved live (use these numbers)

| Check | Result |
| --- | --- |
| Token request (raw curl + jsforce) | `HTTP 200`, `scope: api`, 112-char bearer, `instance_url` = My Domain host |
| `GET /api/health` | `mode: "live"`, `salesforceApiVersion: "62.0"` |
| `GET /api/limits` | `DailyApiRequests` max **15,000**; data storage **5 MB**, file storage **20 MB** |
| `POST /api/accounts` | **201**, id `001g8000016WD7qAAG` (18-char, `001` prefix) |
| `GET /api/accounts` | new record first (LastModifiedDate DESC) |
| `PATCH /api/accounts/{id}` | **200**, updated `Industry` reflected after read-after-write |
| `DELETE /api/accounts/{id}` | **204** |
| Follow-up GET on deleted id | **404** `ACCOUNT_NOT_FOUND` |
| `queryAll` for the deleted id | present with `IsDeleted: true` (Recycle Bin, 15 days) |
| Static analysis / tests | typecheck clean, **55 tests** green |

Talking about *evidence* rather than *vibes* is what separates "I followed a tutorial" from "I verified an integration".
Mention the Recycle Bin detail specifically: it proves you understood what DELETE actually does at the platform level.

> **Interview line:** "I verified end-to-end against a real org, not just the SDK's happy path: 201 with a real
> 18-character Account ID, 200 after a partial update, 204 on delete, 404 afterwards, and the record still present in
> `queryAll` with `IsDeleted: true` because Salesforce soft-deletes into a 15-day Recycle Bin."

---

## 5. The story you tell

### 5.1 The 60-second pitch (say it almost verbatim)

> "I built a Salesforce Account Manager: a Vue 3 + TypeScript SPA on an Express API that does full CRUD on the standard
> Account object in a real Developer Edition org.
>
> The interesting part is the integration. The browser never sees a Salesforce credential — Express holds an External
> Client App's key and secret and authenticates with the OAuth 2.0 Client Credentials flow through jsforce. It caches one
> connection, recycles it before the session timeout, and retries once if Salesforce invalidates the session.
>
> On the API side I validate with Zod, map Salesforce's `Id`/`Name`/`Industry` into a camelCase contract, and translate
> Salesforce's error codes into HTTP semantics — 422 for a validation rule, 409 for a duplicate, 429 when the org's
> 15,000-call daily API budget is exhausted. The UI shows live org limits, so you can watch the budget decrement.
>
> The bug I'm proudest of: the token request was failing even though the credentials were correct. I isolated it with
> curl to prove it wasn't the SDK, then found the app was an External Client App — scoped to the org's My Domain — while
> the config pointed at the generic `login.salesforce.com` host. One env var change, and I had a 200 with an `api`-scoped
> token. I documented the trap, plus an env-shadowing gotcha, in the README.
>
> It's tested with Supertest against the real Express app using service fakes — 55 tests, no credentials in CI — and it
> ships as a multi-stage Docker image where Express serves the built SPA."

That's ~230 words. Practise until it's 60–70 seconds without notes.

### 5.2 "Why" table — the questions behind the questions

| Decision | Alternative you rejected | Why | What it costs |
| --- | --- | --- | --- |
| Client Credentials | Authorization Code / JWT Bearer | Server-to-server tool with no per-user identity; zero interactive auth | No per-user audit; single blast radius |
| jsforce | Raw `fetch` to REST | Handles OAuth, token refresh plumbing, SOQL paging, sObject calls | One dependency; must learn its error shapes |
| Backend-for-frontend | Call Salesforce from the browser | Secrets must never ship to a browser; also solves CORS | An extra hop and a service to run |
| Service interfaces | Routes import jsforce directly | Testability without credentials; mock mode falls out for free | Slight indirection |
| Zod at the edge | Trust the client / validate in Vue only | Server is the trust boundary; typed errors with field detail | Duplicate validation rules in UI and API |
| DTO mapping | Pass raw Salesforce JSON through | Stable public contract; camelCase; UI decoupled from org schema | Mapping code to maintain |
| `LIMIT 20` + client search | Server-side search from day one | Only 20 records exist in the UI; no need for a query per keystroke | Doesn't scale past one page (§7) |
| Local store mutation | Refetch after every write | Instant UI + saves API calls against a 15k/day budget | Possible drift from org automation |
| Read-after-write on update only | Always / never | Updates can be altered by flows; creates already return the input | One extra API call on update |
| Structured error envelope | Plain text / raw Salesforce body | Callers can branch; no metadata leakage | A mapping table to maintain |
| `SF_MOCK` demo mode | Require an org to review | Reviewers can see the UI instantly; blocked in production by env validation | A second implementation of the service |

The last column is the one candidates forget. **Every choice has a cost; naming it is what makes you credible.**

### 5.3 Five-minute deep dive outline

1. **Scope** — one object, three fields, CRUD + telemetry. Why scoping matters.
2. **Trust boundary** — browser → `/api` → Express → jsforce. No token client-side.
3. **Auth** — ECA, client credentials, Run As user, My Domain host, 90-min TTL, single retry.
4. **Contract** — Zod in, camelCase DTO out, strict objects, 201/204, structured errors.
5. **Resilience** — error taxonomy, no-store, fail-fast config, mock mode refused in prod.
6. **Proof** — live 201/200/204/404, Recycle Bin `IsDeleted`, 15,000-call budget, 55 tests, Docker.
7. **Honest gaps** — per-user identity, pagination, server-side search, no auth on *your* API, no rate limiting.

### 5.4 When you don't know

Use this shape, every time:

> "I haven't done that in production. Based on what I know, I'd expect X because Y — and I'd verify by Z."

Example: *"I haven't used Bulk API 2.0 directly. I'd expect it's asynchronous job + batches, because that's how you get
past per-call size limits, and I'd verify by checking the ingest job status endpoint before assuming success."*

That answer is worth more than a bluff. Interviewers are testing how you think when the answer isn't memorised.

---

## 6. Q&A bank

### A. Platform fundamentals

**Q1. What is a Salesforce org, and what kind did you use?**
A Developer Edition org — a real, permanent instance with full API access and small storage. It's the lowest-friction way
to verify a live integration without touching a customer's production.

**Q2. Standard vs custom objects?**
Standard objects ship with Salesforce (Account, Contact, Opportunity). Custom objects are defined in Setup and their API
names end in `__c`. I worked with Account only.

**Q3. What's inside an Account record?**
`Id` (18-char, `001` prefix), `Name` (required text), `Industry` (picklist), plus ownership, record type, sharing, and
whatever custom fields the org adds. My contract exposes only id/name/industry.

**Q4. 15- vs 18-character IDs?**
Same record. The 18-character form appends a checksum so matching is case-insensitive — needed when IDs pass through
spreadsheets. I accept both and validate with a regex before they reach a URL or SOQL.

**Q5. SOQL vs SQL?**
No `SELECT *`, no joins (relationship subqueries instead), `LIMIT`/`OFFSET` with an OFFSET cap, a 50,000-row query cap
with `queryMore` paging, and it runs through the platform's query optimiser. It also respects field-level security.

**Q6. SOQL vs SOSL?**
SOQL filters and lists one object graph. SOSL is full-text search across objects — better for a global search box. I used
SOQL; search in my app is client-side over the 20 loaded records.

**Q7. Governor limits vs API limits?**
Governor limits are per transaction (queries, DML rows, CPU, heap) and protect the shared platform. API limits are an
org-wide 24-hour request budget; my DE org gets 15,000, which I surface in the UI.

**Q8. What happens when you delete a record?**
Soft delete into the Recycle Bin for 15 days. Normal SOQL hides it; `queryAll` returns it with `IsDeleted: true`.
Permanent removal is `emptyRecycleBin` (SOAP) or the Setup UI. I verified both live.

**Q9. What can block a write besides my own validation?**
Validation rules, required fields, FLS, restricted picklists, duplicate rules, and before-save flows. That's why a
well-formed payload can still get a 422 or 409.

**Q10. What is a sandbox, and why would you need one?**
A copy of production for UAT/regression. My app is environment-agnostic — login URL, credentials, API version are config
— so promotion is a config change, not a code change.

### B. OAuth and security

**Q11. Walk me through your authentication.**
Express builds a jsforce `OAuth2` client with the ECA's consumer key/secret and posts `grant_type=client_credentials` to
the My Domain host's `/services/oauth2/token`. The response returns an access token and `instance_url`; I construct a
`Connection` from those and cache it.

**Q12. Why client credentials?**
Server-to-server, no per-user identity, no interactive login. If I needed per-user permissions or attribution, I'd switch
to Authorization Code with PKCE (secret kept server-side) or JWT bearer for secretless server auth.

**Q13. External Client App vs Connected App?**
Same role: the registration holding consumer key/secret, enabled OAuth flows, scopes, Run As user, and IP policy. ECA is
the newer packaging with settings and policies separated; Connected App is the legacy one most docs still show.

**Q14. Where does the client secret live?**
Only in the server's environment and memory. Never in the SPA bundle (no `VITE_` prefix), never in a log; the startup
banner prints only the last four characters of the consumer key.

**Q15. Why isn't the access token sent to the browser?**
A bearer token *is* the Run As user. The browser talks to `/api` same-origin; Express attaches the token server-side. That
also means no CORS in production and no token sitting in devtools history.

**Q16. How do you handle token expiry?**
Proactively: 90-minute TTL, under the ~2-hour session timeout. Reactively: on `INVALID_SESSION_ID`, drop the cache and
retry exactly once. Failed token requests are never cached.

**Q17. Why not store the token in Redis or on disk?**
Unnecessary for one process and it increases exposure. At many instances I'd accept one token per instance rather than
build a shared token service. Multi-tenant would need a per-tenant secret store and connection registry.

**Q18. Blast radius if the secret leaks?**
Whoever holds it is the Run As user until expiry or rotation. Mitigations: least-privilege Run As user, secret manager,
short session timeout, rotation, and monitoring login/API history in the org.

**Q19. What is the Run As user, and what should it be allowed to do?**
The identity the flow impersonates. A dedicated integration user with CRUD on Account, read on the fields it needs, no
admin rights — permissions, FLS and sharing all derive from that user.

**Q20. Three settings that break client credentials?**
Flow disabled, no Run As user, IP restrictions excluding the caller. All three usually surface as `invalid_grant`, so I
check host → flow → user → IP → credentials.

**Q21. Your token request failed with correct credentials. What did you do?**
Reproduced with raw curl to prove it wasn't the SDK, compared hosts, and found the ECA is scoped to My Domain while config
pointed at `login.salesforce.com`. Changed `SF_LOGIN_URL` to the My Domain host → 200 with `scope: api`. Then hit an
env-shadowing issue where an exported shell variable overrode `.env`, now documented.

### C. Integration and API design

**Q22. Why a backend instead of calling Salesforce from Vue?**
Secrets can't ship to a browser, and Salesforce's OAuth/CORS behaviour isn't designed for a distributed SPA. A BFF also
gives me one place for validation, error translation, caching, and audit logging.

**Q23. Why jsforce?**
It handles OAuth token requests, `instance_url` wiring, SOQL paging, and sObject CRUD, so my code is about the domain. The
cost is learning its error shapes — which is why I built one translator instead of scattering error handling.

**Q24. How do you prevent SOQL injection?**
IDs are regex-validated before use, and `escapeSoqlString()` escapes backslashes and quotes at the single interpolation
point. For free-text search I'd use the same escape plus server-side `LIKE`, never raw string concatenation.

**Q25. Why map `Id/Name/Industry` to `id/name/industry`?**
A stable public contract. If the org renames a label or adds a custom field, my API doesn't change, and consumers don't
need to learn Salesforce's naming conventions.

**Q26. Why strict Zod objects?**
Unknown keys usually mean a client bug (`nmae`). Rejecting them turns silent data corruption into a 400 with a field
message. It also prevents mass-assignment: a caller can't set fields I didn't declare.

**Q27. Why 201 with `Location`, and 204 for delete?**
REST idiom: a create returns the new resource and where to find it; a delete returns no content. My client special-cases
204 so it doesn't try to parse an empty body.

**Q28. Why re-read after PATCH but not after POST?**
`PATCH` may include one field, so the response needs the full record — and org automation may have changed other fields.
`POST` already has the full input plus the new id, so re-reading would waste an API call.

**Q29. Why 502 instead of 401 for bad credentials?**
401 means *the caller* is unauthenticated. Bad service credentials are my problem, not theirs — 502 says "upstream
dependency failed". Correct semantics let clients and dashboards react differently.

**Q30. How would you scale the list to 100,000 accounts?**
Keyset pagination (`WHERE LastModifiedDate < :cursor ORDER BY LastModifiedDate DESC`), server-side search on an indexed
field or SOSL, a `nextCursor` in the response, and virtualised rendering. For exports: Bulk API 2.0, not REST paging.

**Q31. How would you cut API consumption?**
Cache reference data, larger page sizes, Composite API for multi-write screens, batch reads into one SOQL, and replace
polling with Change Data Capture/Platform Events. I already avoid a refetch after mutations and a read-back after create.

**Q32. How do you handle 429?**
Don't retry immediately. Surface it, back off with jitter, and alert before exhaustion — e.g. warn at 80% of the daily
budget. The limits badge is the low-effort version of that.

**Q33. What changes for multi-tenant (one app, many customer orgs)?**
Per-tenant credentials in a secret manager keyed by org id, a connection cache per tenant, tenant routing on every
request, per-tenant API budgets, and per-tenant health checks so one org's outage doesn't take down the others.

**Q34. How do you rotate the client secret without downtime?**
Existing access tokens stay valid until expiry, so rotate the secret, update the secret store, and roll the service; new
tokens mint with the new secret. For a stricter cutover, run two ECAs briefly and switch config.

### D. Node, Express, TypeScript

**Q35. Why TypeScript on both sides?**
The DTO is declared on both sides and `vue-tsc` plus `tsc --noEmit` catch drift at build time. Runtime validation still
exists (Zod), because types vanish at runtime.

**Q36. Why ESM (`"type": "module"`) and `.js` import specifiers?**
Node's ESM resolver requires explicit extensions for relative imports; `tsx` and `tsc` preserve them. ESM is the current
default for new Node services and matches jsforce's packaging.

**Q37. How do async errors reach your error middleware?**
Express 5 forwards rejected promises from async handlers automatically, so routes stay free of `try/catch`. One error
handler maps anything thrown into the envelope.

**Q38. Middleware order — why does it matter?**
helmet → cors → json(32kb) → logger → no-store → routers → `/api` 404 → static/SPA → error handler. Order decides what
runs before a route and what can still answer; the JSON 404 must precede the SPA fallback or unknown API paths would
return HTML.

**Q39. How do you shut down cleanly?**
`SIGINT`/`SIGTERM` close the HTTP server then exit; a 10-second unref'd timer forces exit if a keep-alive socket hangs.
That matters for rolling deploys and container stops.

**Q40. What would you add for high traffic?**
Structured logging with request ids (pino), metrics/tracing (OpenTelemetry), rate limiting on my own API, a shared cache,
and a queue for slow writes.

### E. Vue front end

**Q41. Why Pinia instead of component state?**
Two independent domains (accounts, org telemetry) with cross-component consumers. A store gives one source of truth,
computed selectors, and tests without mounting components.

**Q42. Why is search client-side?**
The list is capped at 20 records, so a `computed` filter is instant and free. Server-side search becomes necessary once
there's pagination — at which point each keystroke costs an API call against a 15k/day budget, so I'd debounce and require
at least two characters.

**Q43. How does the UI stay consistent after a write?**
The store applies the server's response: prepend on create, replace in place on update, filter out on delete. No refetch,
no flicker, and the `LastModifiedDate DESC` ordering is preserved.

**Q44. How are Salesforce validation errors shown inline?**
The server returns `details: [{field, message}]`; `ApiError` parses them; the form maps them by field name onto the
relevant input. The toast shows the top-level message.

**Q45. Anything you'd change in the front end?**
Add `GET /api/accounts/:id` so `Location` is followable, virtualise larger pages, add a Playwright E2E for
create→edit→delete, and add optimistic updates with rollback.

### F. Testing, ops, and delivery

**Q46. How do you test without a Salesforce org?**
The route layer depends on `AccountService`, so tests inject fakes and drive the real Express app through Supertest. No
secrets, no network, deterministic. The same seam powers `SF_MOCK=true` for reviewers.

**Q47. What don't your tests cover?**
No contract test against a real org, no E2E browser test, no load test. I verified live behaviour manually and documented
it; the next step would be a nightly smoke test against a scratch org using JWT bearer credentials.

**Q48. How is the app configured in production?**
Env vars injected at runtime (`SF_LOGIN_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_API_VERSION`, `SERVE_CLIENT=true`).
Validation fails the boot if anything is missing, and `SF_MOCK` is rejected when `NODE_ENV=production`.

**Q49. How do you know the service is healthy?**
`/api/health` reports mode, API version, and uptime; the container `HEALTHCHECK` polls it. It's a *liveness* check — it
doesn't call Salesforce. A readiness check that mints a token would be stronger, at the cost of API calls.

**Q50. How would you deploy this to a regulated enterprise?**
Container into ECS/Kubernetes behind an ALB, secrets in AWS Secrets Manager or Vault, egress allowlist to the My Domain
host, SSO in front of the UI, structured logs to CloudWatch/Splunk, alerts on 5xx rate and API-budget burn, and a runbook
for secret rotation.

### G. Debugging and scenarios

**Q51. Walk me through what happens when a user clicks Save.**
Form validates → `accountsApi.create()` POSTs JSON → Express validates with Zod → service maps to Salesforce field names →
`withSalesforceConnection` reuses or mints the token → jsforce POSTs to `/sobjects/Account` → Salesforce returns id +
success → service returns `{id,name,industry}` → route responds 201 + `Location` → store prepends → toast fires.

**Q52. The UI shows 502 "Salesforce rejected the server credentials". What now?**
Check the ECA: flow enabled, Run As user active and licensed, IP relaxation, secret matches, and `SF_LOGIN_URL` is the My
Domain host. Then confirm the server actually loaded the values (`process.env`, not just the file).

**Q53. Everything 401s after working for hours. Why?**
Session expired or was revoked. My client retries once on `INVALID_SESSION_ID`; if it still fails, the Run As user was
deactivated, the session policy changed, or an admin revoked the app. Server logs show the retry; org login history shows
the revocation.

**Q54. A user says "the account I deleted is still in the org".**
That's the Recycle Bin — 15-day soft delete, visible to `queryAll` with `IsDeleted: true`. Not a bug; purge it in Setup if
it must be gone immediately.

**Q55. Create returns 422 but the form looks valid. How do you debug?**
Read the Salesforce `errorCode` and message (I surface them safely), then check validation rules, required fields, FLS,
and restricted picklist values in Setup. The payload was structurally fine — the org's metadata wasn't.

**Q56. The limits badge shows exhaustion but you only made a few calls.**
Something else consumes the org budget: another integration, data loads, managed packages, or a retry loop. `/limits` is
org-wide, not per-app. Check Setup → Company Information and the API usage report.

---

## 7. Weak spots — say these before they find them

Interviewers trust candidates who volunteer limits. These are real, and each has a one-line mitigation.

| # | Gap | Why it exists | What I'd do next |
| --- | --- | --- | --- |
| 1 | **Your own API is unauthenticated.** Anyone who can reach `:4000` can CRUD the org as the integration user. | Local/demo scope; it's a trusted-network tool. | Put SSO/OIDC in front (or an API gateway), add per-user authorisation, and never expose it publicly as-is. |
| 2 | **One identity for everyone** (client credentials). | No per-user requirement in the brief. | Authorization Code + PKCE or JWT bearer with a per-user mapping; keep the secret server-side. |
| 3 | **No pagination; list capped at 20.** | Deliberate scope for a demo-sized org. | `nextCursor` + keyset paging (`LastModifiedDate`, `Id`), infinite scroll. |
| 4 | **Search is client-side.** | Only 20 records in memory; no query per keystroke. | Server-side `LIKE`/SOSL with a debounce and a minimum length. |
| 5 | **No `GET /api/accounts/:id`** even though create returns its `Location`. | The UI never needed a detail page. | Add the route; it makes `Location` honest and supports deep links. |
| 6 | **No retry/backoff for 429/503.** Only the session retry exists. | Retries without backoff make quota problems worse. | Exponential backoff with jitter for idempotent calls, a circuit breaker, and a queue for writes. |
| 7 | **No HTTP caching / ETag.** Every refresh is an API call. | Data changes often; caching adds staleness risk. | Cache limits for ~30 s, use ETag/`If-None-Match` where supported, and cache reference data longer. |
| 8 | **No last-write-wins protection.** Two editors can overwrite each other. | Out of scope for a single-user console. | `If-Unmodified-Since` / `SystemModstamp` check, or a version field in the DTO. |
| 9 | **`console.log` request logging, no request ids or metrics.** | Keeps dependencies small. | pino + request id, OpenTelemetry traces, 5xx/latency/API-budget dashboards. |
| 10 | **Secrets live in `server/.env` for local dev.** | Convenient and gitignored. | Secret manager in every real environment; rotation runbook; never bake into images. |
| 11 | **No contract/E2E test against a real org.** | Credentials must not enter CI; API budget. | Nightly smoke test against a scratch org with JWT bearer, plus Playwright for the UI flow. |
| 12 | **Token cache is per process.** N instances mint N tokens. | Simplest correct design for one instance. | Accept it (tokens are cheap) or centralise if the org's session limits demand it. |
| 13 | **Demo mode is a second implementation.** | Lets reviewers see the UI without an org. | Keep it behind `SF_MOCK` (already refused in production) and treat it as test fixture, not a feature. |
| 14 | **API version is pinned (62.0).** | Predictable behaviour. | Track Salesforce's 3-version support window and bump deliberately; test against a sandbox first. |
| 15 | **Two probe records remain in the Recycle Bin.** | `emptyRecycleBin` (SOAP) returned 404 on this org. | Manual purge in Setup, or ignore — auto-purge in 15 days. |

Phrase it as ownership, not apology:

> "The biggest gap is that my own API has no authentication — it assumes a trusted network. That was fine for a local
> integration demo, but before this faced users I'd put SSO in front of it, add per-user authorization, and rate-limit
> it. I'd also add pagination and a real contract test against a scratch org."

---

## 8. The live demo script (5 minutes, no dead air)

1. **Orient (20 s).** "Vue SPA on the left, Express API in the middle, real Developer Edition org on the right. The
   browser never sees a credential." Point at the header badge: **Live org**.
2. **Show the budget (20 s).** Open the limits badge. "15,000 API calls a day on Developer Edition. Watch it move."
3. **Create (60 s).** Add `Interview Demo Co`, industry `Technology`. Point out the 201 in the network tab, the new row on
   top, and the limits count incrementing. "One API call for the write, zero for the refresh — the store applies the
   response locally."
4. **Validation (40 s).** Submit an empty name → inline error, no API call. Then submit a 300-character name → 400 from
   Zod. "Two different layers: the form is UX, Zod is the contract."
5. **Edit (40 s).** Change the industry. "PATCH, partial payload, and a read-after-write so the UI reflects what
   Salesforce actually stored."
6. **Search (20 s).** Type two letters; the count label changes to "2 of 3 accounts". "Client-side because the page is
   capped at 20 — a query per keystroke would spend the daily budget."
7. **Delete (40 s).** Confirm dialog → 204 → row disappears. Then, in a terminal, `queryAll` shows `IsDeleted: true`.
   "Salesforce soft-deletes into a 15-day Recycle Bin — the 204 means 'no longer visible', not 'gone'."
8. **Failure path (60 s).** Stop the API (or point `SF_LOGIN_URL` at a dead host) and reload. Show the friendly error
   banner and the 503/502 envelope. "No stack trace, no Salesforce internals — and one line in the README tells you what
   to check."
9. **Close (20 s).** "Tests run without credentials because the routes depend on an interface, and the same seam gives you
   the demo mode. One Docker image serves both API and SPA."

Keep a terminal pre-opened with the log tailing so you can show the request line and status code live.

---

## 9. Cheat sheet

### 9.1 SOQL you should be able to write from memory

**The list query this app runs (only the fields the UI needs, newest first, capped):**

```soql
SELECT Id, Name, Industry FROM Account ORDER BY LastModifiedDate DESC LIMIT 20
```

**One record by id:**

```soql
SELECT Id, Name, Industry FROM Account WHERE Id = '001g8000016WD7qAAG' LIMIT 1
```

**Search — escape `'` and `\` in the value:**

```soql
SELECT Id, Name FROM Account WHERE Name LIKE '%acme%' ORDER BY Name LIMIT 50
```

**Recent changes, using date literals:**

```soql
SELECT Id, Name FROM Account WHERE LastModifiedDate = TODAY
SELECT Id, Name FROM Account WHERE CreatedDate > LAST_N_DAYS:30
```

**Related records without a join:**

```soql
SELECT Id, Name, (SELECT Id, LastName FROM Contacts) FROM Account WHERE Id = '001...'
```

**Aggregate:**

```soql
SELECT Industry, COUNT(Id) FROM Account GROUP BY Industry
```

**Including deleted rows — call the `/queryAll` endpoint; do not add an `ALL ROWS` clause:**

```soql
SELECT Id, Name, IsDeleted FROM Account WHERE IsDeleted = true
```


### 9.2 Raw curl against the org (the debugging skill that saved you)

```bash
# 1. token (client credentials)
curl -sS -X POST "$SF_LOGIN_URL/services/oauth2/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode "client_id=$SF_CLIENT_ID" \
  --data-urlencode "client_secret=$SF_CLIENT_SECRET"
# → access_token, instance_url, scope (expect "api")

# 2. identity — GET the "id" URL that came back in the token response
curl -sS "$ID_URL" -H "Authorization: Bearer $TOKEN"
# (the /services/oauth2/userinfo endpoint needs an openid-scoped token; this app requests only "api")

# 3. query
curl -sS -G "$INSTANCE_URL/services/data/v62.0/query" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'q=SELECT Id, Name, Industry FROM Account ORDER BY LastModifiedDate DESC LIMIT 5'

# 4. create
curl -sS -X POST "$INSTANCE_URL/services/data/v62.0/sobjects/Account" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"Name":"Curl Probe"}'
# → 201 {"id":"001...","success":true,"errors":[]}

# 5. update / delete
curl -sS -X PATCH "$INSTANCE_URL/services/data/v62.0/sobjects/Account/$ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"Industry":"Technology"}'
curl -sS -o /dev/null -w '%{http_code}\n' -X DELETE \
  "$INSTANCE_URL/services/data/v62.0/sobjects/Account/$ID" -H "Authorization: Bearer $TOKEN"

# 6. limits
curl -sS "$INSTANCE_URL/services/data/v62.0/limits" -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool | head -40
```

If curl works and the SDK doesn't, the problem is your SDK config. If curl fails too, it's host, credentials, or policy.
That bisection is worth saying out loud in an interview.

### 9.3 `sf` CLI commands worth knowing

```bash
sf org login web -a dev            # browser login, stored as alias "dev"
sf org display -o dev              # shows instance URL, API version, access token
sf org list                        # all authorised orgs
sf data query -o dev -q "SELECT Id, Name FROM Account LIMIT 5"
sf data create record -o dev -s Account -v "Name='CLI Probe' Industry='Technology'"
sf data update record -o dev -s Account -i 001... -v "Industry='Energy'"
sf data delete record -o dev -s Account -i 001...
sf project retrieve start -o dev -m "CustomObject:Invoice__c"
sf project deploy start -o dev
```

### 9.4 Your API's status codes

| Status | Meaning in this app |
| --- | --- |
| `200` | Read or update succeeded. |
| `201` | Account created; `Location` header points at it. |
| `204` | Deleted (soft delete in Salesforce). |
| `400` | Zod validation, bad JSON, bad ID, or bad SOQL. |
| `401` | Session still rejected after one retry. |
| `404` | Account gone/invisible, or unknown `/api` route. |
| `409` | Duplicate rule rejected the record. |
| `413` | Body over 32 KB. |
| `422` | Salesforce validation rule / required field / FLS. |
| `429` | Org's daily API budget exhausted. |
| `500` | Unexpected; details only in server logs. |
| `502` | Bad service credentials or other Salesforce-side failure. |
| `503` | Network/DNS/TLS, or Salesforce temporarily unavailable. |

### 9.5 Repo commands

```bash
npm install            # workspaces
npm run dev            # API :4000 + Vite :5173
npm run build          # tsc + vue-tsc + vite build
npm start              # compiled server (SERVE_CLIENT=true serves the SPA)
npm test               # server suite, then client suite
npm run typecheck
SF_MOCK=true npm run dev          # demo mode, no org
docker compose -f docker-compose.demo.yml up --build
```

### 9.6 Glossary in one line each

- **Org** — one Salesforce instance. **Edition** — the licence tier (DE, Enterprise, Unlimited).
- **sObject** — a Salesforce object/table. **Record** — a row. **Field** — a column; **API name** is what you code against.
- **My Domain** — the org's unique host; where OAuth and REST live.
- **ECA / Connected App** — the app registration holding key/secret and enabled OAuth flows.
- **Run As user** — the identity a client-credentials/JWT token acts as.
- **Access token** — bearer credential for the Run As user; **refresh token** — lets you get a new one (absent here).
- **SOQL / SOSL** — query language / full-text search.
- **Governor limits** — per-transaction caps; **API limits** — org-wide 24-hour request budget.
- **FLS** — field-level security; **OWD/sharing** — record-level visibility.
- **Recycle Bin** — 15-day soft-delete holding area; `queryAll` sees it.
- **Bulk API 2.0** — async job API for large volumes; **Composite API** — several subrequests in one call.
- **Scratch org** — disposable org defined in source, for CI.

---

## 10. Flashcards (cover the right column)

| # | Prompt | Answer |
| --- | --- | --- |
| 1 | What does this app authenticate with? | OAuth 2.0 Client Credentials via a Salesforce External Client App. |
| 2 | Which host do you send the token request to? | The org's **My Domain** host (`*.my.salesforce.com`), not `login.salesforce.com`. |
| 3 | Where does the API live after auth? | `instance_url` returned in the token response. |
| 4 | What's the token lifetime? | The Run As user's session timeout (~2 h default); the app refreshes at 90 min. |
| 5 | Why no refresh token? | Client credentials issues none — there is no user to re-consent; you mint a new token. |
| 6 | What does the browser hold? | Nothing secret: no client id, no secret, no token. Only `/api` JSON. |
| 7 | Which scope does the app request? | `api`. |
| 8 | What is the Run As user? | The Salesforce identity the token acts as; its profile/FLS/sharing apply. |
| 9 | What happens on `INVALID_SESSION_ID`? | Drop the cached connection and retry the operation exactly once. |
| 10 | Why cache the promise, not the connection? | Single-flight: concurrent cold requests share one token mint. |
| 11 | What HTTP method updates an Account? | `PATCH /services/data/v62.0/sobjects/Account/{id}`. |
| 12 | What status does create return, and why `Location`? | `201` + `Location: /api/accounts/{id}` — REST idiom for the new resource. |
| 13 | Is DELETE permanent? | No — Recycle Bin for 15 days; `queryAll` returns it with `IsDeleted: true`. |
| 14 | Why 422 vs 400? | 400 = your Zod contract failed; 422 = Salesforce metadata/validation rules rejected valid JSON. |
| 15 | Why 502 for bad credentials? | The caller isn't at fault; the upstream dependency failed. |
| 16 | What is the DE API quota you observed? | **15,000** requests per 24 h (`DailyApiRequests`). |
| 17 | What are the DE storage limits you observed? | 5 MB data, 20 MB file. |
| 18 | What does `assertSaved` guard against? | jsforce resolving a `SaveResult` with `success: false` instead of throwing. |
| 19 | Why read-after-write on PATCH only? | PATCH is partial and automation may change fields; POST already has the full record. |
| 20 | Why is search client-side? | Only 20 records loaded; a query per keystroke would waste API budget. |
| 21 | How are credentials kept out of the bundle? | No `VITE_` prefix, server-only env, and the secret never crosses `/api`. |
| 22 | Why does the API send `Cache-Control: no-store`? | Live org data and limits must never be cached by browser/proxy. |
| 23 | What makes the tests credential-free? | Routes depend on `AccountService`; Supertest injects fakes. |
| 24 | What's the biggest security gap? | The app's own API is unauthenticated; it assumes a trusted network. |
| 25 | What would you change for per-user audit? | Authorization Code + PKCE (or JWT bearer) and a per-user token mapping. |

---

## 11. What to learn next (in this order)

1. **Platform basics, properly.** Trailhead: *Salesforce Platform Basics*, *Data Modeling*, *API Basics*. Then open
   Setup → Object Manager → Account and read every standard field's type and help text.
2. **SOQL fluency.** Query Editor in the Developer Console, or Workbench/`sf data query`. Write filters, date literals,
   relationship subqueries, and aggregates until they're automatic.
3. **OAuth flows.** Read the Salesforce docs page for each of: Web Server, JWT Bearer, Client Credentials. Then implement
   JWT bearer as a second adapter in this repo (`SF_AUTH=jwt`) — it's the flow most enterprise integrations actually use.
4. **Bulk and Composite.** Add a CSV import path using Bulk API 2.0 and a "create account + contact" path using the
   Composite API. Both are common interview topics you'll then have *done*.
5. **Events instead of polling.** Read about Change Data Capture and Platform Events; sketch how the list could update
   without a refresh.
6. **Ops maturity.** Add pino logging with request ids, a metrics endpoint, retry/backoff with jitter, and a nightly
   scratch-org smoke test. That's the difference between "portfolio project" and "service I'd run".
7. **Certification (optional but useful signal).** *Salesforce Certified Platform Developer I* covers the platform
   fundamentals; the *Integration Architect* track is where this project's subject matter lives.

**The one habit that matters:** for every feature you add, write down the alternative you rejected and why. That's the
content of every good interview answer, and it's the part tutorials never teach.
