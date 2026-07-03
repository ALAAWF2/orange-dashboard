# CLAUDE.md — Orange Dashboard

A comprehensive guide for AI assistants working in this codebase.
**CRITICAL INSTRUCTION FOR AI:** You MUST read this entire document before answering any user query or modifying code. Pay special attention to the Shift Logic and Data Pipeline sections.

---

## Project Overview

**Orange Dashboard** is a production sales analytics dashboard for a retail organization. It is a multi-page web application (MPA) — not a SPA — with an Arabic/RTL interface, a Python/Flask backend, and direct JSON data loading.

- **Language**: Arabic (RTL layout throughout)
- **Brand color**: Orange (`#fe7900`)
- **PWA**: Yes (`manifest.json`, start URL is `widget.html`)

---

## Architecture

```
Browser (Vanilla JS + Bootstrap 5 RTL in /allorangedashboard)
    |
    |-- Loads large JSON files directly (no API for reads)
    |-- Calls Flask API (admin_logic.js) for writes/targets
    |
Flask Backend & Python ETL (in parent directory /orangedata)
    |
    PostgreSQL (Dynamics 365 / GoFrugal ERP)
```

This is a **traditional multi-page application**:
- Each HTML file is an independent page with its own `<script>` includes.
- No bundler, no transpiler, no build step.
- All frontend dependencies come from CDN.
- Data is read by loading JSON files; writes go to the Flask API.

---

## Directory Layout

**Note:** The HTML/JS files are inside `allorangedashboard/`, while the Python ETL scripts that generate the data are in the parent directory (`../orangedata/`).

```
/orangedata/ (Parent Directory)
├── generate_management_data.py # CRITICAL ETL: Merges Legacy & Dynamics data into JSON
├── server_admin.py             # Flask backend (main API server)
├── import_dynamics_raw.py      # Extracts ERP Dynamics data
├── visitors/                   # Visitor Python scripts
│   ├── process_visitors_db.py  # SenseMax Excel to DB
│   ├── fetch_vcount_hourly.py  # VCount API to DB
│
└── allorangedashboard/         # (Frontend Folder - Where you are likely working)
    ├── index.html              # Main sales dashboard
    ├── login.html              # Authentication entry point
    ├── widget.html             # Mobile/quick view (PWA start URL)
    ├── employees.html          # Employee performance analytics
    ├── product_analysis.html   # Product sales analysis
    ├── offers_analysis.html    # Promotional offers tracking
    ├── admin_targets.html      # Admin target management UI
    ├── target_setting.html     # Manager target setting
    ├── data_audit.html         # Data validation/auditing
    ├── branch_details.html     # Branch information
    ├── chatbot.html            # Chat interface
    ├── rep.html                # Reports
    ├── cross-outlet-search.html # Cross-branch operations
    ├── maintenance.html        # Maintenance requests (Supabase backend)
    ├── stagnant_products.html  # Stagnant product analysis
    │
    ├── catalog/                # SEPARATE store-facing app (Supabase backend)
    │   │                       # supabase-js pinned to @2.110.0 on ALL pages — never
    │   │                       #   revert to floating @2. Auth listeners are hardened
    │   │                       #   (2026-07-02): SIGNED_IN re-emissions for the active
    │   │                       #   user are ignored; SIGNED_OUT re-checks getSession()
    │   │                       #   after 3s before wiping UI. Keep these guards.
    │   ├── index.html          # Product catalog: cart→orders, favorites, barcode print,
    │   │                       #   checklist, bottom mobile nav, stock badges, lightbox,
    │   │                       #   Cache-API smart caching keyed on last_updated.json
    │   │                       #   (products.json falls back to stale cache on net fail;
    │   │                       #   failed profile fetches are never cached)
    │   │                       #   Promo-only filter + on-card promo price display
    │   │                       #   (promoOnlyLabel hidden in guest mode)
    │   ├── catalog-admin.html  # Admin: block items, orders log + new-order sound alerts,
    │   │                       #   top-requested-items report, promos, users, audit logs
    │   ├── generate_catalog.py # ACTIVE daily generator (9AM batch runs this copy;
    │   │                       #   writes catalog/ files + parent copies, compact JSON)
    │   ├── orders.html, outlet-orders-supabase.html, cross-outlet-search.html,
    │   ├── quotation.html, checklist-status.html, weekly-closing*.html, maintenance*.html
    │   ├── inventory_assistant/  # PWA stock-count app (Realtime + camera barcode)
    │   └── _archive/           # GITIGNORED — old page versions + sensitive exports.
    │                           #   Never delete, never re-track in git.
    │
    ├── admin_logic.js          # Flask API calls, target CRUD, auth
    ├── target_logic.js         # YoY comparison, target aggregation
    ├── excel_export.js         # Excel report generation (SheetJS)
    ├── pdf_export.js           # PDF sales reports (jsPDF)
    ├── pdf_export_employees.js # Employee PDF reports
    ├── product_pdf_export.js   # Product analysis PDFs
    ├── users.js                # Client-side user credentials & roles
    │
    ├── management_data.json    # ~5 MB — stores, sales, targets, visitors (daily & hourly)
    ├── employees_data.json     # ~11 MB — employee transaction history
    ├── product_analysis_data.json  # ~67 MB — product analytics
    ├── offers_data.json        # ~18 MB — offers/deals details
    ├── products.json           # ~3.4 MB — product catalog
    ├── stock_data.json         # Live stock JSON
    │
    ├── ceo_data/               # Historical monthly sales (sales_YYYY_MM.json)
    ├── assets/amiri_font.js    # Arabic Amiri font as base64
    │
    ├── manifest.json           # PWA manifest
    │
    └── *.py                    # Utility/data-processing scripts
```

