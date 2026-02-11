# Pull Request Checklist

Please complete this checklist. PRs may be blocked if items are unchecked or missing.

## Verification Artifacts
- [ ] Verification script used (select): core/vi/scripts/verify-m1.ps1 or verify-m2.ps1
- [ ] Log file(s) attached or linked in PR description (from docs/verification/)
- [ ] Include command(s) run and environment variables, if any

## Facts and Citations
- [ ] All claims cite source files with path + line links
- [ ] No aspirational language (only verified statements)
- [ ] Repro steps are uninterrupted from clean to pass

## Port Preflight
- [ ] Port preflight is present in verification scripts (fail-fast if in use)
- [ ] If `-KillPort` was used, note the PIDs and justification

## Docs Hygiene
- [ ] Quickstart references point to core/vi/docs/00-overview/QUICKSTART.md
- [ ] MILESTONE completion reports reference the actual verification log
- [ ] Governance rules respected: ops/tentai-docs/playbooks/copilot-rules.md (Section 13)

## Scope-Specific (if applicable)
- [ ] DB changes include Docker Compose and migration steps
- [ ] Validation schemas include input/output enforcement
- [ ] Integration tests cover new endpoints

## Summary
- [ ] Brief summary of changes and impact
- [ ] Any follow-ups or TODOs explicitly listed
