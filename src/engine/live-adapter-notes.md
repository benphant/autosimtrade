# Live Adapter Notes

The first implementation keeps live execution behind an adapter boundary.

Existing scripts to modularize:

- `../scripts/simtrade_multi_full_closure_rounds.js`
- `../scripts/simtrade_complete_lc_export.js`
- `../scripts/simtrade_complete_import_side.js`
- `../scripts/append_full_closure_reports.py`

Required adapter API:

```js
await adapter.login(account, role)
await adapter.checkRatings(accounts)
await adapter.executeStep(round, stepName)
await adapter.verifyStep(round, stepName)
await adapter.appendReports(runSummary)
```

The adapter must not proceed only because a button was clicked. Every step needs a page-text or list-state verification.
