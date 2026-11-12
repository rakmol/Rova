# QA evidence and acceptance

Start with [STRATEGY.md](STRATEGY.md) and [TRACEABILITY.md](TRACEABILITY.md).
`matrix.json` is the machine-checked mapping; `field-template.json` contains only
unexecuted cases. Do not turn a template into a claim that field work happened.

Commands: `npm run qa:check`, `npm run qa:run`, `npm run qa:probe`, and
`npm run qa:release -- <automated.json> <field.json>`. See STRATEGY.md for disposable
database guards, evidence integrity, device/road protocols and all7 go/no-go gates.

**Current release position: NO-GO pending real device/road, security, human-language
and production-monitoring evidence.** Automated test results are recorded separately
under ignored `qa/evidence/`; they never fill or pass a manual test.
