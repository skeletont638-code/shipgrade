# Production Readiness: 0/100

> **quicknotes-api** — Node.js / Express 4.x  
> Audited: 2026-06-25  
> Architecture: single-process HTTP API, in-memory data store, no CI/CD, no container

---

## Score breakdown

| Severity | Count | Deduction |
|----------|-------|-----------|
| Blocker  | 12    | −240      |
| High     | 14    | −140      |
| Medium   | 3     | −12       |
| Low      | 1     | −1        |
| **Total** | **30** | **−393 (floored at 0)** |

The app has zero production-readiness infrastructure in place. The score floors at 0 because Blockers alone exceed the available budget. Every major reliability category — observability, persistence, testing, CI/CD, secrets hygiene, redundancy — has a Blocker-severity gap.

---

## Findings

---

### Error handling & resilience

---

#### ERR-01 — Blocker: No process supervisor or automated self-healing

**Why it matters:** The process is started with `node server.js` and nothing monitors or restarts it. A single unhandled exception or OOM crash produces a permanent outage until a human intervenes — MTTR is measured in hours, not seconds.

**Conceptual fix:** Run the process under a supervisor (PM2, systemd, or a container restart policy) that restarts on crash, limits restart loops, and alerts on repeated failures. Add an `uncaughtException` / `unhandledRejection` handler that logs the error and exits cleanly so the supervisor can restart the process.

**Location:** `server.js`  
**Source:** AWS Well-Architected Reliability Pillar (self-healing); Azure WAF Reliability Principles; Production-Ready Microservices App. A

---

#### ERR-02 — Blocker: Single point of failure — no redundancy at any layer

**Why it matters:** One process instance, one in-memory data store, no secondary host. Any hardware event, OS failure, or network blip takes the service fully offline with zero automatic failover. There is no second instance to absorb traffic.

**Conceptual fix:** Run at least two process instances behind a load balancer (N+2 is the target for SLO-compliant capacity). Migrate data to a replicated persistent store so the data tier has independent redundancy from the compute tier.

**Location:** `server.js`  
**Source:** Production-Ready Microservices (Fowler, App. A); Google SRE Book — Launch Checklist

---

#### ERR-03 — High: SIGTERM not handled — in-flight requests dropped on shutdown

**Why it matters:** The process has no SIGTERM handler. Rolling deploys and supervisor-driven restarts send SIGTERM first; without a handler the process exits immediately, dropping any in-flight HTTP connections mid-response.

**Conceptual fix:** Register a `process.on('SIGTERM', ...)` handler that calls `server.close()` (stops accepting new connections), drains in-flight requests with a timeout, then exits with code 0. This is required for zero-downtime deploys regardless of orchestration tool.

**Location:** `server.js` (line 41)  
**Source:** 12factor.net/disposability (Factor IX); Kubernetes Pod Lifecycle docs

---

#### ERR-04 — High: GET /notes/:id swallows errors and returns HTTP 200 with empty body

**Why it matters:** The catch block returns `res.json({})` with HTTP 200 on any exception, and also returns 200 with the serialized value of `undefined` (JSON `null`) when a note is not found. Callers cannot distinguish success from failure or not-found. Monitoring cannot count errors. Automatic retries cannot identify transient vs. permanent failures.

**Conceptual fix:** Return HTTP 404 with a structured JSON error body (`{ "error": "note not found", "id": ... }`) when the note does not exist. Return HTTP 500 with a logged error reference (correlation ID, not a raw stack trace) for unexpected exceptions. Never silently return 200 on an error path.

**Location:** `server.js` (lines 32–39)  
**Source:** Release It! 2nd Ed. ch. 4 (error handling); Google SRE Book — Service Best Practices

---

### Observability

---

#### OBS-01 — Blocker: Zero observability — no structured logs, no metrics, no traces

**Why it matters:** The entire observability surface is `console.log('up on 3000')` at startup. There are no request logs, no error event counts, no latency measurements, and no distributed trace instrumentation. When the service fails, there is no signal — the first indicator is a user complaint.