---

## Data Pipeline & Business Logic (CRITICAL)

The Python scripts located in the root `orangedata/` are **NOT** optional side-tools; they form the core ETL (Extract, Transform, Load) pipeline.

1. **Data Aggregation Rules**: `generate_management_data.py` merges completely different historical epochs dynamically:
   - **Legacy (<= 2025)**: Reads from `gofrugal_sales`.
   - **Modern (>= 2026)**: Reads from `dynamic_sales_items` (Dynamics 365).
   - **Manual Overwrites**: Manual entries for platforms/warehouses overwrite automated data based on identical date/store keys.
2. **Shift & Time Logic (WARNING)**: The retail day does NOT end at 12:00 AM.
   - Sales occurring after midnight (up to 3:00 AM) are shifted to the *previous* date. This is critical for all calculations.
   - **Ramadan Exception**: During Ramadan dates (e.g., Feb 18 - Mar 20, 2026), visitor counting hours and sales targets drastically shift. Always verify if a date falls within Ramadan (`metadata.ramadan_dates` in JSON) before modifying time-series extraction logic. The Python scripts natively handle these shifts.
3. **Data Refresh**: A 15-minute scheduled Python task updates the JSON data files. **Never edit the data JSON files manually.**

---

## Frontend Stack

| Concern | Technology / CDN |
|---|---|
| UI framework | Bootstrap 5.3.0 RTL |
| Charts | Chart.js 4+ |
| PDF export | jsPDF 2.5.1 + jsPDF AutoTable 3.5.28 |
| Excel export | SheetJS (XLSX) 0.18.5 |
| Icons | Font Awesome 6.4.0 |
| Typography | Google Fonts — Tajawal, Cairo; Amiri (base64) |
| Language | Vanilla JavaScript (ES6+) |

No npm, no webpack, no TypeScript, no framework (React/Vue/etc.).

---

## Backend Stack

| Concern | Technology |
|---|---|
| Framework | Flask (Python) |
| CORS | Flask-CORS |
| ORM | SQLAlchemy |
| Database | PostgreSQL (GoFrugal ERP / Dynamics) & Supabase (Maintenance) |
| Auth | HTTP Basic Auth |

---

## Key Conventions

### Naming
| Asset | Convention | Example |
|---|---|---|
| HTML files | snake_case or kebab-case | `admin_targets.html`, `cross-outlet-search.html` |
| JS functions | camelCase | `updateDashboard()`, `generateExcelReport()` |
| CSS classes | kebab-case | `kpi-card`, `chart-container` |
| JSON data files | snake_case | `management_data.json` |
| Global JS vars | camelCase or UPPER_CASE | `rawData`, `API_BASE` |

### Script Loading in HTML
Each page includes its own ordered `<script>` tags in the `<body>`:
1. CDN libraries (Bootstrap, Chart.js, jsPDF, etc.)
2. Shared utilities (`admin_logic.js`, `target_logic.js`)
3. Page-specific export files (`pdf_export.js`, `excel_export.js`)

### Inline Styles
Styling is done with Bootstrap classes and an inline `<style>` block in each HTML file. CSS variables are defined at `:root`:
```css
:root {
  --bs-primary: #fe7900;
  --card-radius: 12px;
  --font-main: 'Tajawal', sans-serif;
}
```

---

## State Management

There is no state library. State is managed via:

| Storage | Used for |
|---|---|
| `localStorage` | Persistent user session (`currentUser`) |
| `sessionStorage` | Auth token (`Basic base64...`) |
| `window.rawData` | Loaded JSON payload (e.g., `management_data.json`) |
| `window.globalEmpTargets` | Employee targets cache |
| `window.dashboardState` | Active filter state (date range, manager, city) |
| HTML form elements | Temporary filter inputs |

**Data flow:**
```
User Action (filter/click)
  → Event handler
  → fetch() or direct JSON access on window.rawData
  → Update DOM / re-render Chart.js
```

