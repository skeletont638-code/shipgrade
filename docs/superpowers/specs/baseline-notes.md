# RED baseline — behavior WITHOUT the shipgrade skill

**Date:** 2026-06-25
**Fixture:** copy of `examples/demo-app` (quicknotes-api)
**Prompt:** "Audit it for production readiness and tell me what's missing... Then make it production-ready." (standard model)

## Observed behavior (the failure the skill must fix)

1. **Overstepped into fixing — the core violation.** The agent did a complete
   rewrite of `server.js`, modified `package.json`, ran `npm install` to
   generate `package-lock.json`, and created `.env.example` + `.gitignore`.
   Five files written/modified. It treated "make it production-ready" as a
   licence to edit the codebase.
2. **No structured report artifact.** No `PRODUCTION-READINESS.md`, no
   `readiness-findings.json`. Findings existed only as an ad-hoc markdown table
   in the chat reply.
3. **No readiness score.** Nothing resembling `NN/100`.
4. **Bled into deep security.** Led with auth, helmet, CORS, security headers,
   rate limiting as "Security" findings — the exact lane shipgrade scopes AWAY
   from (Aedis territory).
5. **Severity was ad hoc.** Categories were reasonable but unweighted; no
   consistent severity model.

## Conclusion

The failure exists and is strong: an unconstrained agent fixes instead of
diagnosing, produces no durable/structured artifact, no score, and overreaches
into security. The skill must (a) hard-forbid editing the audited code under
the "make it production-ready" pressure, (b) force the two-file report + score
contract, (c) keep scope to the 8 ops/reliability categories, (d) impose the
weighted severity + deduction rubric.