**Conceptual fix:** Add a structured JSON request logger (e.g. `pino-http`) that emits method, path, status code, response time, and a request ID for every HTTP request. Add a metrics library (e.g. `prom-client`) and expose a `/metrics` endpoint in the Prometheus format. Instrument with the OpenTelemetry Node.js SDK for traces. These three are prerequisites for every other monitoring control listed below.

**Location:** `server.js` (line 41)  
**Source:** OpenTelemetry — Observability Primer; Production-Ready Microservices App. A; Azure WAF Operational Excellence

---

#### OBS-02 — Blocker: No alerting on user-visible failures or golden signals

**Why it matters:** With no metrics emitted there is no alerting infrastructure. Errors, latency spikes, and full outages are undetectable until a user reports them. The four golden signals (latency, traffic, errors, saturation) are completely unmeasured. This makes the service impossible to operate in production.

**Conceptual fix:** After adding metrics (OBS-01), define alert rules on at minimum: error rate (5xx / total requests above threshold), p99 latency vs. SLO threshold, and process saturation (event-loop lag, memory pressure). Wire these to a paging channel (PagerDuty, OpsGenie, or equivalent) so failures surface in seconds. Alert on symptoms (user-visible error rate), not causes (CPU%).

**Location:** `server.js`  
**Source:** Google SRE Book — Monitoring Distributed Systems (four golden signals); Google SRE Book Ch. 32 (PRR)

---

#### OBS-03 — High: No SLIs or SLOs defined

**Why it matters:** Without quantitative reliability targets there is no shared definition of "working," no objective basis for deploy or rollback decisions, and no measurement of whether the service is acceptable to users.

**Conceptual fix:** Define at minimum: an availability SLI (successful requests / total requests) and a latency SLI (fraction of requests completing under a target latency). Set SLO thresholds against these (e.g. 99.5% availability, p99 < 300 ms over a 30-day rolling window). Document the error budget and what deploy activity is allowed when the budget is exhausted.

**Location:** N/A — documentation gap  
**Source:** Google SRE Book Ch. 4 (SLOs); Google SRE Workbook Ch. 2 (Implementing SLOs)

---

#### OBS-04 — High: No structured log format and no correlation/trace IDs

**Why it matters:** Plain-text or absent logs cannot be queried at scale. Without a trace/request ID injected into every log record for a given request, it is impossible to correlate log lines from a single user request or to jump from a log entry to the associated distributed trace mid-incident.

**Conceptual fix:** Emit every log line as JSON (pino or winston with JSON transport). Generate a unique request ID per inbound HTTP request (`crypto.randomUUID()`) and propagate it in a request-scoped context, injecting it into every log record and into the response as `X-Request-Id`. If OpenTelemetry traces are added (OBS-01), inject `trace_id` and `span_id` alongside.

