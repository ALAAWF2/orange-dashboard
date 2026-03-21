# CLAUDE.md — Orange Dashboard

A comprehensive guide for AI assistants working in this codebase.

---

## Project Overview

**Orange Dashboard** is a production sales analytics dashboard for a retail organization. It is a multi-page web application (MPA) — not a SPA — with an Arabic/RTL interface, a Python/Flask backend, and direct JSON data loading.

- **Language**: Arabic (RTL layout throughout)
- **Brand color**: Orange (`#fe7900`)
- **PWA**: Yes (`manifest.json`, start URL is `widget.html`)

---

## Architecture

```
Browser (Vanilla JS + Bootstrap 5 RTL)
    |
    |-- Loads large JSON files directly (no API for reads)
    |-- Calls Flask API (admin_logic.js) for writes/targets
    |
Flask Backend (server_admin.py)
    |
    PostgreSQL (GoFrugal ERP data)
```

This is a **traditional multi-page application**:
- Each HTML file is an independent page with its own `<script>` includes.
- No bundler, no transpiler, no build step.
- All frontend dependencies come from CDN.
- Data is read by loading JSON files; writes go to the Flask API.

---

## Directory Layout

```
/
├── index.html                  # Main sales dashboard
├── login.html                  # Authentication entry point
├── widget.html                 # Mobile/quick view (PWA start URL)
├── employees.html              # Employee performance analytics
├── product_analysis.html       # Product sales analysis
├── offers_analysis.html        # Promotional offers tracking
├── admin_targets.html          # Admin target management UI
├── target_setting.html         # Manager target setting
├── data_audit.html             # Data validation/auditing
├── branch_details.html         # Branch information
├── chatbot.html                # Chat interface
├── rep.html                    # Reports
├── stagnant_products.html      # Stagnant product analysis
│
├── admin_logic.js              # Flask API calls, target CRUD, auth
├── target_logic.js             # YoY comparison, target aggregation
├── excel_export.js             # Excel report generation (SheetJS)
├── pdf_export.js               # PDF sales reports (jsPDF)
├── pdf_export_employees.js     # Employee PDF reports
├── product_pdf_export.js       # Product analysis PDFs
├── users.js                    # Client-side user credentials & roles
│
├── server_admin.py             # Flask backend (main API server)
│
├── management_data.json        # ~5 MB — stores, sales, targets, visitors
├── employees_data.json         # ~11 MB — employee transaction history
├── product_analysis_data.json  # ~67 MB — product analytics
├── offers_data.json            # ~18 MB — offers/deals
├── products.json               # ~3.4 MB — product catalog
│
├── ceo_data/                   # Historical monthly sales (sales_YYYY_MM.json)
├── assets/amiri_font.js        # Arabic Amiri font as base64
│
├── manifest.json               # PWA manifest
│
└── *.py                        # Utility/data-processing scripts (not part of app)
```

---

## Frontend Stack

| Concern | Technology / CDN |
|---|---|
| UI framework | Bootstrap 5.3.0 RTL |
| Charts | Chart.js |
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
| Database | PostgreSQL (GoFrugal ERP) |
| Environment | python-dotenv |
| Auth | HTTP Basic Auth |

---

## Key Conventions

### Naming
| Asset | Convention | Example |
|---|---|---|
| HTML files | snake_case | `admin_targets.html` |
| JS functions | camelCase | `updateDashboard()`, `generateExcelReport()` |
| CSS classes | kebab-case | `kpi-card`, `chart-container` |
| JSON data files | snake_case | `management_data.json` |
| Global JS vars | camelCase or UPPER_CASE | `rawData`, `API_BASE` |
| Python functions | snake_case | `normalize_emp_id()`, `check_auth()` |

### File Organization
- All HTML pages live at the **root** — no `pages/` or `src/` directory.
- All JS logic files live at the **root** alongside HTML.
- Historical monthly data lives in `ceo_data/`.
- Static assets (fonts, icons) live in `assets/`.

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
- **Backend**: HTTP Basic Auth on all Flask routes (`requires_auth` decorator); token stored in `sessionStorage`.
- **Note**: `users.js` contains credentials in plain text — do not add sensitive secrets here.

---

## Data Structures

### `management_data.json` (core data file)
```json
{
  "metadata": { "generated_at": "...", "total_records": 0 },
  "stores":    { "1001": "Store Name" },
  "store_meta": { "1001": { "manager": "...", "city": "...", "type": "..." } },
  "sales":        [[date, storeId, amount]],
  "targets":      [[date, storeId, target]],
  "visitors":     [[date, storeId, count]],
  "transactions": [[date, storeId, count]]
}
```

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

The server reads credentials from a `.env` file (not committed):
```
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
```

---

## Export Features

- **PDF**: jsPDF + AutoTable; Arabic text uses the bundled Amiri font.
- **Excel**: SheetJS/XLSX; columns and sheet names follow Arabic naming.
- Export functions are separated into dedicated JS files (`pdf_export.js`, `excel_export.js`, etc.) and called from page-level event handlers.

---

## Automation / Data Refresh

- A 15-minute automated update cycle rewrites the JSON data files and commits them (see `update_log.txt`, `update_15m_log.txt`).
- Do **not** manually edit the large JSON data files — they are auto-generated.

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
- Python utility scripts (`check_dups.py`, `inspect_data.py`, etc.) are one-off data tools, not part of the app itself.

---

## What to Avoid

- **Do not** introduce a bundler or framework without explicit agreement — this breaks the no-build convention.
- **Do not** edit large auto-generated JSON files (`management_data.json`, `employees_data.json`, `product_analysis_data.json`, `offers_data.json`).
- **Do not** add secrets or real credentials to `users.js` or commit `.env`.
- **Do not** load additional large libraries via CDN without considering page load impact (the product analysis page already loads 67 MB of JSON).
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
1. Open `server_admin.py`.
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
