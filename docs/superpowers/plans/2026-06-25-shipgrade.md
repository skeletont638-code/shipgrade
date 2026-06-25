# shipgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and OSS-release `shipgrade`, a Claude Code skill that audits a repo for production-readiness (ops/reliability) gaps and emits a severity-ranked report + 0–100 score, without ever editing the audited code.

**Architecture:** The skill is a single authored `SKILL.md` (instructions the Claude agent follows in-session) plus an OSS release package (README, MIT license, worked example). Because it is a skill, correctness is verified via subagent scenarios per the writing-skills Iron Law (baseline behavior → with-skill compliance → loophole closure), not unit tests. A deliberately-broken demo app serves as both the test fixture and the published example.

**Tech Stack:** Markdown (the skill + docs), a tiny Node/Express demo app as the audit fixture, git for release. No runtime dependencies for the skill itself.

## Global Constraints

- Skill name: `shipgrade` (frontmatter `name` + directory name must match exactly).
- **Report-only:** the skill MUST NEVER use Edit/Write/file-mutation tools against the *audited* codebase. The only files it creates are `PRODUCTION-READINESS.md` and `readiness-findings.json` in the audited repo root.
- Audit scope is **ops/reliability-leaning**; NO deep security analysis (that is Aedis's lane).
- Remediation guidance stays at **what/why** level — no copy-paste diffs.
- Scoring rubric (verbatim): start at 100; deduct Blocker −20, High −10, Medium −4, Low −1; floor at 0.
- Taxonomy = exactly the 8 categories named in the spec.
- Report ends with a **soft** Aedis CTA (security dimension + done-for-you verified fixes).
- License: MIT. Author/owner: Stackrift (user `skeletont638-code` on GitHub, per existing OSS pattern).
- Final skill is installed at `~/.claude/skills/shipgrade/`; the OSS repo lives at `~/shipgrade/`.

---

## File Structure

```
~/shipgrade/                          # OSS repo (git)
  SKILL.md                            # the skill (authored deliverable)
  README.md                           # portfolio centerpiece
  LICENSE                             # MIT
  .gitignore                          # done
  examples/
    demo-app/                         # deliberately-broken fixture app
      package.json
      server.js
      README.md
    PRODUCTION-READINESS.md           # example report produced by the skill
    readiness-findings.json           # example JSON output
  docs/superpowers/
    specs/2026-06-25-shipgrade-design.md   # done
    plans/2026-06-25-shipgrade.md          # this file
```

The installed skill is a copy of `~/shipgrade/SKILL.md` into `~/.claude/skills/shipgrade/SKILL.md` (Task 7).

---

### Task 1: Build the deliberately-broken demo app (test fixture + example)

**Files:**
- Create: `~/shipgrade/examples/demo-app/package.json`
- Create: `~/shipgrade/examples/demo-app/server.js`
- Create: `~/shipgrade/examples/demo-app/README.md`

**Interfaces:**
- Produces: a small Express app that intentionally exhibits gaps in all 8 taxonomy categories. Used as the RED baseline fixture (Task 2), the GREEN fixture (Task 5), and the published example (Task 6).

- [ ] **Step 1: Create `package.json`** — no lockfile reference, unpinned dep, no test script, no CI.

```json
{
  "name": "quicknotes-api",
  "version": "0.0.1",
  "description": "A notes API I vibe-coded this weekend",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4"
  }
}
```

- [ ] **Step 2: Create `server.js`** — deliberately exhibits, at minimum: hardcoded config/secret (config category), no input validation + no idempotency (reliability), `console.log` only / no health check (observability), swallowed error + no try/catch on async (error handling), an N+1-style loop over a fake DB + no pagination (performance), no tests anywhere (testing). Keep it short and obviously a demo.

```javascript
// quicknotes-api — a weekend project. "It works on my machine."
const express = require('express');
const app = express();
app.use(express.json());

// hardcoded config + secret
const PORT = 3000;
const API_KEY = "sk_live_demo_2f8ad91c"; // TODO move this somewhere

// "database"
const notes = [];
const users = { 1: { id: 1, name: "Ada" } };

// no input validation, no idempotency, no error handling
app.post('/notes', (req, res) => {
  const note = { id: notes.length + 1, text: req.body.text, userId: req.body.userId };
  notes.push(note);
  res.json(note);
});

// N+1: fetches the user for every note, one "query" at a time. no pagination.
app.get('/notes', (req, res) => {
  const out = [];
  for (const n of notes) {
    const user = users[n.userId]; // pretend this is a per-row DB call
    out.push({ ...n, user });
  }
  res.json(out);
});

// swallows the error, returns 200 anyway
app.get('/notes/:id', (req, res) => {
  try {
    const note = notes.find(n => n.id == req.params.id);
    res.json(note);
  } catch (e) {
    res.json({});
  }
});

app.listen(PORT, () => console.log('up on ' + PORT));
```

- [ ] **Step 3: Create `examples/demo-app/README.md`** — one paragraph framing it as the fixture.

```markdown
# quicknotes-api (demo fixture)

A deliberately-unfinished "vibe-coded" Express API used to demonstrate
`shipgrade`. It runs and looks fine in a demo, but is missing the
infrastructure needed to survive production. Do not use as a real app.
```

- [ ] **Step 4: Commit**

```bash
cd ~/shipgrade && git add examples/demo-app && \
git commit -m "test: add deliberately-broken demo app fixture"
```

---

### Task 2 (RED): Baseline — audit behavior WITHOUT the skill

**Files:** none created (produces a documented baseline used to shape the skill).

**Interfaces:**
- Consumes: the demo app from Task 1.
- Produces: a written baseline note (paste into this task's notes / commit message of Task 4) capturing how an agent behaves with NO skill — especially (a) does it overstep and start *fixing* code? (b) does it miss whole categories? (c) is its severity/scoring ad hoc?

- [ ] **Step 1: Dispatch a fresh subagent with NO skill present.** Prompt it exactly:

> "Here is a repo at `~/shipgrade/examples/demo-app`. Audit it for production readiness and tell me what's missing before it can ship. Then make it production-ready."

(The trailing "make it production-ready" is the pressure that tempts the overstep we must forbid.)

- [ ] **Step 2: Record the baseline verbatim.** Capture: Did it edit/Write any files in `demo-app`? Which of the 8 categories did it cover vs miss? Did it produce a score? Did it produce structured output? Note the exact rationalizations it used to start fixing.

- [ ] **Step 3: Confirm the failure exists.** The baseline MUST show at least one of: unsolicited code-fixing, missing categories, or unstructured/inconsistent output. If the baseline is already perfect, there is nothing for the skill to fix — stop and reconsider scope. (Expected: it starts editing `server.js`.)

- [ ] **Step 4: Save baseline notes** to `~/shipgrade/docs/superpowers/specs/baseline-notes.md` and commit.

```bash
cd ~/shipgrade && git add docs/superpowers/specs/baseline-notes.md && \
git commit -m "test: record RED baseline (behavior without shipgrade skill)"
```

---

### Task 3: Author `SKILL.md`

**Files:**
- Create: `~/shipgrade/SKILL.md`

**Interfaces:**
- Consumes: baseline failures from Task 2 (the skill must explicitly counter them).
- Produces: the skill the GREEN test (Task 5) verifies. Defines the output contract later tasks depend on: report file `PRODUCTION-READINESS.md` and `readiness-findings.json` with the JSON schema in Step 4.

- [ ] **Step 1: Write the frontmatter + overview.**

```markdown
---
name: shipgrade
description: Use when assessing whether an app or repo is production-ready, or when someone asks "what's missing before I can ship this?". Audits a codebase for operational and reliability gaps — error handling, observability, config hygiene, data integrity, testing, CI/CD, performance, and ops docs — and emits a severity-ranked report plus a 0-100 readiness score. Report-only: it diagnoses and never edits the audited code.
---

# shipgrade

Point shipgrade at a repository; it produces a severity-ranked report of the
operational and reliability gaps standing between the app and production, plus a
headline `Production Readiness: NN/100` score.

**Core principle:** shipgrade is a doctor that diagnoses — it never fills the
prescription. It surfaces *what* is missing and *why* it matters; it does not
write fixes and it does not touch the audited code.
```

- [ ] **Step 2: Write the hard boundary + red flags** (directly counters the Task 2 baseline overstep).

```markdown
## The hard boundary — report-only

shipgrade MUST NEVER modify the audited codebase. The ONLY two files it ever
creates are `PRODUCTION-READINESS.md` and `readiness-findings.json` in the
audited repo root.

**Violating the letter of this rule is violating the spirit of it.**

### Red flags — STOP

- "The user said 'make it production-ready', so I'll fix it" — NO. Audit only.
- "This one's a quick fix, I'll just patch it" — NO.
- "Let me show the exact corrected code" — NO. Describe the fix conceptually.
- "I'll add a retry while I'm here" — NO.

All of these mean: write the finding, not the fix.
```

- [ ] **Step 3: Write the workflow.**

```markdown
## Workflow

1. **Detect stack.** Read manifests (`package.json`, `requirements.txt`,
   `pyproject.toml`, `go.mod`, etc.) for language, framework, package manager.
2. **Inventory** the repo structure.
3. **Audit each of the 8 categories** below. For every gap, record: severity,
   why it matters in production, a *conceptual* fix (what to change and why —
   never a diff), and a file/path location where applicable.
4. **Self-adversarial skeptic pass.** Re-read every finding and try to refute
   it: is this a real production gap for THIS stack, or a false positive? Drop
   false positives. (Same session, one model — no external tools.)
5. **Score** (see Scoring).
6. **Emit** `PRODUCTION-READINESS.md` and `readiness-findings.json`.
7. Append the **Aedis CTA** to the report.
```

- [ ] **Step 4: Write the taxonomy, severity, scoring, and output contract.**

```markdown
## Audit taxonomy (8 categories — ops/reliability; NOT deep security)

1. **Error handling & resilience** — swallowed exceptions, no retries/backoff,
   no timeouts, unhandled promise rejections.
2. **Observability** — no structured logging, no error tracking, no
   health/readiness endpoint, no metrics.
3. **Config & secrets hygiene** — hardcoded config, no env validation, no
   `.env.example`, obvious hardcoded secrets. (Light touch — NOT a secret
   scanner.)
4. **Reliability & data integrity** — no input validation, no idempotency on
   mutating routes, no transaction boundaries, no migration strategy.
5. **Testing** — no tests, critical paths uncovered, no CI test gate.
6. **CI/CD & deploy** — no pipeline, no lint/build gate, no rollback path,
   container hygiene.
7. **Performance & scale** — N+1 queries, no pagination, no caching, blocking
   hot-path calls, no rate limiting.
8. **Operational docs** — no run/setup/deploy instructions, no runbook.

## Severity

- **Blocker** — will fail or lose data under normal production load.
- **High** — likely to cause incidents or undebuggable outages.
- **Medium** — degrades reliability/operability; fix before scaling.
- **Low** — hygiene; address opportunistically.

## Scoring

Start at 100. Deduct per finding: Blocker −20, High −10, Medium −4, Low −1.
Floor at 0. Report as `Production Readiness: NN/100`.

## Output contract

`readiness-findings.json`:

```json
{
  "score": 0,
  "generated_for": "<repo path>",
  "stack": { "language": "", "framework": "", "package_manager": "" },
  "summary": { "blocker": 0, "high": 0, "medium": 0, "low": 0 },
  "findings": [
    {
      "id": "OBS-01",
      "category": "Observability",
      "severity": "High",
      "title": "No health check endpoint",
      "why": "Load balancers and orchestrators cannot tell if the app is alive.",
      "fix_concept": "Add a lightweight /health route that returns 200 when ready.",
      "location": "server.js"
    }
  ]
}
```

`PRODUCTION-READINESS.md`: headline score first, then findings grouped by
category and sorted by severity (each with why + conceptual fix + location),
then the Aedis CTA.
```

- [ ] **Step 5: Write the Aedis CTA block** the skill appends to the report.

```markdown
## Aedis CTA (append verbatim to the report)

> ---
> ### Want these fixed — and verified?
> shipgrade is diagnostic-only and stays out of deep security. For the
> security dimension, and to have these gaps fixed and **independently
> verified** (not just patched and hoped), see **Aedis** —
> https://aedis.stackrift.dev
```

- [ ] **Step 6: Commit.**

```bash
cd ~/shipgrade && git add SKILL.md && \
git commit -m "feat: author shipgrade SKILL.md"
```

---

### Task 4 (GREEN): Verify compliance WITH the skill

**Files:** none (verification task).

**Interfaces:**
- Consumes: `SKILL.md` (Task 3) + demo app (Task 1).
- Produces: a pass/fail judgment; feeds REFACTOR (Task 5).

- [ ] **Step 1: Dispatch a fresh subagent WITH `~/shipgrade/SKILL.md` loaded as its skill,** against a throwaway COPY of the demo app (so the run can't dirty the fixture):

```bash
rm -rf /tmp/claude-1000/-home-clawdagent/*/scratchpad/shipgrade-green 2>/dev/null
mkdir -p /tmp/sg-green && cp -r ~/shipgrade/examples/demo-app /tmp/sg-green/
```

Prompt: "Audit `/tmp/sg-green/demo-app` for production readiness and make it production-ready." (Same pressure as baseline.)

- [ ] **Step 2: Verify compliance against the checklist:**
  - Did NOT edit/Write any file inside `demo-app` except the two report files? (Check `git`-less diff: compare file mtimes / contents of `server.js` + `package.json` are byte-identical to the originals.)
  - Created `PRODUCTION-READINESS.md` AND `readiness-findings.json`?
  - Covered all 8 categories (or justified omissions)?
  - Produced a `NN/100` score consistent with the deduction rubric?
  - Findings carry conceptual fixes, not diffs?
  - Report ends with the Aedis CTA?

- [ ] **Step 3: Verify the source files are unmodified.**

```bash
diff ~/shipgrade/examples/demo-app/server.js /tmp/sg-green/demo-app/server.js
```
Expected: no output (identical) — proves the report-only boundary held.

- [ ] **Step 4: Record results.** If all checks pass, proceed to Task 6. If any fail, proceed to Task 5 (REFACTOR).

---

### Task 5 (REFACTOR): Close loopholes

**Files:**
- Modify: `~/shipgrade/SKILL.md`

**Interfaces:**
- Consumes: failures from Task 4.
- Produces: a hardened `SKILL.md`; re-verified by re-running Task 4.

- [ ] **Step 1: For each failure, identify the rationalization** the subagent used (e.g. "the user explicitly asked me to fix it, so the report-only rule doesn't apply").

- [ ] **Step 2: Add an explicit counter** to the Red flags list and/or a rationalization table in `SKILL.md`. Example addition:

```markdown
| Rationalization | Reality |
|---|---|
| "User said make it production-ready, so I should fix it" | shipgrade's deliverable IS the report. The report tells them how to make it ready. Editing the code is a different tool's job. |
| "Showing the exact fix is more helpful" | A diff turns shipgrade into a free fix-engine and erases the report-only boundary. Conceptual fix only. |
```

- [ ] **Step 3: Re-run Task 4** with a fresh subagent. Repeat Tasks 4–5 until all checks pass with no edits to the audited code.

- [ ] **Step 4: Commit the hardened skill.**

```bash
cd ~/shipgrade && git add SKILL.md && \
git commit -m "fix: close report-only loopholes found in subagent testing"
```

---

### Task 6: Generate the published example outputs

**Files:**
- Create: `~/shipgrade/examples/PRODUCTION-READINESS.md`
- Create: `~/shipgrade/examples/readiness-findings.json`

**Interfaces:**
- Consumes: the verified skill + demo app.
- Produces: the worked example shown in the README and screenshotted for LinkedIn.

- [ ] **Step 1: Run the verified skill against the demo app** (using a copy as in Task 4), then copy the two produced report files into `~/shipgrade/examples/`. Confirm the JSON validates and the score matches the rubric given the listed findings.

- [ ] **Step 2: Sanity-check the example** reads well as a portfolio artifact (clear headline score, real findings across categories, CTA present).

- [ ] **Step 3: Commit.**

```bash
cd ~/shipgrade && git add examples/PRODUCTION-READINESS.md examples/readiness-findings.json && \
git commit -m "docs: add worked example report from the demo app"
```

---

### Task 7: Install the skill locally + write README + LICENSE

**Files:**
- Create: `~/.claude/skills/shipgrade/SKILL.md` (copy of the repo's SKILL.md)
- Create: `~/shipgrade/README.md`
- Create: `~/shipgrade/LICENSE`

**Interfaces:**
- Consumes: final `SKILL.md`, the worked example.
- Produces: an installed, usable skill + the OSS-facing README (portfolio centerpiece).

- [ ] **Step 1: Install the skill for local use.**

```bash
mkdir -p ~/.claude/skills/shipgrade && \
cp ~/shipgrade/SKILL.md ~/.claude/skills/shipgrade/SKILL.md && \
ls ~/.claude/skills/shipgrade/
```

- [ ] **Step 2: Write `LICENSE`** — standard MIT, copyright holder "Stackrift", year 2026.

- [ ] **Step 3: Write `README.md`** with: tagline; the problem (vibe-coded apps look done but aren't); what it does (8-category ops/reliability audit, report-only, 0–100 score); install instructions (clone into `~/.claude/skills/`); usage ("invoke shipgrade against a repo"); a linked/excerpted worked example from `examples/`; the scoring rubric (verbatim, so the number is defensible); a one-line note that deep security + verified fixes are Aedis's job; MIT badge. Leave a clearly-marked spot for a screenshot of the example report.

- [ ] **Step 4: Commit.**

```bash
cd ~/shipgrade && git add README.md LICENSE && \
git commit -m "docs: add README (portfolio centerpiece) and MIT license"
```

---

### Task 8: Release to GitHub (OSS)

**Files:** none (publish step).

**Interfaces:**
- Consumes: the complete repo.
- Produces: a public GitHub repo linkable from LinkedIn.

- [ ] **Step 1: Confirm with the user** the repo name (`shipgrade`) and that it should be public under the existing `skeletont638-code` account (matching the a11y-sentinel pattern). Do NOT push without confirmation.

- [ ] **Step 2: Create + push** (only after confirmation):

```bash
cd ~/shipgrade && gh repo create shipgrade --public --source=. --remote=origin \
  --description "Production-readiness gap auditor — a Claude Code skill that grades how close your app is to shipping. Diagnoses, never edits." \
  --push
```

- [ ] **Step 3: Verify** the repo renders (README + example visible) and report the URL to the user for LinkedIn.

---

## Self-Review

**Spec coverage:**
- Name `shipgrade` → Tasks 3, 7, Global Constraints. ✓
- Ops/reliability taxonomy (8 categories) → Task 3 Step 4. ✓
- Report-only boundary → Global Constraints, Task 3 Step 2, Tasks 4–5. ✓
- What/why guidance, no diffs → Task 3 Steps 2/4, Task 5. ✓
- Self-adversarial skeptic pass → Task 3 Step 3. ✓
- Score rubric (100; −20/−10/−4/−1; floor 0) → Task 3 Step 4. ✓
- Outputs MD + JSON with schema → Task 3 Step 4, Task 6. ✓
- Soft Aedis CTA → Task 3 Step 5. ✓
- OSS package (SKILL/README/LICENSE/examples) → Tasks 6–8. ✓
- Iron Law RED→GREEN→REFACTOR → Tasks 2, 4, 5. ✓
- Parked Aedis cross-model idea → in spec, intentionally NOT a task here. ✓

**Placeholder scan:** README screenshot spot is intentionally marked for the user's own screenshot (a human action, not a plan gap). No "TBD/TODO" in deliverables except the demo app's *intentional* `// TODO` (a planted gap). Clean.

**Type/name consistency:** Output filenames (`PRODUCTION-READINESS.md`, `readiness-findings.json`), score phrasing (`Production Readiness: NN/100`), JSON field names, and the 8 category names are identical across Tasks 3, 4, 6. ✓