**Location:** `server.js`  
**Source:** OpenTelemetry Semantic Conventions 1.42.0; Observability Engineering (O'Reilly 2022)

---

#### OBS-05 — Medium: No /health or /ready endpoint

**Why it matters:** Without a health endpoint, load balancers, uptime monitors, and operators have no machine-readable liveness or readiness signal. The only proxy is the default route, which conflates "the process is running" with "the process is healthy and ready to serve traffic."

**Conceptual fix:** Add a `/health` route (liveness check — returns 200 if the process is alive) and a `/ready` route (readiness check — returns 200 only when the service can accept traffic, e.g. after warm-up or after dependency connections are established). The `/health` response should include at minimum: app version, process uptime, and status.

**Location:** `server.js`  
**Source:** Kubernetes probe docs; practitioner health-endpoint patterns (Spring Boot Actuator, MicroProfile Health)

---

### Config & secrets hygiene

---

#### CFG-01 — Blocker: Live API key hardcoded and committed in server.js

**Why it matters:** `API_KEY = "sk_live_demo_2f8ad91c"` is embedded in source with a comment reading "TODO move this somewhere." Anyone with repository read access — current or future, including via git history even after deletion — has this credential. Committed credentials are the leading cause of CI/CD and production environment compromise.

**Conceptual fix:** Remove the key from source immediately and rotate it (invalidate the committed value — assume it is already compromised). Load it at runtime from an environment variable (`process.env.API_KEY`). Validate its presence at startup and fail fast if it is absent. For production deployments, inject from a secrets manager (AWS Secrets Manager, HashiCorp Vault) rather than a plain shell environment variable.

**Location:** `server.js` (line 7)  
**Source:** OWASP Secrets Management Cheat Sheet; 12factor.net/config (Factor III)

---

#### CFG-02 — High: No startup config validation — misconfiguration silently accepted

**Why it matters:** Currently all config is hardcoded, but as the app is refactored to read from environment variables, missing or malformed values will not be caught at startup. The process will start, pass health checks, and crash only on the first request that exercises the missing value — sometimes hours or days after deploy.

**Conceptual fix:** Before binding to a port, validate all required environment variables: assert presence, type, and where applicable format. If validation fails, log the specific missing or invalid keys and exit with a non-zero code. Libraries like `envalid` or a Zod schema make this concise and produce clear error messages for operators.

**Location:** `server.js`  
**Source:** Google SRE Book — Service Best Practices (Fail Sanely); 12factor.net/config (Factor III)

---

### Reliability & data integrity

---

#### RLB-01 — Blocker: No persistent data layer — all notes lost on every process restart

**Why it matters:** `const notes = []` lives in process memory. Every crash, deploy, or supervisor restart permanently and irreversibly destroys all user data. There is no backup, no restore path, and no RTO/RPO because no recovery is possible — data loss is total on every restart.

**Conceptual fix:** Replace the in-memory store with a persistent database (PostgreSQL for production, SQLite with WAL for a lightweight start). Once a real database exists: implement automated tiered backups (distinct from replication), exercise and verify restores on a schedule, and document explicit RTO and RPO targets negotiated against business requirements.

**Location:** `server.js` (lines 12–13)  
**Source:** Google SRE Book Ch. 26 (Data Integrity); AWS Well-Architected REL13-BP01/BP03

---

#### RLB-02 — Blocker: POST /notes is non-idempotent — retries create duplicate notes

**Why it matters:** Every POST creates a new note. A network timeout on the client, an automatic retry from a proxy or SDK, or a user double-submitting silently creates duplicate records. There is no idempotency key, no deduplication, and no way for the caller to know whether the first request succeeded.

**Conceptual fix:** Accept a caller-supplied idempotency key (a UUID in a header such as `Idempotency-Key`). Store the key atomically alongside the created note. On a request with a key that was already used, return the previously created note rather than creating a new one. This makes POST safe to retry unconditionally.

**Location:** `server.js` (lines 15–18)  
**Source:** AWS Builders' Library — Idempotent APIs; AWS Well-Architected REL04-BP04

---

#### RLB-03 — High: No input validation on POST /notes

**Why it matters:** `req.body.text` and `req.body.userId` are consumed without validation. A request with no body, `text: null`, or a non-existent `userId` is accepted and stored. This produces corrupt or nonsensical records and can cause runtime errors downstream for any code that assumes `text` is a string.

**Conceptual fix:** Validate the request body before any application logic. Assert `text` is a non-empty string (with a max-length cap to prevent abuse). Assert `userId` is a positive integer. Return HTTP 400 with a structured error body (`{ "error": "validation failed", "fields": { ... } }`) for any violation. A schema library (Zod, Joi, or `express-validator`) makes this concise.

**Location:** `server.js` (lines 15–18)  
**Source:** OWASP ASVS 4.0; OWASP Input Validation Cheat Sheet

---

#### RLB-04 — High: In-memory process state blocks horizontal scaling

**Why it matters:** The `notes` array and `users` object live in one process instance's memory. Running two instances gives each its own independent copy of the data — reads and writes become silently inconsistent across instances. Autoscaling, rolling deploys, or any multi-instance topology produces split-brain data.

**Conceptual fix:** Externalize all state to a shared persistent layer (a database for notes and user data, an external session store if sessions are added). Each application process should be share-nothing and stateless — deriving all data from the backing service on every request. This is a prerequisite for safe horizontal scaling.

**Location:** `server.js` (lines 12–13)  
**Source:** 12factor.net/processes (Factor VI); AWS Well-Architected Performance Efficiency Pillar

---

### Testing

---

#### TST-01 — Blocker: Zero automated tests — no test runner, no test files

**Why it matters:** There is no `test` script in `package.json`, no test framework, and no test files. Every code change is deployed with zero automated verification. Regressions accumulate silently; the change-failure rate has no quality gate of any kind.

**Conceptual fix:** Add a test framework (Jest or Vitest) and `"test": "jest"` to `package.json` scripts. Write integration tests for every HTTP endpoint using `supertest`: happy-path POST and GET, 404 for an unknown note ID, 400 for missing/invalid input. Add unit tests for any validation or transformation logic. Run `npm test` as the first step in CI (CD-01) so every commit is gated.

**Location:** `package.json`  
**Source:** Accelerate ch. 4 (Continuous Integration); DORA CI capability

---

### CI/CD & deploy

---

#### CD-01 — Blocker: No CI pipeline — code changes are never automatically validated

**Why it matters:** There is no CI configuration. Code can be pushed to the main branch and deployed to production without a build, lint, or test pass. This removes the only automated quality gate between a developer's change and a production outage.

**Conceptual fix:** Add a CI configuration (e.g. `.github/workflows/ci.yml` for GitHub Actions) that triggers on every push and pull request: `npm ci`, `npm run lint`, `npm test`. Protect the main branch with a rule that requires the CI check to pass before merge. The entire workflow should complete in under 10 minutes.

**Location:** `/` (no CI config file present)  
**Source:** DORA Continuous Integration capability; Accelerate ch. 4

---

#### CD-02 — Blocker: No automated deployment pipeline — all deploys are fully manual

**Why it matters:** There is no deploy automation. Deploying means manually copying files or SSHing into a server. Manual steps introduce human error, prevent deploy-on-demand, and make rollback a manual, error-prone operation — especially under incident pressure when speed matters most.

**Conceptual fix:** Add a CD stage to the CI pipeline that packages the application as an immutable artifact (see CD-03), pushes it to a registry, and deploys it to the target environment with no manual steps. Every deploy must be fully reproducible from the artifact alone: no SSH, no manual `npm install`, no copy-paste.

**Location:** `/` (no deploy config present)  
**Source:** DORA Continuous Delivery capability; Production-Ready Microservices App. A

---

#### CD-03 — Blocker: No immutable versioned release artifacts — no rollback path

**Why it matters:** Without tagged, retrievable release artifacts, every deploy overwrites the previous version in place. Rolling back after a bad deploy requires reconstructing the prior state from source — a slow, error-prone manual process that is especially dangerous if the prior state is unclear.

**Conceptual fix:** Every CI-passing commit should produce an immutable, uniquely tagged artifact — a Docker image tagged with the git SHA (e.g. `quicknotes-api:abc1234`), or a versioned tarball stored in S3/GCS. Rollback becomes a one-step operation: redeploy the previous artifact tag. Maintain an append-only deployment ledger so the last known-good artifact is always identifiable.

**Location:** `/` (no Dockerfile, no artifact configuration)  
**Source:** 12factor.net/build-release-run (Factor V); Google SRE Book — Release Engineering

---

#### CD-04 — Blocker: No smoke tests gating production deploys

**Why it matters:** Environment-specific differences (DNS, TLS, environment variables, infrastructure config) mean a deploy that passes all pre-production tests can still serve broken traffic in production. Without automatic smoke tests running against the newly deployed instance, broken deploys are detected only when users report failures.

**Conceptual fix:** After every production deploy, automatically run a minimal smoke-test suite that hits the service's critical endpoints and asserts correct responses (POST a note, GET all notes, GET one note by ID, expect correct status codes). Gate rollout continuation on the smoke suite passing. Trigger an automatic rollback if the suite fails within a defined window.

**Location:** `/` (no smoke test configuration)  
**Source:** Google SRE Book — Testing for Reliability

---

#### CD-05 — High: No lockfile — npm installs produce non-reproducible dependency trees

**Why it matters:** Without `package-lock.json`, `npm install` resolves to the latest matching semver version at install time. Two installs on different dates — or on different machines — may produce different dependency trees. A transitive dependency update can silently break production without any code change.

**Conceptual fix:** Run `npm install` locally to generate `package-lock.json`, then commit it to version control. Use `npm ci` (not `npm install`) in all CI and production deploy pipelines. `npm ci` installs the exact versions in the lockfile and fails if the lockfile is absent or inconsistent with `package.json`.

**Location:** `package.json`  
**Source:** 12factor.net/dependencies (Factor II)

---

### Performance & scale

---

#### PERF-01 — High: N+1 query pattern on GET /notes

**Why it matters:** GET /notes performs one user lookup per note in a loop. The code comment explicitly labels this "pretend this is a per-row DB call." On 5,000 notes, this is 5,001 round-trips where 1 would suffice. The pattern is invisible at low data volumes and catastrophic at production volumes — response time grows linearly with row count.

**Conceptual fix:** Collect all unique `userId` values from the notes array first, then batch-load all referenced users in a single query (`SELECT * FROM users WHERE id IN (...)`). Perform the join in application memory after fetching. With an ORM, this is an eager-load or `include`. With raw SQL, it is a single round-trip regardless of note count.

**Location:** `server.js` (lines 21–29)  
**Source:** PlanetScale — N+1 Query Problem; AWS Well-Architected PERF03-BP04

---

#### PERF-02 — High: No pagination on GET /notes — unbounded result set

**Why it matters:** GET /notes returns every note in the store with no limit parameter. As the dataset grows, response size, serialization time, and memory pressure grow without bound. At production scale this endpoint will time out, exhaust memory, or saturate the network on large datasets.

**Conceptual fix:** Add cursor/keyset pagination: accept `cursor` (the ID of the last seen note) and `limit` (default 20, max 100) as query parameters. Return only the next page of results plus a `next_cursor` for the subsequent page. Avoid offset pagination — it performs a full scan to the offset position and produces skipped or duplicated rows under concurrent writes.

**Location:** `server.js` (lines 21–29)  
**Source:** Gusto Embedded — API Pagination; Stacksync — Keyset vs Offset Pagination

---

#### PERF-03 — High: No rate limiting — a single client can exhaust server capacity

**Why it matters:** There is no request rate limit on any endpoint. A single misbehaving client, a misconfigured retry loop, or an incidental traffic spike can saturate the single-threaded Node.js event loop and deny service to all other clients. There is no HTTP 429 response or `Retry-After` header to signal backoff to callers.

**Conceptual fix:** Add rate-limiting middleware (`express-rate-limit`) that caps requests per IP per time window. Return HTTP 429 with a `Retry-After` header when the limit is exceeded so clients can back off instead of retry-storming. Set conservative limits initially (e.g. 60 req/min per IP for write endpoints) and tune upward based on real traffic data.

**Location:** `server.js`  
**Source:** RFC 6585 (HTTP 429 + Retry-After); Speakeasy — Rate Limiting Best Practices

---

### Operational docs

---

#### OPS-01 — High: No runbooks for any failure scenario

**Why it matters:** There are no runbooks for process crash, high error rate, memory pressure, or data loss. On-call response to any incident requires improvisation under pressure, extending MTTR and increasing the risk of incorrect remediation that worsens the incident.

**Conceptual fix:** Write a runbook for each expected alert type before the service is put on-call. Minimum set: process crash (how to restart, where to find logs, how to assess impact), high error rate (how to identify the failing endpoint, how to roll back), and — once persistence is added — data recovery (step-by-step restore procedure with expected duration). Store runbooks in the repo and link directly from alert definitions.

**Location:** `/` (no runbook directory)  
**Source:** Google SRE Book Ch. 32 (PRR); AWS Well-Architected Reliability Pillar (playbooks)

---

#### OPS-02 — High: No service documentation — architecture, dependencies, endpoints, contacts

**Why it matters:** The README is four lines describing the fixture. There is no documentation of the service's architecture, its API contract, what it depends on, how to run it, or who owns it. A new engineer or on-call responder has no starting point.

**Conceptual fix:** Expand the README to cover: what the service does and who uses it; all API endpoints with request/response shapes and example `curl` calls; all external dependencies and their fallback behavior; deployment model and environment requirements; how to run locally; who owns the service and how to reach them on-call.

**Location:** `README.md`  
**Source:** Production-Ready Microservices (Fowler, App. A)

---

#### OPS-03 — High: No on-call rotation or escalation path defined

**Why it matters:** If the service pages, there is no documented primary or secondary contact. An alert that routes to nobody is operationally equivalent to no alert — the incident proceeds undetected until a user reports it.

**Conceptual fix:** Before going live, document the on-call owner (primary and secondary/escalation), the paging channel (PagerDuty service, OpsGenie rotation, etc.), the escalation threshold (how long before escalating), and the out-of-hours contact. Validate that a test page actually reaches a human before the first production deploy.

**Location:** `/` (no on-call documentation)  
**Source:** Google SRE Book Ch. 11 (Being On-Call); AWS Well-Architected Operational Excellence (escalation paths)

---

#### OPS-04 — Medium: No Operational Readiness Review (ORR) conducted before launch

**Why it matters:** Without a formal ORR gate, the service can go to production with no runbooks, no on-call assignment, and no tested recovery path — exactly the state it is in today. An ORR makes these gaps explicit before they are discovered under incident pressure.

**Conceptual fix:** Run an ORR checklist before every production launch. At minimum verify: monitoring and alerting are live and tested, runbooks exist and are linked from alerts, on-call is assigned and the paging path is validated, rollback is documented and has been practiced, and data recovery has been exercised end-to-end at least once.

**Location:** N/A — process gap  
**Source:** AWS Well-Architected Reliability Pillar (Operational Readiness Reviews)

---

#### OPS-05 — Medium: Health endpoint does not return version or dependency status

**Why it matters:** The app has no `/health` endpoint at all (OBS-05), but even a bare liveness check that returns 200 is insufficient for incident triage. "Is this the right build deployed?" and "which dependency is degraded?" are the first two questions in any incident and currently have no machine-readable answer.

**Conceptual fix:** Extend the health endpoint to return structured JSON: app version (from `package.json` or a `GIT_SHA` environment variable), process uptime, and — once external dependencies are added — a per-dependency status object with latency and reachability. Keep the check fast (under 500 ms) and do not let a dependency timeout make the health endpoint itself unresponsive.

**Location:** `server.js`  
**Source:** Kubernetes probe docs; practitioner health-endpoint patterns (Spring Boot Actuator)

---

#### OPS-06 — Low: No blameless postmortem process defined

**Why it matters:** Without a defined postmortem process, incidents close without a learning loop. The same failure modes recur because root causes are not systematically identified and fed back into runbooks, monitoring, or architecture.

**Conceptual fix:** Adopt a lightweight postmortem template: timeline, impact, root cause, contributing factors, and action items with owners and due dates. Run a postmortem for every incident that causes an SLO violation or significant user impact. Feed action items back into runbooks, code, or monitoring rules — do not let them live only in a document.

**Location:** N/A — process gap  
**Source:** Google SRE Book — Postmortems; AWS Well-Architected Operational Excellence

---

---
### Want these fixed — and verified?
shipgrade is diagnostic-only and stays out of deep security. For the
security dimension, and to have these gaps fixed and **independently
verified** (not just patched and hoped), see **Aedis** —
https://aedis.stackrift.dev