---

## Authentication

- **Frontend**: Client-side user list in `users.js`; PIN validated in the browser; user stored in `localStorage`.
- **Backend (API)**: HTTP Basic Auth on all Flask routes (`requires_auth` decorator); token stored in `sessionStorage`.
- **Note**: `users.js` contains credentials in plain text — do not add sensitive secrets here.

---

## Data Structures

### `management_data.json` (core data file)
```json
{
  "metadata": { "generated_at": "...", "total_records": 0, "ramadan_dates": [...] },
  "stores":    { "1001": "Store Name" },
  "store_meta": { "1001": { "manager": "...", "city": "...", "type": "..." } },
  "sales":        [[date, storeId, amount]],
  "targets":      [[date, storeId, target]],
  "visitors":     [[date, storeId, count]],
  "transactions": [[date, storeId, count]],
  "sales_hourly": [[date, storeId, hour, amount, bill_count]],
  "visitors_hourly": [[date, storeId, hour, count]],
  "offers_analysis": [...]
}
```
*Note: The frontend `Shift View` and Hourly charts rely exclusively on the `_hourly` arrays and map hours (0-23) based on the shift logic.*

### `ceo_data/sales_YYYY_MM.json`
Monthly historical sales snapshots used for year-over-year comparisons.

---

## Flask API (server_admin.py)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/targets?month=YYYY-MM` | Fetch store & employee targets |
| POST | `/api/save_store_target` | Save/update a store target |
| POST | `/api/save_employee_target` | Save/update an employee target |
| GET | `/api/employees?store=StoreName` | List employees for a store |
| POST | `/api/sales` | Manual sales data entry |

All endpoints require HTTP Basic Auth. Include the `ngrok-skip-browser-warning` header when tunnelling.

### Running the backend
```bash
python server_admin.py
```

The server reads credentials from a `.env` file (not committed).

---

## Export Features

- **PDF**: jsPDF + AutoTable; Arabic text uses the bundled Amiri font.
- **Excel**: SheetJS/XLSX; columns and sheet names follow Arabic naming.
- Export functions are separated into dedicated JS files (`pdf_export.js`, `excel_export.js`, etc.) and called from page-level event handlers.

---

## Automation / Data Refresh

- A 15-minute automated Python cycle rewrites the JSON data files and commits them.
- Do **not** manually edit the large JSON data files (`management_data.json`, `employees_data.json`, `product_analysis_data.json`, `offers_data.json`, `stock_data.json`) — they are auto-generated.

---

## PWA

- `manifest.json` configures the PWA:
  - Display name: `مبيعات اليوم - Orange Data`
  - Start URL: `widget.html`
  - Theme: `#fe7900`
- Icons: `icon-192.png`, `icon-512.png`

---

## No Build / No Tests

- There is **no build step**. Edit HTML/JS/CSS directly and refresh the browser.
- There are **no automated tests** (no Jest, Pytest, etc.). Validate changes manually.

---

## What to Avoid

- **Do not** introduce a bundler, Tailwind, or framework (React/Vue/etc.) without explicit agreement — this breaks the no-build convention.
- **Do not** assume scripts and HTML are in the same folder. Pay attention to `orangedata/` (Python ETL) vs `allorangedashboard/` (Frontend UI).
- **Do not** edit Python ETL logic (like `generate_management_data.py` or `.py` files in root) without extremely careful accounting for the midnight-shift logic and legacy VS modern data merging constraints.
- **Do not** edit large auto-generated JSON files.
- **Do not** add secrets or real credentials to `users.js` or commit `.env`.
- **Do not** load additional large libraries via CDN without considering page load impact.
- **Do not** use `document.write()` or synchronous XHR; use `fetch()` for all async data loading.
- **Do not** break RTL layout — always test UI changes with Arabic text and RTL direction.

---

## Common Tasks

### Add a new dashboard page
1. Copy an existing HTML file as a template (e.g., `data_audit.html`).
2. Update the `<title>` and navbar active link.
3. Add page-specific `<script>` includes at the bottom.
4. Link the new page from `index.html` or the navbar.

### Add a new API endpoint
1. Open `../server_admin.py` in the parent directory.
2. Add a new route decorated with `@app.route(...)` and `@requires_auth`.
3. Call the endpoint from `admin_logic.js` using `fetch()` with Basic Auth headers.

### Add a new chart
1. Add a `<canvas id="myChart">` element in the HTML.
2. In the page's `<script>` block (or a JS file), instantiate `new Chart(...)` using Chart.js API.
3. Wrap the initialization inside the `DOMContentLoaded` event or after data loads.

### Change brand color
Update the CSS variable in the relevant HTML page's `<style>` block:
```css
:root { --bs-primary: #fe7900; }
```
And update `manifest.json`'s `theme_color` if needed.
