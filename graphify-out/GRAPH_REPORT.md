# Graph Report - C:\Users\ALAA-ORANGE\Desktop\orangedata  (2026-08-09)

## Corpus Check
- 84 files · ~272,409 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 186 nodes · 242 edges · 45 communities (42 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- app App
- excel_export Excel Export
- dashboard Dashboard
- target_logic Target Logic
- pdf_export Pdf Export
- test_suggestion Test Suggestion
- admin_logic Admin Logic
- generate_catalog Generate Catalog
- average-bill-program Average-Bill-Program
- nav Nav
- commission-visibility Commission-Visibility
- sw Allowed Domains
- pdf_export_employees Pdf Export Employees
- product_pdf_export Product Pdf Export

## God Nodes (most connected - your core abstractions)
1. `buildPDFDoc()` - 9 edges
2. `main()` - 8 edges
3. `buildEmployeeCommissionRows()` - 8 edges
4. `renderTable()` - 6 edges
5. `enterWorkspace()` - 6 edges
6. `playBeep()` - 5 edges
7. `showFeedback()` - 5 edges
8. `handleScan()` - 5 edges
9. `handleOfflineScan()` - 5 edges
10. `subscribeToSession()` - 5 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (45 total, 3 thin omitted)

### Community 0 - "app App"
Cohesion: 0.15
Nodes (24): checkActiveSession(), enterWorkspace(), formatExcelCell(), generateExcelRows(), handleExcelImport(), handleOfflineScan(), handleScan(), hideSessionButtons() (+16 more)

### Community 1 - "excel_export Excel Export"
Cohesion: 0.26
Nodes (15): buildEmployeeCommissionRows(), exportEmployeeSales(), exportStoreSales(), generateExcelReport(), getCommissionEmployeeCandidates(), getCommissionEmployeeTarget(), getCommissionRate(), getCommissionStoreTarget() (+7 more)

### Community 2 - "dashboard Dashboard"
Cohesion: 0.25
Nodes (13): calculateKPIs(), calculateSessionSummary(), loadSessionsData(), renderDetailTable(), renderSessionsList(), selectedSessionItems, selectSession(), sessionAggregates (+5 more)

### Community 3 - "target_logic Target Logic"
Cohesion: 0.22
Nodes (13): calcTargetGrowth(), calculateCurrentEmployees(), distributeToEmployees(), excludeEmployee(), fetchData(), generateExcelWorkbook(), getMonthName(), loadData() (+5 more)

### Community 4 - "pdf_export Pdf Export"
Cohesion: 0.31
Nodes (12): buildPDFDoc(), buildPdfTargetLookup(), formatPdfDate(), generatePDF(), getDayData(), getGlobalDayData(), getInclusivePdfDayCount(), getPdfTargetPlan() (+4 more)

### Community 5 - "test_suggestion Test Suggestion"
Cohesion: 0.18
Nodes (9): categoriesMap, fs, prodData, tests, testTowel1, testTowel2, testTowel3, testTowel4 (+1 more)

### Community 6 - "admin_logic Admin Logic"
Cohesion: 0.31
Nodes (7): checkAdminButtons(), fetchData(), login(), logout(), renderEmployees(), renderStores(), toggleEmpList()

### Community 7 - "generate_catalog Generate Catalog"
Cohesion: 0.42
Nodes (8): fetch_all(), get_access_token(), get_category(), load_available_images(), load_category_rules(), load_mapping(), main(), resolve_image()

### Community 8 - "average-bill-program Average-Bill-Program"
Cohesion: 0.43
Nodes (7): applyState(), filterIncentivesPayload(), formatRiyadhTimestamp(), isDateActive(), load(), normalizeBase(), normalizeState()

### Community 9 - "nav Nav"
Cohesion: 0.39
Nodes (5): checkVersionAndHeartbeat(), initNavbar(), performStallCheck(), setupDropdownToggles(), updateHeartbeatDisplay()

### Community 11 - "commission-visibility Commission-Visibility"
Cohesion: 0.83
Nodes (3): applyState(), load(), normalizeBase()

## Knowledge Gaps
- **22 isolated node(s):** `supabaseClient`, `stockByOutlet`, `scannedItems`, `localBarcodesCache`, `offlineQueue` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `supabaseClient`, `stockByOutlet`, `scannedItems` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._