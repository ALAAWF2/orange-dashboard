# CLAUDE.md — Orange Dashboard Frontend Guide

> Last refreshed: 2026-08-07. The workspace-level `../AGENTS.md` is canonical. This file contains only dashboard-specific guidance.

## Application shape

- Production is a plain multi-page Arabic RTL application built with HTML, CSS and classic JavaScript.
- There is no production bundler, JSX, TypeScript or template engine.
- Orange brand color is `#fe7900`.
- Shared assets include `assets/fmt.js`, `assets/nav.js` and `assets/orange-ui.css`; many pages also keep page-local styles/scripts.
- The authoritative backend is `../dashboard_server/server.py`. `server_admin.py` no longer exists and must not be referenced.

## Authentication

- Dashboard user/session source of truth is PostgreSQL through `../dashboard_server/dashboard_auth.py`.
- `users.js` fetches safe profiles from `/api/auth/users` and provides client helpers; never add PINs, passwords or Supabase credentials to it.
- Checklist Supabase sessions are obtained through the authenticated server flow.
- Do not assume a neighboring API route proves that a route is protected; inspect its exact guard.

## Source versus generated files

Do not hand-edit generated outputs such as:

- `management_data.json`, `summary.json`, `employees_data.json`, `offers_data.json`, `stock_data.json`;
- `stagnant_data.json`, `average_bill_incentives.json`, `data_version.json`;
- `data/products/*`, `ceo_data/*`, generated catalog JSON and `data/booff_data.json`.

Change the producer in the workspace root and regenerate only when the task authorizes it.

## Catalog

- Active generator: `catalog/generate_catalog.py`.
- Catalog operational state is in Supabase, including `profiles`, `orders`, `stock_transfers`, checklist, maintenance, weekly-closing and inventory tables.
- The inventory assistant is offline-capable; validate cache upgrades, queued sync, Arabic, touch and online/offline transitions.
- Checklist time windows and log acceptance use the server's Riyadh clock; do not restore direct client inserts that bypass policy.

## Frontend rules

- Preserve Arabic RTL, mobile/touch behavior and mixed Arabic/Latin alignment.
- Use `fetch()` and asynchronous APIs; no synchronous XHR or `document.write()`.
- Use `const`/`let`, not `var`.
- Avoid new CDN dependencies unless load time, caching and offline pages are considered.
- Test loading, empty, error and stale-cache states—not only the populated happy path.
- Commission and average-bill program visibility are server-controlled settings and must apply consistently to screens and exports.

## Repository and deployment

`allorangedashboard/` is its own Git repository and receives automated generated-data commits every 15 minutes. Before source edits:

1. Check repository status.
2. Separate source changes from generated churn.
3. Do not stage unrelated JSON/PDF/runtime changes.
4. Remember that source fixes in the dashboard may need matching server or generator updates in the parent workspace.

## Validation

- Classic JavaScript: `node --check <file.js>` when compatible.
- HTML/UI: verify desktop and mobile widths, Arabic RTL and auth/error states.
- PWA/catalog: also verify offline refresh, service-worker cache version and queued operations.
- Browser tests must be inspected before execution; some require a local server or external sessions.
