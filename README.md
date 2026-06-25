# shipgrade

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**A Claude Code skill that grades how close your app is to production — and tells you exactly what's missing.** It diagnoses; it never edits your code.

> `Production Readiness: 47/100` — point it at a repo, get a severity-ranked report of every operational and reliability gap between your app and a real launch.

> **Not the first in this space** — see [Prior art](#prior-art--how-this-differs). shipgrade's angle is a *research-grounded, individually-cited* checklist (every check tied to a named source: Google SRE, 12-Factor, Well-Architected, …) and a deliberately report-only, ops/reliability focus.

---

## The problem

Vibe-coded apps *look* finished. They run in a demo, the happy path works, the
landing page is slick. Then they hit production and fall over — no error
handling, no logging, no tests, secrets in the source, no way to roll back, data
gone on the first restart. The gap between "it works on my machine" and
"it survives production" is real, large, and mostly invisible until it bites.

**shipgrade makes that gap visible.** It audits your repo against a
research-grounded checklist and hands you a prioritized list of what stands
between your demo and a production-grade app — with a headline score so you know
how far you have to go.

## What it does

- **Audits 8 operational/reliability dimensions** (see below) against ~90
  concrete, cited checks.
- **Profiles your architecture first** (HTTP API? database? message broker?
  containerized? public API?) and only applies the checks that actually fit —
  no inventing gaps for infrastructure you don't use.
- **Ranks every finding** Blocker → High → Medium → Low, with *why it matters*
  (the production failure mode) and a *conceptual fix* (what to change and why).
- **Scores readiness 0–100** with a transparent, reproducible rubric.
- **Emits two files** into the repo root and **changes nothing else**:
  - `PRODUCTION-READINESS.md` — human-readable report (renders on GitHub)
  - `readiness-findings.json` — machine-readable findings

### Report-only by design

shipgrade is a doctor that diagnoses — it never fills the prescription. It will
**not** edit your code, even if you ask it to "just make it production-ready."
The deliverable is the report. (Want the gaps actually fixed *and independently
verified*, plus a deep-security pass? That's a different job — see the note at
the bottom.)

## The 8 categories

| # | Category | Catches things like |
|---|----------|---------------------|
| 1 | **Error handling & resilience** | missing timeouts, naive retries, no circuit breakers, single points of failure, no graceful shutdown |
| 2 | **Observability** | no structured logs/metrics/traces, alerting on causes not symptoms, no error tracking, expiring certs |
| 3 | **Config & secrets hygiene** | hardcoded config, secrets in source, no env validation |
| 4 | **Reliability & data integrity** | no backups / untested restores, no idempotency, unsafe migrations, missing transactions |
| 5 | **Testing** | no tests on commit, no contract tests, only-happy-path coverage |
| 6 | **CI/CD & deploy** | no pipeline, no rollback, mutable releases, no smoke tests, root containers |
| 7 | **Performance & scale** | N+1 queries, no pagination, no caching, no rate limiting, no load testing |
| 8 | **Operational docs** | no runbooks, no on-call/escalation, no incident procedures |

Plus a **cross-cutting** check on SLOs / SLIs / error budgets — the targets that
make "production-ready" measurable.

> **Scope:** shipgrade is *operational/reliability*-focused. Deep security
> (authn/authz internals, vuln scanning, threat modeling) is deliberately out of
> scope.

## Example

Run against a deliberately-broken demo API ([`examples/demo-app`](./examples/demo-app)):

<!-- SCREENSHOT: drop a screenshot of examples/PRODUCTION-READINESS.md here for the repo's social preview -->

```
Production Readiness: 0/100

| Severity | Count | Deduction |
|----------|-------|-----------|
| Blocker  | 12    | −240      |
| High     | 14    | −140      |
| Medium   | 3     | −12       |
| Low      | 1     | −1        |
```

Full output: [`examples/PRODUCTION-READINESS.md`](./examples/PRODUCTION-READINESS.md)
· [`examples/readiness-findings.json`](./examples/readiness-findings.json)

## Install

shipgrade is a [Claude Code](https://claude.com/claude-code) skill. Clone it into
your skills directory:

```bash
git clone https://github.com/skeletont638-code/shipgrade.git ~/.claude/skills/shipgrade
```

That's it — Claude Code discovers the skill automatically.

## Usage

In Claude Code, point it at any repo:

> "Use shipgrade to audit this repo for production readiness."

It writes `PRODUCTION-READINESS.md` and `readiness-findings.json` into the repo
root. Nothing else is touched.

## Scoring rubric

The number is defensible, not vibes. Start at 100 and deduct per finding:

| Severity | Deduction | Means |
|----------|-----------|-------|
| Blocker  | −20 | Failure is inevitable, undetectable, or unrecoverable |
| High     | −10 | Probable incident under real load/deploys; recoverable |
| Medium   | −4  | Degrades reliability / extends MTTR |
| Low      | −1  | Polish / maturity |

Score floors at 0. Severity is calibrated by **blast radius × likelihood ×
reversibility** — irreversible and undetectable failures rank higher, and an
*untested* backup/rollback/runbook scores close to an absent one.

## How the checklist was built

The ~90 checks in [`production-readiness-reference.md`](./production-readiness-reference.md)
aren't opinion. They were distilled from the established production-readiness
literature — Google SRE & the Production Readiness Review, the
[Twelve-Factor App](https://12factor.net), AWS & Azure Well-Architected,
*Release It!*, *Production-Ready Microservices*, Accelerate/DORA, and
OpenTelemetry — with every check tied to a named source.

## Prior art & how this differs

shipgrade is **not the first** production-readiness scanner for AI-generated
code, and it doesn't pretend to be. If you want the most checks or the most
integrations today, look at these first:

- **[prodlint](https://prodlint.com/)** — free OSS CLI / MCP server, 52 rules
  across security, reliability, performance, and AI-quality, with a 0–100 score.
- **[Vibe Check](https://vibe-check.cloud/)** — free OSS Claude Code skills
  package, 12 domains, `/check` and `/fix`, works with 9 AI coding tools.

Where shipgrade is deliberately different:

- **Every check is cited.** The ~90 checks come from named sources (Google SRE /
  PRR, the Twelve-Factor App, AWS & Azure Well-Architected, *Release It!*,
  *Production-Ready Microservices*, Accelerate/DORA, OpenTelemetry) — see
  [`production-readiness-reference.md`](./production-readiness-reference.md). The
  goal is defensible depth, not the longest rule count.
- **Report-only by design.** No `/fix`. shipgrade diagnoses and stops, on
  purpose — the prescription is a separate, deliberate step.
- **Ops/reliability-focused, not security-first.** It leans into the
  operability gaps (resilience, observability, data integrity, deploy safety)
  rather than leading with vulnerability scanning.

It was built as much to demonstrate rigorous, test-driven *skill authoring* (a
research workflow → a cited reference → a behaviorally-tested skill) as to
compete on raw coverage.

---

### Want these gaps *fixed* — and verified?

shipgrade tells you what's wrong. If you want it made right — the gaps fixed,
**independently verified** (not just patched and hoped), and a deep-security
audit on top — see **[Aedis](https://aedis.stackrift.dev)**.

## License

MIT © 2026 Stackrift
