# shipgrade — Design Spec

**Date:** 2026-06-25
**Status:** Approved (brainstorming complete; ready for implementation planning)
**Type:** Claude Code skill, released as open source (OSS portfolio piece)

## One-liner

Point `shipgrade` at a repository; it produces a severity-ranked report of
everything missing for the app to survive production — and a headline
`Production Readiness: NN/100` score. It **diagnoses only and never edits the
audited code.**

## Purpose & positioning

The "vibe-coded app" problem: people ship apps that *look* finished but are
missing the unglamorous infrastructure that makes software survive real
traffic — error handling, logging, tests, CI, graceful failure. `shipgrade`
names every one of those gaps so the author knows exactly what stands between
their demo and a production-grade app.

**Relationship to Aedis (the author's paid find-AND-fix security product):**

- `shipgrade` is deliberately **ops/reliability-leaning** and explicitly does
  **not** do deep security analysis. It surfaces commodity infrastructure
  hygiene gaps, not security-detection IP.
- `shipgrade` is **report-only**. The clean structural boundary vs Aedis is:
  *this reads and reports; Aedis reads-and-fixes-and-verifies.* The skill has
  no write capability against the audited codebase.
- The report ends with a **soft CTA**: gaps in the *security* dimension, plus
  done-for-you verified fixes, → Aedis. The checklist manufactures awareness;
  Aedis sells the guarantee. The diagnosis was never the moat — the multi-model
  adversarial verification pipeline is, and that stays in Aedis.

## Audit taxonomy (8 categories — ops/reliability, no deep security)

1. **Error handling & resilience** — swallowed exceptions, no retries/backoff,
   no timeouts, unhandled promise rejections, no circuit breakers.
2. **Observability** — no structured logging, no error tracking (e.g. Sentry),
   no health/readiness check, no metrics.
3. **Config & secrets hygiene** — hardcoded config, no env-var validation, no
   `.env.example`. (Light touch — surface obvious hardcoded secrets, but this
   is NOT a secret-scanner; deep secret detection is Aedis's lane.)
4. **Reliability & data integrity** — no input validation, no idempotency on
   mutating endpoints, no transaction boundaries, no migration strategy.
5. **Testing** — no tests, critical paths uncovered, no CI test gate.
6. **CI/CD & deploy** — no pipeline, no lint/build gate, no rollback path,
   Dockerfile / container hygiene.
7. **Performance & scale** — N+1 queries, no pagination, no caching, blocking
   calls on hot paths, no rate limiting.
8. **Operational docs** — no run/setup/deploy instructions, no runbook.

## Workflow

1. **Detect stack** — read manifests (`package.json`, `requirements.txt`,
   `go.mod`, `pyproject.toml`, etc.) to determine language, framework, package
   manager.
2. **Inventory** the repo structure.
3. **Audit each category** using the skill's per-category heuristics. Each
   finding records:
   - **Severity**: Blocker / High / Medium / Low
   - **Why it matters** (production consequence)
   - **Conceptual what-to-fix** — what change is needed and why, NOT a
     copy-paste diff. (Doctor diagnoses; doesn't hand over the filled
     prescription.)
   - **Location**: file/path reference where relevant.
4. **Self-adversarial skeptic pass** — re-read every finding and try to refute
   it: is it a real production gap or a false positive for this stack? Drop the
   false positives. Single-model (the same Claude session) — no external
   models, no infra, no cost. This is the verification *technique* without the
   multi-model *moat*.
5. **Score** — weighted by severity into `Production Readiness: NN/100`
   (see Scoring).
6. **Emit** two artifacts (see Outputs).
7. **Soft Aedis CTA** appended to the report.

## Outputs

Written to the audited repo (the only files the skill writes):

- `PRODUCTION-READINESS.md` — human-readable, renders on GitHub. Headline score
  at top, then findings grouped by category, sorted by severity, each with
  why-it-matters + conceptual fix. Soft Aedis CTA at the bottom.
- `readiness-findings.json` — machine-readable findings (id, category,
  severity, title, why, fix_concept, location). Lets anyone build their own
  dashboard later.

No HTML dashboard in v1 (clean v2 once the skill has users — don't gold-plate
the giveaway before it's proven).

## Scoring rubric

Deterministic and credible (not vibes):

- Start at 100.
- Per-finding deduction by severity: Blocker −20, High −10, Medium −4,
  Low −1.
- Floor at 0.
- The rubric is documented in the README so the number is defensible.

(Exact weights to be finalized in the implementation plan; the principle is a
transparent, reproducible deduction model.)

## The hard boundary (baked into SKILL.md)

The skill body contains an explicit prohibition + red-flags list:

- **NEVER** use Edit/Write/file-mutation tools against the audited codebase.
- The ONLY files the skill creates are `PRODUCTION-READINESS.md` and
  `readiness-findings.json`.
- Remediation guidance stays at what/why level — no copy-paste fixes.
- Red flags that mean STOP: "I'll just fix this one thing", "a quick patch
  would help", "let me show the exact code".

## OSS release package

```
shipgrade/
  SKILL.md            # the skill itself (frontmatter: name, description)
  README.md           # what/why, install, usage, example screenshot, scoring rubric, Aedis note
  examples/           # a sample PRODUCTION-READINESS.md + JSON from a demo vibe-coded app
  LICENSE             # MIT
  docs/superpowers/specs/  # this design spec
```

- **Install:** clone into `~/.claude/skills/shipgrade/`.
- **README is the portfolio centerpiece** — the thing that looks good linked
  from LinkedIn. Include a screenshot of an example report with a low score.

## Out of scope (YAGNI for v1)

- HTML dashboard output.
- External / cross-model verification (that idea belongs in Aedis, not here).
- Deep security scanning (Aedis's lane).
- Auto-fixing anything.

## Separate, parked idea (not part of this skill)

Add a cross-model checker to **Aedis** (GLM-5.2 as a cheap third opinion via
OpenRouter; Cisco Foundation-sec-8B is a strong security-specific fit). Verify
"RedSage (ICLR 2026)" actually exists and is callable before relying on it.
Tracked separately from shipgrade.
