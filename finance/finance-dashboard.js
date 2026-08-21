(() => {
    'use strict';

    const money = new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0
    });
    const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
    let loading = false;
    let initialized = false;

    let currentShowrooms = [];
    let currentInvoices = [];
    let currentTopVendors = [];
    let currentLeases = [];
    let currentAssets = [];
    let currentAdvances = [];
    let currentPurchases = [];
    let currentInventory = [];
    let currentTreasury = {};
    let currentTaxHub = {};
    let currentExpenseScopeStatus = 'approved';
    let currentMaintenance = {};
    let currentShowroomPayload = null;
    let currentShowroomPnl = null;
    let chartInstances = {};

    const sortState = {
        showrooms: { key: 'name', dir: 'asc' },
        invoices: { key: 'invoice_date', dir: 'desc' },
        topVendors: { key: 'remaining_amount', dir: 'desc' },
        leases: { key: 'expiration_date', dir: 'asc' },
        assets: { key: 'fixed_asset_group_id', dir: 'asc' },
        advances: { key: 'start_date', dir: 'desc' },
        purchases: { key: 'accounting_date', dir: 'desc' },
        inventory: { key: 'total_retail_value', dir: 'desc' },
        maintenance: { key: 'total_maintenance_amount', dir: 'desc' }
    };

    const filters = {
        showrooms: { search: '', status: 'all' },
        invoices: { search: '', status: 'all' },
        assets: { search: '', group: 'all', scope: 'all' },
        advances: { search: '', type: 'all', status: 'all' },
        purchases: { search: '', status: 'all' },
        inventory: { search: '' },
        maintenance: { search: '' },
        cashRecon: { search: '', status: 'all' }
    };

    function element(id) {
        return document.getElementById(id);
    }

    function textElement(tagName, value, className = '') {
        const node = document.createElement(tagName);
        if (className) node.className = className;
        node.textContent = value === null || value === undefined ? '' : String(value);
        return node;
    }

    function tableMessage(body, colspan, message, className = 'text-center text-muted') {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = colspan;
        cell.className = className;
        cell.textContent = message;
        row.append(cell);
        body.replaceChildren(row);
    }

    function isoDate(value) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function setDefaultPeriod() {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        if (!element('financePlatformStart').value) {
            element('financePlatformStart').value = isoDate(start);
        }
        if (!element('financePlatformEnd').value) {
            element('financePlatformEnd').value = isoDate(today);
        }
    }

    function periodParams() {
        return {
            start: element('financePlatformStart').value,
            end: element('financePlatformEnd').value
        };
    }

    function setState(kind, label) {
        const state = element('financePlatformState');
        if (!state) return;
        state.className = `finance-state-chip is-${kind}`;
        state.replaceChildren();
        const dot = document.createElement('span');
        dot.className = 'finance-state-dot';
        state.append(dot, document.createTextNode(label));
    }

    function setMetric(id, value) {
        const el = element(id);
        if (el) el.textContent = value;
    }

    function resetMetrics() {
        [
            'financeShowroomCount',
            'financeHistoricalShowroomCount',
            'financeExpenseTotal',
            'financeVendorBalance',
            'financeVendorOpenCount',
            'financeLeaseCount',
            'financeFixedAssetCount'
        ].forEach(id => setMetric(id, '—'));
    }

    function compareValues(a, b, key, dir) {
        let valA = a[key];
        let valB = b[key];
        if (valA === null || valA === undefined) valA = '';
        if (valB === null || valB === undefined) valB = '';

        if (typeof valA === 'number' && typeof valB === 'number') {
            return dir === 'asc' ? valA - valB : valB - valA;
        }

        const numA = Number(valA);
        const numB = Number(valB);
        const isNumA = typeof valA === 'number' || (typeof valA === 'string' && valA.trim() !== '' && !isNaN(numA) && !valA.includes('-'));
        const isNumB = typeof valB === 'number' || (typeof valB === 'string' && valB.trim() !== '' && !isNaN(numB) && !valB.includes('-'));
        if (isNumA && isNumB) {
            return dir === 'asc' ? numA - numB : numB - numA;
        }

        if (typeof valA === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valA) && typeof valB === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valB)) {
            return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        const res = strA.localeCompare(strB, 'ar', { numeric: true });
        return dir === 'asc' ? res : -res;
    }

    function updateSortHeaders(table) {
        const headers = document.querySelectorAll(`th.finance-sortable[data-table="${table}"]`);
        const state = sortState[table];
        headers.forEach(th => {
            const key = th.dataset.sort;
            const icon = th.querySelector('i');
            th.classList.remove('is-sorted-asc', 'is-sorted-desc');
            if (icon) {
                icon.className = 'fa-solid fa-sort';
            }
            if (state && state.key === key) {
                if (state.dir === 'asc') {
                    th.classList.add('is-sorted-asc');
                    if (icon) icon.className = 'fa-solid fa-sort-up';
                } else {
                    th.classList.add('is-sorted-desc');
                    if (icon) icon.className = 'fa-solid fa-sort-down';
                }
            }
        });
    }

    function renderSetupState(payload) {
        element('financeSetupNotice').hidden = false;
        setState('waiting', 'بانتظار تفعيل قاعدة Finance');
        resetMetrics();
        element('financeCategoryList').innerHTML =
            '<div class="finance-empty-state">ستظهر التصنيفات بعد تطبيق migration واستيراد البيانات.</div>';
        element('financeShowroomsBody').innerHTML =
            '<tr><td colspan="6" class="finance-empty-state">سجل المعارض جاهز للربط، ولم تُكتب بيانات Dynamics إلى PostgreSQL بعد.</td></tr>';
        element('financeVendorInvoicesBody').innerHTML =
            '<tr><td colspan="7" class="finance-empty-state">تظهر الفواتير بعد استيراد AP.</td></tr>';
        element('financeLeasesBody').innerHTML =
            '<tr><td colspan="5" class="finance-empty-state">تظهر العقود بعد استيراد الإيجارات.</td></tr>';
    }

    function renderOverview(payload) {
        if (!payload.configured) {
            renderSetupState(payload);
            return;
        }
        element('financeSetupNotice').hidden = true;
        setState('ready', 'المنصة المالية متصلة');
        const summary = payload.summary || {};
        setMetric('financeShowroomCount', integer.format(summary.showrooms || 0));
        setMetric('financeHistoricalShowroomCount', integer.format(summary.historical_showrooms || 0));
        const expenseScopeApproved = summary.expense_scope_status === 'approved';
        element('financeExpenseTotal').classList.toggle('is-pending', !expenseScopeApproved);
        setMetric(
            'financeExpenseTotal',
            expenseScopeApproved
                ? money.format(Number(summary.non_sales_expenses) || 0)
                : 'بانتظار اعتماد الحسابات'
        );
        setMetric('financeVendorBalance', money.format(summary.open_vendor_balance || 0));
        setMetric('financeVendorOpenCount', integer.format(summary.open_vendor_transactions || 0));
        setMetric('financeLeaseCount', integer.format(summary.active_leases || 0));
        setMetric('financeFixedAssetCount', integer.format(summary.fixed_assets || 0));
        element('financePeriodLabel').textContent =
            `${payload.period?.start || '—'} — ${payload.period?.end || '—'}`;
        renderCategories(payload.categories || [], summary.expense_scope_status);
    }

    function renderCategories(categories, expenseScopeStatus) {
        const container = element('financeCategoryList');
        if (expenseScopeStatus !== 'approved') {
            container.innerHTML = '<div class="finance-empty-state">بانتظار اعتماد حسابات المصروف غير البيعي من المحاسب.</div>';
            return;
        }
        if (!categories.length) {
            container.innerHTML = '<div class="finance-empty-state">لا توجد حركة غير بيعية ضمن الفترة المحددة.</div>';
            return;
        }
        const maxAmount = Math.max(...categories.map(item => Math.abs(Number(item.amount) || 0)), 1);
        container.replaceChildren(...categories.map(item => {
            const row = document.createElement('div');
            row.className = 'finance-category-row';
            const label = document.createElement('strong');
            label.textContent = item.name || 'غير مصنف';
            const track = document.createElement('div');
            track.className = 'finance-category-track';
            const fill = document.createElement('span');
            fill.className = 'finance-category-fill';
            fill.style.width = `${Math.max(3, (Math.abs(Number(item.amount) || 0) / maxAmount) * 100)}%`;
            track.append(fill);
            const value = document.createElement('span');
            value.className = 'finance-category-value';
            value.textContent = money.format(Number(item.amount) || 0);
            row.append(label, track, value);
            return row;
        }));
    }

    function closeShowroomDetail() {
        element('financeShowroomDrawer').hidden = true;
        document.body.classList.remove('finance-drawer-open');
    }

    function detailSection(title, columns, rows) {
        const section = document.createElement('section');
        section.className = 'finance-showroom-section';
        const heading = document.createElement('h3');
        heading.textContent = title;
        section.append(heading);
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'finance-empty-state';
            empty.textContent = 'لا توجد سجلات مرتبطة بهذا المعرض.';
            section.append(empty);
            return section;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'table-responsive';
        const table = document.createElement('table');
        table.className = 'table finance-register-table align-middle';
        const head = document.createElement('thead');
        const headRow = document.createElement('tr');
        columns.forEach(column => {
            const cell = document.createElement('th');
            cell.textContent = column.label;
            headRow.append(cell);
        });
        head.append(headRow);
        const body = document.createElement('tbody');
        rows.forEach(item => {
            const row = document.createElement('tr');
            columns.forEach(column => {
                const cell = document.createElement('td');
                const rawValue = item[column.key];
                cell.textContent = column.money
                    ? money.format(Number(rawValue) || 0)
                    : (rawValue ?? '—');
                if (column.ltr || column.money) cell.dir = 'ltr';
                if (column.money) cell.className = 'text-end fw-bold';
                row.append(cell);
            });
            body.append(row);
        });
        table.append(head, body);
        wrapper.append(table);
        section.append(wrapper);
        return section;
    }

    function renderShowroomDetail(payload, pnl) {
        currentShowroomPayload = payload;
        currentShowroomPnl = pnl;
        const showroom = payload.showroom || {};
        const summary = payload.summary || {};
        const pnlSummary = pnl?.summary || {};
        const hasPnl = pnl?.state === 'ready' && pnlSummary.revenue_available;

        element('financeShowroomTitle').textContent = showroom.name || 'تفاصيل المعرض المالية';
        element('financeShowroomMeta').textContent =
            `Dynamics ${showroom.number || '—'} · Branch ${showroom.branch_dimension || '—'} · ${payload.period?.start || '—'} إلى ${payload.period?.end || '—'}`;

        const content = element('financeShowroomContent');
        content.replaceChildren();

        // 1. Executive 360 KPI Grid (Revenue, Gross Profit, OPEX, EBITDA)
        const cards = document.createElement('div');
        cards.className = 'finance-showroom-summary';

        const revVal = hasPnl ? Number(pnlSummary.revenue || 0) : null;
        const grossVal = hasPnl ? Number(pnlSummary.gross_profit || 0) : null;
        const grossPct = hasPnl ? (pnlSummary.gross_margin_pct || 0) : null;
        const opexVal = Number(pnlSummary.total_expense || summary.trial_balance_expense || 0);
        const ebitdaVal = hasPnl ? Number(pnlSummary.operating_result || 0) : null;
        const ebitdaPct = hasPnl ? (pnlSummary.ebitda_margin_pct || 0) : null;

        // Card 1: Revenue
        const cardRev = document.createElement('article');
        cardRev.className = 'is-kpi-revenue';
        cardRev.innerHTML = `
            <span>إيرادات مبيعات المعرض</span>
            <strong>${revVal !== null ? money.format(revVal) : 'غير متوفر'}</strong>
            <small class="finance-kpi-badge is-positive">${revVal !== null ? 'إيراد فعلي معتمد' : 'بانتظار اكتمال التغطية'}</small>
        `;

        // Card 2: Gross Profit
        const cardGross = document.createElement('article');
        cardGross.className = 'is-kpi-gross';
        cardGross.innerHTML = `
            <span>مجمل الربح التجاري</span>
            <strong>${grossVal !== null ? money.format(grossVal) : '—'}</strong>
            <small class="finance-kpi-badge is-positive">${grossPct !== null ? 'هامش الربح ' + grossPct + '%' : '—'}</small>
        `;

        // Card 3: OPEX
        const cardOpex = document.createElement('article');
        cardOpex.className = 'is-kpi-opex';
        cardOpex.innerHTML = `
            <span>المصروفات التشغيلية المعتمدة (مصروف Trial Balance)</span>
            <strong>${money.format(opexVal)}</strong>
            <small class="finance-kpi-badge is-negative">تشمل الإيجار والرواتب والصيانة</small>
        `;

        // Card 4: EBITDA
        const cardEbitda = document.createElement('article');
        cardEbitda.className = 'is-kpi-ebitda';
        const isPos = (ebitdaVal || 0) >= 0;
        cardEbitda.innerHTML = `
            <span>صافي الربح التشغيلي للفرع (EBITDA)</span>
            <strong>${ebitdaVal !== null ? money.format(ebitdaVal) : '—'}</strong>
            <small class="finance-kpi-badge ${isPos ? 'is-positive' : 'is-negative'}">${ebitdaPct !== null ? 'هامش ' + ebitdaPct + '%' : '—'}</small>
        `;

        cards.append(cardRev, cardGross, cardOpex, cardEbitda);
        content.append(cards);

        // 2. Showroom P&L Waterfall Table (if P&L available)
        if (hasPnl) {
            const pnlSection = document.createElement('section');
            pnlSection.className = 'finance-showroom-section mb-4';
            pnlSection.innerHTML = `
                <h3>
                    <span><i class="fa-solid fa-chart-pie text-warning me-2"></i> قائمة الدخل والأرباح التشغيلية للفرع</span>
                    <span class="badge bg-light text-dark fw-normal border">المصروفات المعتمدة</span>
                </h3>
                <div class="table-responsive">
                    <table class="finance-pnl-waterfall">
                        <tbody>
                            <tr class="is-header-row">
                                <td><span class="finance-pnl-badge-sign is-add">+</span> إيرادات مبيعات المعرض (Sales Revenue)</td>
                                <td class="text-end fw-bold" dir="ltr">${money.format(pnlSummary.revenue || 0)}</td>
                                <td class="text-muted text-end small" style="width: 120px;">100.0%</td>
                            </tr>
                            <tr>
                                <td><span class="finance-pnl-badge-sign is-sub">-</span> تكلفة شراء البضاعة المباعة (COGS)</td>
                                <td class="text-end text-danger" dir="ltr">${money.format(pnlSummary.cogs || 0)}</td>
                                <td class="text-muted text-end small">${revVal ? ((pnlSummary.cogs / revVal) * 100).toFixed(1) + '%' : '—'}</td>
                            </tr>
                            <tr class="is-total-row">
                                <td><span class="finance-pnl-badge-sign is-eq">=</span> مجمل الربح التجاري (Gross Profit)</td>
                                <td class="text-end fw-bold text-primary" dir="ltr">${money.format(pnlSummary.gross_profit || 0)}</td>
                                <td class="text-end fw-bold text-primary small">${grossPct ? grossPct + '%' : '—'}</td>
                            </tr>
                            <tr>
                                <td><span class="finance-pnl-badge-sign is-sub">-</span> استهلاك وإيجار المعرض (Rent)</td>
                                <td class="text-end text-danger" dir="ltr">${money.format(pnlSummary.rent_expense || 0)}</td>
                                <td class="text-muted text-end small">${revVal ? ((pnlSummary.rent_expense / revVal) * 100).toFixed(1) + '%' : '—'}</td>
                            </tr>
                            <tr>
                                <td><span class="finance-pnl-badge-sign is-sub">-</span> رواتب ومصاريف موظفي المعرض (Payroll)</td>
                                <td class="text-end text-danger" dir="ltr">${money.format(pnlSummary.payroll_expense || 0)}</td>
                                <td class="text-muted text-end small">${revVal ? ((pnlSummary.payroll_expense / revVal) * 100).toFixed(1) + '%' : '—'}</td>
                            </tr>
                            <tr>
                                <td><span class="finance-pnl-badge-sign is-sub">-</span> مصاريف تشغيلية وصيانة وفواتير موردين (OPEX)</td>
                                <td class="text-end text-danger" dir="ltr">${money.format(pnlSummary.other_opex || 0)}</td>
                                <td class="text-muted text-end small">${revVal ? ((pnlSummary.other_opex / revVal) * 100).toFixed(1) + '%' : '—'}</td>
                            </tr>
                            <tr class="is-ebitda-row">
                                <td><span class="finance-pnl-badge-sign is-eq">=</span> صافي الربح التشغيلي للمعرض (EBITDA)</td>
                                <td class="text-end fw-bold" dir="ltr">${money.format(pnlSummary.operating_result || 0)}</td>
                                <td class="text-end fw-bold small">${ebitdaPct ? ebitdaPct + '%' : '—'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
            content.append(pnlSection);
        }

        // 3. Sub-tabs navigation for detailed breakdown
        const tabsNav = document.createElement('div');
        tabsNav.className = 'finance-showroom-tabs mt-4';
        tabsNav.innerHTML = `
            <button type="button" class="finance-showroom-tab-btn is-active" data-detail-tab="accounts"><i class="fa-solid fa-list-check me-1"></i> بنود المصروفات المعتمدة (${payload.expense_categories?.length || 0})</button>
            <button type="button" class="finance-showroom-tab-btn" data-detail-tab="leases"><i class="fa-solid fa-file-contract me-1"></i> عقود الإيجار (${payload.leases?.length || 0})</button>
            <button type="button" class="finance-showroom-tab-btn" data-detail-tab="invoices"><i class="fa-solid fa-receipt me-1"></i> فواتير الموردين والصيانة (${payload.vendor_invoices?.length || 0})</button>
            <button type="button" class="finance-showroom-tab-btn" data-detail-tab="assets"><i class="fa-solid fa-boxes-stacked me-1"></i> الأصول والممتلكات (${payload.assets?.length || 0})</button>
        `;
        content.append(tabsNav);

        // Sections containers
        const secAccounts = detailSection('بنود المصروفات المعتمدة للفرع', [
            { key: 'main_account_id', label: 'بند الحساب', ltr: true },
            { key: 'category', label: 'البيان / التصنيف' },
            { key: 'debit_amount', label: 'صرف (مدين)', money: true },
            { key: 'credit_amount', label: 'تسوية (دائن)', money: true },
            { key: 'net_amount', label: 'صافي المصروف', money: true }
        ], payload.expense_categories || []);
        secAccounts.id = 'secDetailAccounts';

        const secInvoices = detailSection('فواتير الموردين ومصاريف الصيانة والتشغيل المرتبطة بالفرع', [
            { key: 'invoice_id', label: 'رقم الفاتورة', ltr: true },
            { key: 'vendor_name', label: 'المورد / المقاول' },
            { key: 'invoice_date', label: 'تاريخ الفاتورة', ltr: true },
            { key: 'due_date', label: 'موعد السداد (الاستحقاق)', ltr: true },
            { key: 'allocated_amount', label: 'المبلغ المعتمد', money: true },
            { key: 'allocated_tax_amount', label: 'الضريبة', money: true }
        ], payload.vendor_invoices || []);
        secInvoices.id = 'secDetailInvoices';
        secInvoices.hidden = true;

        const secLeases = detailSection('عقود إيجار الفرع والاستحقاقات', [
            { key: 'lease_id', label: 'رقم العقد', ltr: true },
            { key: 'description', label: 'البيان / الوصف' },
            { key: 'expiration_date', label: 'تاريخ انتهاء العقد', ltr: true },
            { key: 'remaining_balance', label: 'الرصيد المتبقي', money: true },
            { key: 'upcoming_payment_amount', label: 'الدفعة القادمة خلال 90 يوماً', money: true }
        ], payload.leases || []);
        secLeases.id = 'secDetailLeases';
        secLeases.hidden = true;

        const secAssets = detailSection('الأصول والممتلكات التابعة للفرع', [
            { key: 'fixed_asset_number', label: 'رقم الأصل في النظام', ltr: true },
            { key: 'name', label: 'اسم ووصف الأصل' },
            { key: 'asset_location_name', label: 'الموقع' },
            { key: 'acquisition_date', label: 'تاريخ الشراء / الاقتناء', ltr: true },
            { key: 'acquisition_price', label: 'تكلفة الشراء', money: true },
            { key: 'net_book_value', label: 'القيمة الدفترية الصافية (NBV)', money: true }
        ], payload.assets || []);
        secAssets.id = 'secDetailAssets';
        secAssets.hidden = true;

        content.append(secAccounts, secLeases, secInvoices, secAssets);

        // Tab switching logic
        tabsNav.querySelectorAll('.finance-showroom-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                tabsNav.querySelectorAll('.finance-showroom-tab-btn').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                const target = btn.dataset.detailTab;
                secAccounts.hidden = target !== 'accounts';
                secLeases.hidden = target !== 'leases';
                secInvoices.hidden = target !== 'invoices';
                secAssets.hidden = target !== 'assets';
            });
        });

        const coverage = document.createElement('p');
        coverage.className = 'finance-showroom-coverage';
        coverage.textContent = payload.coverage?.note || 'تظهر فقط السجلات التي تحمل بُعد المعرض صراحة في Dynamics.';
        content.append(coverage);
    }

    async function openShowroomDetail(showroomNumber) {
        const drawer = element('financeShowroomDrawer');
        drawer.hidden = false;
        document.body.classList.add('finance-drawer-open');
        element('financeShowroomTitle').textContent = 'تفاصيل المعرض المالية';
        element('financeShowroomMeta').textContent = `Dynamics ${showroomNumber}`;
        element('financeShowroomContent').innerHTML =
            '<div class="finance-empty-state">جارٍ تحميل بطاقة الأداء المالي وقائمة الدخل ومصروفات المعرض…</div>';
        try {
            const params = { ...periodParams(), horizon_days: 90 };
            const [payload, pnl] = await Promise.all([
                window.FinancePlatformApi.showroomDetail(showroomNumber, params),
                window.FinancePlatformApi.showroomPnl(showroomNumber, params)
                    .catch(() => ({ state: 'unavailable' }))
            ]);
            renderShowroomDetail(payload, pnl);
        } catch (error) {
            console.error('Finance showroom detail failed:', error);
            element('financeShowroomContent').innerHTML =
                '<div class="finance-empty-state">تعذر تحميل تفاصيل المعرض. تحقق من الاتصال والصلاحية.</div>';
        }
    }

    function filterAndRenderShowrooms() {
        const body = element('financeShowroomsBody');
        const badge = element('financeShowroomsCountBadge');
        if (!body) return;

        let filtered = [...currentShowrooms];
        const search = (filters.showrooms.search || '').trim().toLowerCase();
        const status = filters.showrooms.status || 'all';

        if (status === 'current') {
            filtered = filtered.filter(s => s.status !== 'historical');
        } else if (status === 'historical') {
            filtered = filtered.filter(s => s.status === 'historical');
        }

        if (search) {
            filtered = filtered.filter(s => {
                const num = String(s.number || '').toLowerCase();
                const name = String(s.name || '').toLowerCase();
                const branch = String(s.branch_dimension || '').toLowerCase();
                return num.includes(search) || name.includes(search) || branch.includes(search);
            });
        }

        const state = sortState.showrooms;
        if (state) {
            filtered.sort((a, b) => compareValues(a, b, state.key, state.dir));
        }

        if (badge) {
            badge.textContent = `عرض ${integer.format(filtered.length)} من ${integer.format(currentShowrooms.length)} معرضاً`;
        }
        updateSortHeaders('showrooms');

        if (!filtered.length) {
            body.innerHTML = '<tr><td colspan="6" class="finance-empty-state">لا توجد معارض مطابقة لمعايير البحث.</td></tr>';
            return;
        }

        body.replaceChildren(...filtered.map(showroom => {
            const row = document.createElement('tr');
            const number = document.createElement('td');
            number.dir = 'ltr';
            number.textContent = showroom.number || '—';
            const name = document.createElement('td');
            name.className = 'fw-bold';
            name.textContent = showroom.name || '—';
            const branch = document.createElement('td');
            branch.dir = 'ltr';
            branch.className = 'finance-branch-link';
            const branchContent = document.createElement('span');
            branchContent.className = 'finance-branch-content';
            const branchCode = document.createElement('span');
            branchCode.textContent = showroom.branch_dimension || '—';
            const branchStatus = document.createElement('small');
            branchStatus.className = showroom.branch_dimension ? 'is-linked' : 'is-unlinked';
            branchStatus.textContent = showroom.branch_dimension ? 'مربوط' : 'غير مربوط';
            branchContent.append(branchCode, branchStatus);
            branch.append(branchContent);
            const statusCell = document.createElement('td');
            const statusLabel = document.createElement('span');
            statusLabel.className = `finance-status-label${showroom.status === 'historical' ? ' is-historical' : ''}`;
            statusLabel.textContent = showroom.status === 'historical' ? 'تاريخي / مغلق' : 'حالي';
            statusCell.append(statusLabel);
            const amount = document.createElement('td');
            amount.className = 'text-end fw-bold';
            amount.dir = 'ltr';
            amount.textContent = currentExpenseScopeStatus === 'approved'
                ? money.format(Number(showroom.non_sales_amount) || 0)
                : '—';
            const actionCell = document.createElement('td');
            actionCell.className = 'text-end';
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'finance-open-showroom';
            action.textContent = 'عرض التفاصيل';
            action.addEventListener('click', event => {
                event.stopPropagation();
                openShowroomDetail(showroom.number);
            });
            actionCell.append(action);
            row.dataset.showroomNumber = showroom.number || '';
            row.tabIndex = 0;
            row.addEventListener('click', () => openShowroomDetail(showroom.number));
            row.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openShowroomDetail(showroom.number);
                }
            });
            row.append(number, name, branch, statusCell, amount, actionCell);
            return row;
        }));
    }

    function renderShowrooms(payload, expenseScopeStatus) {
        if (!payload || !payload.configured) return;
        currentShowrooms = payload.data || [];
        if (expenseScopeStatus) currentExpenseScopeStatus = expenseScopeStatus;
        filterAndRenderShowrooms();
    }

    async function openInvoiceLinesModal(sourceKey, dataAreaId) {
        const modalEl = element('financeInvoiceLinesModal');
        if (!modalEl) return;
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        const headerEl = element('financeInvoiceLinesHeader');
        const bodyEl = element('financeInvoiceLinesBody');
        headerEl.textContent = 'جارٍ تحميل معلومات الفاتورة…';
        tableMessage(bodyEl, 5, 'جارٍ تحميل أسطر الفاتورة…');
        modal.show();
        try {
            const payload = await window.FinancePlatformApi.vendorInvoiceLines(sourceKey, {
                data_area_id: dataAreaId
            });
            if (payload.state !== 'ready' || !payload.header) {
                headerEl.replaceChildren(textElement(
                    'div',
                    payload.state === 'ambiguous_company'
                        ? 'رقم الفاتورة موجود في أكثر من شركة؛ يجب تحديد الشركة.'
                        : 'لم يتم العثور على الفاتورة.',
                    'alert alert-warning mb-0'
                ));
                tableMessage(bodyEl, 5, 'لا توجد أسطر متاحة.');
                return;
            }

            const h = payload.header;
            const reconciliation = payload.reconciliation || {};
            const wrapper = document.createElement('div');
            wrapper.className = 'd-flex justify-content-between align-items-start flex-wrap gap-2';
            const identity = document.createElement('div');
            identity.append(
                textElement('strong', `فاتورة: ${h.invoice_id || sourceKey}`, 'fs-6'),
                textElement(
                    'div',
                    `المورد: ${h.vendor_name || h.invoice_account} (${h.invoice_account || '—'})`,
                    'text-muted small'
                ),
                textElement('div', `الشركة: ${h.data_area_id || '—'}`, 'text-muted small')
            );
            const totals = document.createElement('div');
            totals.className = 'text-end';
            totals.append(
                textElement(
                    'div',
                    `الإجمالي: ${money.format(Number(h.invoice_amount) || 0)} ${h.currency_code || ''}`.trim(),
                    'fw-bold text-primary'
                ),
                textElement(
                    'div',
                    `مجموع الأسطر: ${money.format(Number(reconciliation.line_subtotal) || 0)} · ضريبة الفاتورة: ${money.format(Number(reconciliation.header_tax_total) || 0)}`,
                    'text-muted small'
                ),
                textElement(
                    'div',
                    `التاريخ: ${h.invoice_date || '—'} | الاستحقاق: ${h.due_date || '—'}`,
                    'text-muted small'
                )
            );
            wrapper.append(identity, totals);
            headerEl.replaceChildren(wrapper);
            if (!reconciliation.line_tax_matches_header) {
                headerEl.append(textElement(
                    'div',
                    'ضريبة رأس الفاتورة هي القيمة المعتمدة؛ توزيع الضريبة على الأسطر غير مكتمل في مصدر Dynamics.',
                    'alert alert-info py-2 px-3 mt-2 mb-0 small'
                ));
            }

            const lines = payload.data || [];
            if (!lines.length) {
                tableMessage(bodyEl, 5, 'لا توجد أسطر مسجلة في هذه الفاتورة.');
                return;
            }
            bodyEl.replaceChildren(...lines.map((line, idx) => {
                const row = document.createElement('tr');
                const indexCell = textElement('td', integer.format(idx + 1));
                const itemCell = document.createElement('td');
                itemCell.append(textElement(
                    'div',
                    line.description || line.item_number || '—',
                    'fw-bold'
                ));
                if (line.item_number) {
                    const itemNumber = textElement(
                        'small',
                        `رمز الصنف: ${line.item_number}`,
                        'text-muted'
                    );
                    itemNumber.dir = 'ltr';
                    itemCell.append(itemNumber);
                }
                const categoryCell = textElement('td', line.procurement_category || '—');
                const amountCell = textElement('td', money.format(Number(line.line_amount) || 0), 'text-end fw-bold');
                amountCell.dir = 'ltr';
                const taxCell = textElement(
                    'td',
                    Number(line.sales_tax_amount) ? money.format(Number(line.sales_tax_amount)) : '—',
                    'text-end text-muted'
                );
                taxCell.dir = 'ltr';
                row.append(indexCell, itemCell, categoryCell, amountCell, taxCell);
                return row;
            }));
        } catch (err) {
            console.error('Failed to load invoice lines:', err);
            headerEl.replaceChildren(textElement('div', 'تعذر تحميل تفاصيل الفاتورة.', 'alert alert-danger mb-0'));
            tableMessage(bodyEl, 5, 'حدث خطأ أثناء جلب البيانات.', 'text-center text-danger');
        }
    }

    async function loadCompleteVendorActivity(vendorAccount, dataAreaId) {
        const transactions = [];
        const settlements = [];
        let page = 1;
        let pages = 1;
        let firstPayload = null;
        do {
            const payload = await window.FinancePlatformApi.vendorPayments(vendorAccount, {
                data_area_id: dataAreaId,
                page,
                page_size: 200
            });
            if (payload.state !== 'ready') return payload;
            if (!firstPayload) firstPayload = payload;
            transactions.push(...(payload.transactions || []));
            settlements.push(...(payload.settlements || []));
            pages = Number(payload.pagination?.pages) || 1;
            page += 1;
        } while (page <= pages);

        return {
            ...firstPayload,
            transactions,
            settlements,
            pagination: {
                ...(firstPayload?.pagination || {}),
                page: pages,
                pages,
                returned: transactions.length
            },
            coverage: {
                ...(firstPayload?.coverage || {}),
                transactions_returned: transactions.length,
                settlements_returned: settlements.length,
                complete: transactions.length === Number(firstPayload?.pagination?.total || 0)
                    && settlements.length === Number(firstPayload?.coverage?.settlement_total || 0)
            }
        };
    }

    async function openVendorPaymentsModal(vendorAccount, dataAreaId) {
        const modalEl = element('financeVendorPaymentsModal');
        if (!modalEl) return;
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        const headerEl = element('financeVendorPaymentsHeader');
        const bodyEl = element('financeVendorPaymentsBody');
        const settlementsBodyEl = element('financeVendorSettlementsBody');
        headerEl.textContent = 'جارٍ تحميل كامل حركات المورد…';
        tableMessage(bodyEl, 8, 'جارٍ تحميل الحركات…');
        tableMessage(settlementsBodyEl, 3, 'جارٍ تحميل التسويات المحاسبية…');
        modal.show();
        try {
            const payload = await loadCompleteVendorActivity(vendorAccount, dataAreaId);
            if (payload.state !== 'ready') {
                headerEl.replaceChildren(textElement(
                    'div',
                    payload.state === 'ambiguous_company'
                        ? 'حساب المورد موجود في أكثر من شركة؛ يجب تحديد الشركة.'
                        : 'لم يتم العثور على حساب المورد.',
                    'alert alert-warning mb-0'
                ));
                tableMessage(bodyEl, 8, 'لا توجد حركات متاحة.');
                tableMessage(settlementsBodyEl, 3, 'لا توجد تسويات محاسبية متاحة.');
                return;
            }

            const vendor = payload.vendor || {};
            const coverage = payload.coverage || {};
            const header = document.createElement('div');
            header.append(
                textElement('strong', vendor.vendor_name || vendorAccount, 'fs-6 d-block'),
                textElement(
                    'div',
                    `رقم الحساب: ${vendor.vendor_account_number || vendorAccount}${vendor.payment_terms ? ` | شروط الدفع: ${vendor.payment_terms}` : ''}`,
                    'text-muted small'
                ),
                textElement('div', `الشركة: ${vendor.data_area_id || dataAreaId || '—'}`, 'text-muted small'),
                textElement(
                    'div',
                    `تم تحميل ${integer.format(coverage.transactions_returned || 0)} من ${integer.format(coverage.transaction_total || 0)} حركة و${integer.format(coverage.settlements_returned || 0)} من ${integer.format(coverage.settlement_total || 0)} تسوية محاسبية.`,
                    coverage.complete ? 'text-success small mt-1' : 'text-danger small mt-1'
                )
            );
            headerEl.replaceChildren(header);

            const transactions = payload.transactions || [];
            if (!transactions.length) {
                tableMessage(bodyEl, 8, 'لا توجد حركات مسجلة لهذا المورد.');
            } else {
                bodyEl.replaceChildren(...transactions.map(transaction => {
                    const row = document.createElement('tr');
                    const values = [
                        transaction.voucher || '—',
                        transaction.invoice_id || '—',
                        transaction.transaction_date || '—',
                        transaction.due_date || '—',
                        money.format(Number(transaction.transaction_amount) || 0),
                        money.format(Number(transaction.settled_amount) || 0),
                        money.format(Number(transaction.remaining_amount) || 0)
                    ];
                    values.forEach((value, index) => {
                        const classNames = index === 0
                            ? 'fw-bold'
                            : index === 4
                                ? 'text-end fw-bold'
                                : index === 5
                                    ? 'text-end text-success'
                                    : index === 6
                                        ? 'text-end text-danger'
                                        : '';
                        const cell = textElement('td', value, classNames);
                        cell.dir = 'ltr';
                        row.append(cell);
                    });
                    const statusCell = document.createElement('td');
                    statusCell.append(textElement(
                        'span',
                        transaction.is_closed ? 'مغلقة' : 'مفتوحة',
                        `badge ${transaction.is_closed ? 'bg-secondary' : 'bg-warning text-dark'}`
                    ));
                    row.append(statusCell);
                    return row;
                }));
            }

            const settlements = payload.settlements || [];
            if (!settlements.length) {
                tableMessage(settlementsBodyEl, 3, 'لا توجد تسويات محاسبية مسجلة لهذا المورد.');
            } else {
                settlementsBodyEl.replaceChildren(...settlements.map(settlement => {
                    const row = document.createElement('tr');
                    const voucher = textElement('td', settlement.settlement_voucher || '—', 'fw-bold');
                    const date = textElement('td', settlement.settlement_date || '—');
                    const amount = textElement(
                        'td',
                        money.format(Number(settlement.settlement_amount) || 0),
                        'text-end fw-bold text-success'
                    );
                    voucher.dir = 'ltr';
                    date.dir = 'ltr';
                    amount.dir = 'ltr';
                    row.append(voucher, date, amount);
                    return row;
                }));
            }
        } catch (err) {
            console.error('Failed to load vendor activity:', err);
            headerEl.replaceChildren(textElement('div', 'تعذر تحميل تفاصيل حركات المورد.', 'alert alert-danger mb-0'));
            tableMessage(bodyEl, 8, 'حدث خطأ أثناء جلب البيانات.', 'text-center text-danger');
            tableMessage(settlementsBodyEl, 3, 'حدث خطأ.', 'text-center text-danger');
        }
    }

    function filterAndRenderInvoices() {
        const body = element('financeVendorInvoicesBody');
        const badge = element('financeInvoicesCountBadge');
        if (!body) return;

        let filtered = [...currentInvoices];
        const search = (filters.invoices.search || '').trim().toLowerCase();
        const status = filters.invoices.status || 'all';
        const todayStr = isoDate(new Date());

        if (status === 'overdue') {
            filtered = filtered.filter(inv => inv.due_date && inv.due_date < todayStr);
        } else if (status === 'not_due') {
            filtered = filtered.filter(inv => !inv.due_date || inv.due_date >= todayStr);
        } else if (status === 'has_po') {
            filtered = filtered.filter(inv => inv.purchase_order_number && String(inv.purchase_order_number).trim() !== '');
        }

        if (search) {
            filtered = filtered.filter(inv => {
                const id = String(inv.invoice_id || '').toLowerCase();
                const vName = String(inv.vendor_name || '').toLowerCase();
                const vAcc = String(inv.invoice_account || '').toLowerCase();
                const po = String(inv.purchase_order_number || '').toLowerCase();
                const desc = String(inv.description || '').toLowerCase();
                return id.includes(search) || vName.includes(search) || vAcc.includes(search) || po.includes(search) || desc.includes(search);
            });
        }

        const state = sortState.invoices;
        if (state) {
            filtered.sort((a, b) => compareValues(a, b, state.key, state.dir));
        }

        const totalAmount = filtered.reduce((acc, inv) => acc + (Number(inv.invoice_amount) || 0), 0);
        if (badge) {
            badge.textContent = `عرض ${integer.format(filtered.length)} فاتورة · ${money.format(totalAmount)} SAR`;
        }
        updateSortHeaders('invoices');

        if (!filtered.length) {
            body.innerHTML = '<tr><td colspan="7" class="finance-empty-state">لا توجد فواتير مطابقة لمعايير البحث.</td></tr>';
            return;
        }

        body.replaceChildren(...filtered.map(invoice => {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.title = invoice.description
                ? `فاتورة ${invoice.invoice_id}: ${invoice.description} (انقر للتفاصيل)`
                : 'انقر لعرض أسطر الفاتورة التفصيلية';

            const invoiceCell = document.createElement('td');
            const invoiceBadge = document.createElement('span');
            invoiceBadge.className = 'finance-invoice-badge';
            invoiceBadge.textContent = invoice.invoice_id || '—';
            invoiceBadge.dir = 'ltr';
            invoiceCell.append(invoiceBadge);

            const vendorCell = document.createElement('td');
            const vendorIdentity = document.createElement('div');
            vendorIdentity.className = 'finance-vendor-identity';
            const vendorName = document.createElement('strong');
            const vendorAccount = String(invoice.invoice_account || '').trim();
            const resolvedVendorName = String(invoice.vendor_name || '').trim();
            const hasVendorName = resolvedVendorName && resolvedVendorName !== vendorAccount;
            vendorName.textContent = hasVendorName ? resolvedVendorName : 'اسم المورد غير متاح';
            if (!hasVendorName) vendorIdentity.classList.add('is-name-missing');
            const vendorMeta = document.createElement('span');
            vendorMeta.className = 'finance-vendor-meta';
            const vendorDetails = [vendorAccount, invoice.payment_terms].filter(Boolean);
            vendorMeta.textContent = vendorDetails.join(' · ') || '—';
            vendorMeta.dir = 'ltr';
            vendorIdentity.append(vendorName, vendorMeta);
            vendorCell.append(vendorIdentity);

            const descCell = document.createElement('td');
            if (invoice.description) {
                const descText = document.createElement('div');
                descText.className = 'finance-invoice-desc';
                descText.textContent = invoice.description;
                descText.title = invoice.description;
                descCell.append(descText);
            } else {
                const emptySpan = document.createElement('span');
                emptySpan.className = 'text-muted small';
                emptySpan.textContent = '—';
                descCell.append(emptySpan);
            }

            const purchaseOrderCell = document.createElement('td');
            purchaseOrderCell.textContent = invoice.purchase_order_number || '—';
            purchaseOrderCell.dir = 'ltr';

            const dateCell = document.createElement('td');
            dateCell.textContent = invoice.invoice_date || '—';
            dateCell.dir = 'ltr';

            const dueDateCell = document.createElement('td');
            const dueDateText = document.createElement('span');
            dueDateText.textContent = invoice.due_date || '—';
            dueDateText.dir = 'ltr';
            dueDateCell.append(dueDateText);

            if (invoice.due_date) {
                const dueDate = new Date(invoice.due_date);
                const today = new Date(todayStr);
                const diffDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));
                const badge = document.createElement('span');
                badge.className = 'finance-due-badge';
                if (diffDays < 0) {
                    badge.classList.add('is-overdue');
                    badge.textContent = `متأخرة ${Math.abs(diffDays)} يوماً`;
                } else if (diffDays === 0) {
                    badge.classList.add('is-today');
                    badge.textContent = 'تستحق اليوم';
                } else {
                    badge.classList.add('is-ok');
                    badge.textContent = `متبقي ${diffDays} يوماً`;
                }
                dueDateCell.append(document.createElement('br'), badge);
            }

            const amountCell = document.createElement('td');
            amountCell.className = 'text-end';
            const amountValue = document.createElement('strong');
            amountValue.textContent = money.format(Number(invoice.invoice_amount) || 0);
            const amountMeta = document.createElement('span');
            amountMeta.className = 'finance-vendor-meta finance-invoice-amount-meta';
            const taxAmount = Number(invoice.sales_tax_amount) || 0;
            const amountDetails = [
                invoice.currency_code || null,
                taxAmount ? `ضريبة ${money.format(taxAmount)}` : null
            ].filter(Boolean);
            amountMeta.textContent = amountDetails.join(' · ');
            amountMeta.dir = 'ltr';
            amountCell.append(amountValue);
            if (amountDetails.length) amountCell.append(amountMeta);

            row.append(
                invoiceCell,
                vendorCell,
                descCell,
                purchaseOrderCell,
                dateCell,
                dueDateCell,
                amountCell
            );
            row.addEventListener('click', () => openInvoiceLinesModal(
                invoice.source_key,
                invoice.data_area_id
            ));
            return row;
        }));
    }

    function renderVendorInvoices(payload) {
        if (!payload?.configured) return;
        currentInvoices = payload.data || [];
        filterAndRenderInvoices();
    }

    function sortAndRenderLeases() {
        const body = element('financeLeasesBody');
        if (!body) return;
        let list = [...currentLeases];
        const state = sortState.leases;
        if (state) {
            list.sort((a, b) => compareValues(a, b, state.key, state.dir));
        }
        updateSortHeaders('leases');

        if (!list.length) {
            body.innerHTML = '<tr><td colspan="5" class="finance-empty-state">لا توجد عقود إيجار مستوردة.</td></tr>';
            return;
        }

        const today = new Date();
        const in90Days = new Date();
        in90Days.setDate(today.getDate() + 90);
        const todayStr = isoDate(today);
        const in90DaysStr = isoDate(in90Days);

        body.replaceChildren(...list.slice(0, 50).map(lease => {
            const row = document.createElement('tr');
            
            const idCell = document.createElement('td');
            idCell.dir = 'ltr';
            idCell.textContent = lease.lease_id || '—';

            const descCell = document.createElement('td');
            descCell.textContent = lease.description || '—';

            const expCell = document.createElement('td');
            const expDateText = document.createElement('span');
            expDateText.textContent = lease.expiration_date || '—';
            expDateText.dir = 'ltr';
            expCell.append(expDateText);
            if (lease.expiration_date && lease.expiration_date >= todayStr && lease.expiration_date <= in90DaysStr) {
                const badge = document.createElement('span');
                badge.className = 'finance-lease-badge is-expiring ms-2';
                badge.textContent = 'ينتهي قريباً';
                expCell.append(badge);
            }

            const statusCell = document.createElement('td');
            statusCell.textContent = lease.lease_status || '—';

            const upcomingCell = document.createElement('td');
            upcomingCell.className = 'text-end fw-bold';
            upcomingCell.textContent = money.format(Number(lease.upcoming_payment_amount) || 0);

            row.append(idCell, descCell, expCell, statusCell, upcomingCell);
            return row;
        }));
    }

    function renderLeases(payload) {
        if (!payload?.configured) return;
        currentLeases = payload.data || [];
        sortAndRenderLeases();
    }

    function filterAndRenderAssets() {
        const body = element('financeAssetsBody');
        if (!body) return;

        let list = [...currentAssets];
        const search = (filters.assets?.search || '').toLowerCase().trim();
        const group = filters.assets?.group || 'all';
        const scope = filters.assets?.scope || 'all';

        if (group && group !== 'all') {
            list = list.filter(a => a.fixed_asset_group_id === group);
        }

        if (scope === 'mapped') {
            list = list.filter(a => !!a.showroom_number);
        } else if (scope === 'general') {
            list = list.filter(a => !a.showroom_number);
        }

        if (search) {
            list = list.filter(a =>
                (a.fixed_asset_number || '').toLowerCase().includes(search) ||
                (a.asset_name || '').toLowerCase().includes(search) ||
                (a.fixed_asset_group_id || '').toLowerCase().includes(search) ||
                (a.asset_location_name || '').toLowerCase().includes(search) ||
                (a.showroom_name || '').toLowerCase().includes(search) ||
                (a.showroom_number || '').toLowerCase().includes(search)
            );
        }

        const badge = element('financeAssetsCountBadge');
        if (badge) {
            badge.textContent = `${list.length} أصلاً`;
        }

        const sort = sortState.assets;
        if (sort && sort.key) {
            list.sort((a, b) => {
                let valA = a[sort.key] ?? '';
                let valB = b[sort.key] ?? '';
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sort.dir === 'asc' ? valA - valB : valB - valA;
                }
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
                return sort.dir === 'asc' ? valA.localeCompare(valB, 'ar') : valB.localeCompare(valA, 'ar');
            });
        }

        if (!list.length) {
            body.innerHTML = '<tr><td colspan="8" class="finance-empty-state">لا توجد أصول مطابقة للبحث أو الفلتر.</td></tr>';
            return;
        }

        body.replaceChildren(...list.map(asset => {
            const row = document.createElement('tr');

            const idCell = document.createElement('td');
            const idBadge = document.createElement('span');
            idBadge.className = 'finance-invoice-badge';
            idBadge.textContent = asset.fixed_asset_number || '—';
            idCell.append(idBadge);

            const nameCell = document.createElement('td');
            nameCell.className = 'fw-bold';
            nameCell.textContent = asset.asset_name || '—';

            const groupCell = document.createElement('td');
            const groupBadge = document.createElement('span');
            groupBadge.className = 'badge bg-light text-dark border';
            groupBadge.textContent = asset.fixed_asset_group_id || '—';
            groupCell.append(groupBadge);

            const locationCell = document.createElement('td');
            if (asset.showroom_name) {
                const storeIcon = document.createElement('i');
                storeIcon.className = 'fa-solid fa-store text-warning me-1';
                locationCell.append(storeIcon, document.createTextNode(asset.showroom_name));
            } else {
                const locIcon = document.createElement('i');
                locIcon.className = 'fa-solid fa-building text-muted me-1';
                locationCell.append(locIcon, document.createTextNode(asset.asset_location_name || 'عام / إدارة'));
            }

            const dateCell = document.createElement('td');
            dateCell.dir = 'ltr';
            dateCell.textContent = asset.acquisition_date || '—';

            const costCell = document.createElement('td');
            costCell.className = 'text-end';
            costCell.dir = 'ltr';
            costCell.textContent = money.format(Number(asset.acquisition_cost) || 0);

            const depCell = document.createElement('td');
            depCell.className = 'text-end text-muted';
            depCell.dir = 'ltr';
            depCell.textContent = money.format(Number(asset.depreciation_movement) || 0);

            const nbvCell = document.createElement('td');
            nbvCell.className = 'text-end fw-bold text-success';
            nbvCell.dir = 'ltr';
            nbvCell.textContent = money.format(Number(asset.net_book_value) || 0);

            row.append(idCell, nameCell, groupCell, locationCell, dateCell, costCell, depCell, nbvCell);
            return row;
        }));
    }

    function renderFixedAssets(payload) {
        if (!payload || payload.state !== 'ready') return;
        currentAssets = payload.data || [];
        if (payload.summary?.total_count) {
            setMetric('financeAssetsTotalCount', payload.summary.total_count);
        }
        if (payload.summary?.mapped_count !== undefined) {
            setMetric('financeAssetsLinkedCount', `${payload.summary.mapped_count} أصل`);
        }
        if (payload.summary?.general_count !== undefined) {
            setMetric('financeAssetsGeneralCount', `${payload.summary.general_count} أصل`);
        }
        filterAndRenderAssets();
    }

    let advancesCategory = 'loans'; // 'loans' | 'expenses' | 'all'

    function isAdvanceAccount(accId) {
        if (!accId) return false;
        const str = String(accId).trim();
        return str.startsWith('151') || ['151102', '151101'].includes(str);
    }

    function isExpenseAccount(accId) {
        if (!accId) return false;
        const str = String(accId).trim();
        return str.startsWith('52') || str.startsWith('56') || [
            '523004', '523101', '523102', '524101', '524102', '524104', '523002', '560030', '560029', '560021'
        ].includes(str);
    }

    function updateAdvancesAccountFilterOptions(category) {
        const select = element('financeAdvancesAccountFilter');
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '';

        if (category === 'loans') {
            select.innerHTML = `
                <option value="all">جميع حسابات السلف والعهد</option>
                <option value="151102">151102 - قروض وسلف الموظفين (ذمة شخصية)</option>
                <option value="151101">151101 - عهد الموظفين النقدية والمؤقتة</option>
            `;
        } else if (category === 'expenses') {
            select.innerHTML = `
                <option value="all">جميع بنود المصاريف التشغيلية</option>
                <optgroup label="── مصاريف ومنافع وبدلات الموظفين (52xxxx) ──">
                    <option value="523004">523004 - تذاكر سفر الإجازة السنوية</option>
                    <option value="523101">523101 - رحلات ومهمات العمل الداخلية</option>
                    <option value="523102">523102 - رحلات ومهمات العمل الخارجية</option>
                    <option value="524101">524101 - تأشيرات الخروج والعودة</option>
                    <option value="524102">524102 - تصاريح وتراخيص العمل</option>
                    <option value="524104">524104 - رسوم تصاريح الإقامة</option>
                    <option value="523002">523002 - إضافي ومكافآت الموظفين</option>
                </optgroup>
                <optgroup label="── مصاريف المحروقات وصيانة السيارات (56xxxx) ──">
                    <option value="560030">560030 - وقود وبنزين سيارات المستودع والمعارض</option>
                    <option value="560029">560029 - صيانة سيارات المستودع والمعارض</option>
                </optgroup>
            `;
        } else {
            select.innerHTML = `
                <option value="all">جميع الحسابات والبنود المفتوحة</option>
                <optgroup label="── حسابات السلف والعهد (أصول / ذمم مدينة 151xxx) ──">
                    <option value="151102">151102 - قروض وسلف الموظفين</option>
                    <option value="151101">151101 - عهد الموظفين النقدية والمؤقتة</option>
                </optgroup>
                <optgroup label="── مصاريف وبدلات ومنافع الموظفين (52xxxx) ──">
                    <option value="523004">523004 - تذاكر سفر الإجازة السنوية</option>
                    <option value="523101">523101 - رحلات ومهمات العمل الداخلية</option>
                    <option value="523102">523102 - رحلات ومهمات العمل الخارجية</option>
                    <option value="524101">524101 - تأشيرات الخروج والعودة</option>
                    <option value="524102">524102 - تصاريح وتراخيص العمل</option>
                    <option value="524104">524104 - رسوم تصاريح الإقامة</option>
                    <option value="523002">523002 - إضافي ومكافآت الموظفين</option>
                </optgroup>
                <optgroup label="── مصاريف السيارات والتشغيل (56xxxx) ──">
                    <option value="560030">560030 - وقود وبنزين سيارات المستودع والمعارض</option>
                    <option value="560029">560029 - صيانة سيارات المستودع</option>
                </optgroup>
            `;
        }

        const exists = Array.from(select.options).some(o => o.value === currentVal);
        select.value = exists ? currentVal : 'all';
        if (filters.advances) filters.advances.account = select.value;
    }

    function updateAdvancesCategoryUi(category) {
        advancesCategory = category;
        const loansBtn = element('financeAdvCategoryLoansBtn');
        const expBtn = element('financeAdvCategoryExpensesBtn');
        const allBtn = element('financeAdvCategoryAllBtn');
        const activeLabel = element('financeAdvActiveCategoryLabel');

        [loansBtn, expBtn, allBtn].forEach(b => {
            if (b) {
                b.classList.remove('btn-primary', 'active', 'text-white');
                b.classList.add('btn-outline-secondary');
            }
        });

        if (category === 'loans' && loansBtn) {
            loansBtn.classList.remove('btn-outline-secondary');
            loansBtn.classList.add('btn-primary', 'active', 'text-white');
            if (activeLabel) activeLabel.innerHTML = '<i class="fa-solid fa-filter me-1 text-primary"></i> العرض النشط: السلف والعهد (أصول وذمم مدينة)';
        } else if (category === 'expenses' && expBtn) {
            expBtn.classList.remove('btn-outline-secondary');
            expBtn.classList.add('btn-primary', 'active', 'text-white');
            if (activeLabel) activeLabel.innerHTML = '<i class="fa-solid fa-filter me-1 text-warning"></i> العرض النشط: المصاريف والمنافع والسيارات (مصروفات P&L)';
        } else if (category === 'all' && allBtn) {
            allBtn.classList.remove('btn-outline-secondary');
            allBtn.classList.add('btn-primary', 'active', 'text-white');
            if (activeLabel) activeLabel.innerHTML = '<i class="fa-solid fa-filter me-1 text-secondary"></i> العرض النشط: عرض شامل مجمع (سلف + مصاريف)';
        }

        const kickerEl = element('financeAdvancesSectionKicker');
        const titleEl = element('financeAdvancesSectionTitle');
        const noticeEl = element('financeAdvancesNoticeText');
        const noticeIcon = element('financeAdvancesNoticeIcon');
        const noticeBanner = element('financeAdvancesNoticeBanner');

        if (category === 'loans') {
            if (kickerEl) kickerEl.textContent = 'EMPLOYEE ADVANCES, LOANS & CUSTODIES (GL)';
            if (titleEl) titleEl.textContent = 'سجل سلف وقروض وعهد الموظفين من دفتر الأستاذ';
            if (noticeEl) {
                noticeEl.innerHTML = '<strong>💼 طبيعة محاسبية:</strong> الأرصدة المعروضة تمثل <strong>سلف وقروض وعهد الموظفين (حسابات 151xxx)</strong> المستخرجة من دفتر الأستاذ في Dynamics 365، وتُعامل كأصول وذمم مدينة مستحقة الاسترداد أو الاستقطاع من مسيرات الرواتب الشهرية وتسويات العهد.';
            }
            if (noticeIcon) noticeIcon.className = 'fa-solid fa-hand-holding-dollar me-2 fs-5 text-primary';
            if (noticeBanner) {
                noticeBanner.style.background = '#f0f7ff';
                noticeBanner.style.borderColor = '#bae0ff';
                noticeBanner.style.color = '#0958d9';
            }
        } else if (category === 'expenses') {
            if (kickerEl) kickerEl.textContent = 'EMPLOYEE & VEHICLE EXPENSES (P&L)';
            if (titleEl) titleEl.textContent = 'سجل مصاريف ومنافع وبدلات الموظفين والسيارات';
            if (noticeEl) {
                noticeEl.innerHTML = '<strong>🧾 طبيعة محاسبية:</strong> هذه البنود تمثل <strong>مصاريف تشغيلية وإدارية</strong> تتحملها الشركة وتُسجل في قائمة الدخل (حسابات 52xxxx و 56xxxx) كالإقامات وتذاكر السفر وصيانة وبنزين السيارات، <strong>وليست سلفاً أو ديوناً مستردة من الموظفين</strong>.';
            }
            if (noticeIcon) noticeIcon.className = 'fa-solid fa-receipt me-2 fs-5 text-warning';
            if (noticeBanner) {
                noticeBanner.style.background = '#fffbe6';
                noticeBanner.style.borderColor = '#ffe58f';
                noticeBanner.style.color = '#d46b08';
            }
        } else {
            if (kickerEl) kickerEl.textContent = 'EMPLOYEE LEDGER TRANSACTIONS (ADVANCES & EXPENSES)';
            if (titleEl) titleEl.textContent = 'سجل قيود ومصروفات الموظفين الشامل من دفتر الأستاذ';
            if (noticeEl) {
                noticeEl.innerHTML = '<strong>📊 عرض شامل:</strong> يعرض هذا السجل كافة القيود المسجلة بأرقام الموظفين، مع تمييز دقيق بين السلف والعهد (ذمم مستردة) والمصاريف التشغيلية (تكلفة على الشركة).';
            }
            if (noticeIcon) noticeIcon.className = 'fa-solid fa-circle-info me-2 fs-5 text-secondary';
            if (noticeBanner) {
                noticeBanner.style.background = '#f8f9fa';
                noticeBanner.style.borderColor = '#dee2e6';
                noticeBanner.style.color = '#495057';
            }
        }

        updateAdvancesAccountFilterOptions(category);
        updateAdvancesKpiStats(category);
        filterAndRenderAdvances();
    }

    function updateAdvancesKpiStats(category) {
        const card1Title = element('financeAdvancesCard1Title');
        const card1Sub = element('financeAdvancesCard1Sub');
        const card2Title = element('financeAdvancesCard2Title');
        const card2Sub = element('financeAdvancesCard2Sub');
        const card3Title = element('financeAdvancesCard3Title');
        const card3Sub = element('financeAdvancesCard3Sub');
        const card4Title = element('financeAdvancesCard4Title');

        const loanItems = currentAdvances.filter(a => isAdvanceAccount(a.main_account_id));
        const expItems = currentAdvances.filter(a => isExpenseAccount(a.main_account_id));

        const loansCountBadge = element('financeAdvLoansCountBadge');
        const expCountBadge = element('financeAdvExpensesCountBadge');
        if (loansCountBadge) loansCountBadge.textContent = new Set(loanItems.map(i => i.worker_id)).size;
        if (expCountBadge) expCountBadge.textContent = new Set(expItems.map(i => i.worker_id)).size;

        if (category === 'loans') {
            if (card1Title) card1Title.textContent = 'إجمالي السلف والعهد المنصرفة (المدين)';
            if (card1Sub) card1Sub.textContent = 'مبالغ القروض والسلف المنصرفة (151xxx)';
            if (card2Title) card2Title.textContent = 'إجمالي المستقطع والمسدد (الدائن)';
            if (card2Sub) card2Sub.textContent = 'تم تحصيله واقتطاعه من مسيرات الرواتب';
            if (card3Title) card3Title.textContent = 'رصيد السلف القائم للتحصيل (GL)';
            if (card3Sub) card3Sub.textContent = 'الصافي المتبقي ذمة على الموظفين';
            if (card4Title) card4Title.textContent = 'الموظفون ذوو السلف القائمة';

            const debit = loanItems.reduce((acc, i) => acc + Number(i.total_debit || 0), 0);
            const credit = loanItems.reduce((acc, i) => acc + Number(i.total_credit || 0), 0);
            const glBal = debit - credit;
            const activeEmps = loanItems.filter(i => (Number(i.total_debit || 0) - Number(i.total_credit || 0)) > 0).length;
            const settledEmps = loanItems.filter(i => (Number(i.total_debit || 0) - Number(i.total_credit || 0)) <= 0).length;

            setMetric('financeAdvancesTotalDebit', money.format(debit));
            setMetric('financeAdvancesTotalCredit', money.format(credit));
            setMetric('financeAdvancesTotalGlBalance', money.format(glBal));
            setMetric('financeAdvancesActiveCount', `${integer.format(activeEmps)} موظف`);
            setMetric('financeAdvancesSettledCount', `${integer.format(settledEmps)} رصيد مسدد/مغطى`);
        } else if (category === 'expenses') {
            if (card1Title) card1Title.textContent = 'إجمالي المصاريف التشغيلية (المدين)';
            if (card1Sub) card1Sub.textContent = 'إجمالي تكاليف الموظفين والسيارات';
            if (card2Title) card2Title.textContent = 'مصاريف ومنافع الموظفين (52xxxx)';
            if (card2Sub) card2Sub.textContent = 'إقامات، تذاكر، تأشيرات، مهمات ومكافآت';
            if (card3Title) card3Title.textContent = 'مصاريف وقود وصيانة السيارات (56xxxx)';
            if (card3Sub) card3Sub.textContent = 'بنزين، صيانة وتأمين سيارات العمل';
            if (card4Title) card4Title.textContent = 'الموظفون والعمليات المستفيدة';

            const totalExp = expItems.reduce((acc, i) => acc + Number(i.total_debit || 0), 0);
            const empExp = expItems.filter(i => String(i.main_account_id).startsWith('52')).reduce((acc, i) => acc + Number(i.total_debit || 0), 0);
            const vehExp = expItems.filter(i => String(i.main_account_id).startsWith('56')).reduce((acc, i) => acc + Number(i.total_debit || 0), 0);
            const uniqueBeneficiaries = new Set(expItems.map(i => i.worker_id)).size;

            setMetric('financeAdvancesTotalDebit', money.format(totalExp));
            setMetric('financeAdvancesTotalCredit', money.format(empExp));
            setMetric('financeAdvancesTotalGlBalance', money.format(vehExp));
            setMetric('financeAdvancesActiveCount', `${integer.format(uniqueBeneficiaries)} مستفيد`);
            setMetric('financeAdvancesSettledCount', `${integer.format(expItems.length)} قيد مصروف مسجل`);
        } else {
            if (card1Title) card1Title.textContent = 'إجمالي مبالغ الصرف (المدين)';
            if (card1Sub) card1Sub.textContent = 'سلف وقروض + مصاريف تشغيلية';
            if (card2Title) card2Title.textContent = 'إجمالي المسدد والمستقطع (الدائن)';
            if (card2Sub) card2Sub.textContent = 'اقتطاعات مسيرات الرواتب وتسويات العهد';
            if (card3Title) card3Title.textContent = 'رصيد السلف الفعلي (GL Balance)';
            if (card3Sub) card3Sub.textContent = 'صافي ذمم السلف والقروض فقط (151xxx)';
            if (card4Title) card4Title.textContent = 'إجمالي الموظفين والمسجلين';

            const totalDebit = currentAdvances.reduce((acc, i) => acc + Number(i.total_debit || 0), 0);
            const totalCredit = currentAdvances.reduce((acc, i) => acc + Number(i.total_credit || 0), 0);
            const actualLoanBal = loanItems.reduce((acc, i) => acc + (Number(i.total_debit || 0) - Number(i.total_credit || 0)), 0);
            const totalEmps = new Set(currentAdvances.map(i => i.worker_id)).size;

            setMetric('financeAdvancesTotalDebit', money.format(totalDebit));
            setMetric('financeAdvancesTotalCredit', money.format(totalCredit));
            setMetric('financeAdvancesTotalGlBalance', money.format(actualLoanBal));
            setMetric('financeAdvancesActiveCount', `${integer.format(totalEmps)} موظف`);
            setMetric('financeAdvancesSettledCount', `${integer.format(currentAdvances.length)} حركة مسجلة`);
        }
    }

    async function openEmployeeAdvanceDetailsModal(workerId) {
        const modalEl = element('financeAdvanceDetailsModal');
        if (!modalEl) return;
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        const nameEl = element('financeAdvanceModalWorkerName');
        const summaryEl = element('financeAdvanceModalSummary');
        const tabsContainer = element('financeAdvanceModalTabsContainer');
        const linesBodyEl = element('financeAdvanceModalLinesBody');
        const countBadgeEl = element('financeAdvanceModalLinesCount');

        nameEl.textContent = `تفاصيل حركات الموظف: ${workerId}`;
        summaryEl.innerHTML = '<div class="text-muted text-center py-3"><div class="spinner-border spinner-border-sm text-primary me-2"></div>جارٍ تحميل كشف الحساب والبيانات المحاسبية…</div>';
        if (tabsContainer) tabsContainer.innerHTML = '';
        linesBodyEl.innerHTML = '<tr><td colspan="7" class="finance-empty-state">جارٍ تحميل الحركات…</td></tr>';
        if (countBadgeEl) countBadgeEl.textContent = '0 حركة';
        modal.show();

        try {
            const payload = await window.FinancePlatformApi.employeeAdvanceDetails(workerId);
            if (payload.state !== 'ready') {
                summaryEl.innerHTML = '<div class="alert alert-warning mb-0">لم يتم العثور على حركات مسجلة لهذا الموظف.</div>';
                linesBodyEl.innerHTML = '<tr><td colspan="7" class="finance-empty-state">لا توجد حركات.</td></tr>';
                return;
            }

            const bal = payload.balance || {};
            const allLines = payload.lines || [];
            nameEl.textContent = `${bal.employee_name_arabic || 'الموظف'} (${bal.worker_id})`;

            const distinctAccounts = [];
            const accountsSeen = new Set();
            for (const l of allLines) {
                const acc = l.main_account_id;
                if (acc && !accountsSeen.has(acc)) {
                    accountsSeen.add(acc);
                    distinctAccounts.push(acc);
                }
            }

            const hasLoanLines = allLines.some(l => isAdvanceAccount(l.main_account_id));
            const hasExpLines = allLines.some(l => isExpenseAccount(l.main_account_id));

            function updateSummaryCards(filteredLines, labelPrefix, isExpenseMode) {
                const tabDebit = filteredLines.reduce((acc, l) => acc + Number(l.debit_amount || 0), 0);
                const tabCredit = filteredLines.reduce((acc, l) => acc + Number(l.credit_amount || 0), 0);
                const tabBalance = tabDebit - tabCredit;

                if (isExpenseMode) {
                    summaryEl.innerHTML = `
                        <div class="row g-2 mb-3">
                            <div class="col-md-6">
                                <div class="p-3 border rounded-3 bg-white shadow-sm border-start border-4 border-warning">
                                    <span class="text-muted small d-block mb-1">إجمالي المصروفات المنصرفة (تكلفة على الشركة)${labelPrefix ? ` - ${labelPrefix}` : ''}</span>
                                    <strong class="fs-5 text-dark">${money.format(tabDebit)}</strong>
                                    <span class="badge bg-warning bg-opacity-10 text-warning ms-2">مصروف P&L</span>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="p-3 border rounded-3 bg-white shadow-sm border-start border-4 border-secondary">
                                    <span class="text-muted small d-block mb-1">عدد قيود المصروف المسجلة</span>
                                    <strong class="fs-5 text-secondary">${integer.format(filteredLines.length)} قيد</strong>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    summaryEl.innerHTML = `
                        <div class="row g-2 mb-3">
                            <div class="col-md-4">
                                <div class="p-3 border rounded-3 bg-white shadow-sm border-start border-4 border-primary">
                                    <span class="text-muted small d-block mb-1">إجمالي السلف والمنصرف (مدين)${labelPrefix ? ` - ${labelPrefix}` : ''}</span>
                                    <strong class="fs-5 text-dark">${money.format(tabDebit)}</strong>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="p-3 border rounded-3 bg-white shadow-sm border-start border-4 border-success">
                                    <span class="text-muted small d-block mb-1">إجمالي المستقطع / المسدد (دائن)</span>
                                    <strong class="fs-5 text-success">${money.format(tabCredit)}</strong>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="p-3 border rounded-3 bg-white shadow-sm border-start border-4 ${tabBalance > 0 ? 'border-danger' : 'border-success'}">
                                    <span class="text-muted small d-block mb-1">صافي الرصيد القائم للتحصيل (GL)</span>
                                    <strong class="fs-5 ${tabBalance > 0 ? 'text-danger' : 'text-success'}">${money.format(tabBalance)}</strong>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }

            function renderLinesForTab(selectedTab) {
                let filteredLines = allLines;
                let tabLabel = '';
                let isExpenseMode = false;

                if (selectedTab === 'group_loans') {
                    filteredLines = allLines.filter(l => isAdvanceAccount(l.main_account_id));
                    tabLabel = 'السلف والعهد والقروض';
                    isExpenseMode = false;
                } else if (selectedTab === 'group_expenses') {
                    filteredLines = allLines.filter(l => isExpenseAccount(l.main_account_id));
                    tabLabel = 'المصاريف والبدلات والسيارات';
                    isExpenseMode = true;
                } else if (selectedTab !== 'all') {
                    filteredLines = allLines.filter(l => l.main_account_id === selectedTab);
                    const meta = getAccountBadgeMeta(selectedTab);
                    tabLabel = meta.text;
                    isExpenseMode = isExpenseAccount(selectedTab);
                }

                updateSummaryCards(filteredLines, tabLabel, isExpenseMode);

                const tabDebit = filteredLines.reduce((acc, l) => acc + Number(l.debit_amount || 0), 0);
                if (countBadgeEl) {
                    countBadgeEl.textContent = `${filteredLines.length} قيد (مدين: ${money.format(tabDebit)})`;
                }

                if (!filteredLines.length) {
                    linesBodyEl.innerHTML = '<tr><td colspan="7" class="finance-empty-state">لا توجد قيود مسجلة لهذا الحساب.</td></tr>';
                    return;
                }

                linesBodyEl.replaceChildren(...filteredLines.map(line => {
                    const row = document.createElement('tr');
                    
                    const dateCell = document.createElement('td');
                    dateCell.dir = 'ltr';
                    dateCell.textContent = line.accounting_date || '—';

                    const journalCell = document.createElement('td');
                    journalCell.dir = 'ltr';
                    journalCell.textContent = line.journal_number || '—';

                    const voucherCell = document.createElement('td');
                    voucherCell.dir = 'ltr';
                    voucherCell.className = 'fw-bold font-monospace';
                    voucherCell.textContent = line.voucher || '—';

                    const descCell = document.createElement('td');
                    descCell.textContent = line.description || '—';

                    const debitCell = document.createElement('td');
                    debitCell.className = 'text-end fw-bold';
                    debitCell.dir = 'ltr';
                    debitCell.textContent = Number(line.debit_amount) > 0 ? money.format(Number(line.debit_amount)) : '—';

                    const creditCell = document.createElement('td');
                    creditCell.className = 'text-end fw-bold text-success';
                    creditCell.dir = 'ltr';
                    creditCell.textContent = Number(line.credit_amount) > 0 ? money.format(Number(line.credit_amount)) : '—';

                    const classCell = document.createElement('td');
                    classCell.className = 'text-center';
                    const classBadge = document.createElement('span');
                    const classMeta = getClassificationBadgeMeta(line.classification);
                    classBadge.className = `badge ${classMeta.cls}`;
                    classBadge.textContent = classMeta.text;
                    classCell.append(classBadge);

                    row.append(dateCell, journalCell, voucherCell, descCell, debitCell, creditCell, classCell);
                    return row;
                }));
            }

            if (tabsContainer) {
                const nav = document.createElement('div');
                nav.className = 'd-flex flex-wrap gap-2 p-2 bg-light rounded-3 border align-items-center';

                function makeTabBtn(labelHtml, tabKey, isDefault) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = `btn btn-sm ${isDefault ? 'btn-primary active text-white' : 'btn-outline-secondary'} fw-bold px-3`;
                    btn.innerHTML = labelHtml;
                    btn.addEventListener('click', () => {
                        nav.querySelectorAll('button').forEach(b => {
                            b.classList.remove('btn-primary', 'active', 'text-white');
                            b.classList.add('btn-outline-secondary');
                        });
                        btn.classList.remove('btn-outline-secondary');
                        btn.classList.add('btn-primary', 'active', 'text-white');
                        renderLinesForTab(tabKey);
                    });
                    return btn;
                }

                // Main Group Tabs
                if (hasLoanLines && hasExpLines) {
                    const defaultTab = advancesCategory === 'expenses' ? 'group_expenses' : 'group_loans';
                    nav.append(
                        makeTabBtn(`<i class="fa-solid fa-hand-holding-dollar me-1"></i> السلف والعهد <span class="badge bg-white text-primary ms-1">${allLines.filter(l => isAdvanceAccount(l.main_account_id)).length}</span>`, 'group_loans', defaultTab === 'group_loans'),
                        makeTabBtn(`<i class="fa-solid fa-receipt me-1"></i> المصاريف والسيارات <span class="badge bg-secondary ms-1">${allLines.filter(l => isExpenseAccount(l.main_account_id)).length}</span>`, 'group_expenses', defaultTab === 'group_expenses'),
                        makeTabBtn(`<i class="fa-solid fa-list me-1"></i> جميع الحركات <span class="badge bg-secondary ms-1">${allLines.length}</span>`, 'all', false)
                    );
                } else {
                    nav.append(
                        makeTabBtn(`<i class="fa-solid fa-list me-1"></i> جميع الحركات <span class="badge bg-white text-primary ms-1">${allLines.length}</span>`, 'all', true)
                    );
                }

                // Account specific tabs
                distinctAccounts.forEach(accId => {
                    const accMeta = getAccountBadgeMeta(accId);
                    const accLinesCount = allLines.filter(l => l.main_account_id === accId).length;
                    nav.append(makeTabBtn(`${accMeta.text} <span class="badge bg-secondary ms-1">${accLinesCount}</span>`, accId, false));
                });

                tabsContainer.replaceChildren(nav);
            }

            const initialModalTab = (hasLoanLines && hasExpLines) 
                ? (advancesCategory === 'expenses' ? 'group_expenses' : 'group_loans')
                : 'all';
            renderLinesForTab(initialModalTab);

        } catch (err) {
            console.error('Failed to load employee advance details:', err);
            summaryEl.innerHTML = '<div class="alert alert-danger mb-0">تعذر تحميل تفاصيل حركات الموظف.</div>';
            linesBodyEl.innerHTML = '<tr><td colspan="7" class="finance-empty-state text-danger">حدث خطأ أثناء الاتصال بالخادم.</td></tr>';
        }
    }

    function getAccountBadgeMeta(accountId) {
        switch (accountId) {
            case '151102':
                return { text: '151102 قروض وسلف', cls: 'bg-light text-primary border border-primary', kind: 'loan' };
            case '151101':
                return { text: '151101 عهد نقدية', cls: 'bg-light text-info border border-info', kind: 'loan' };
            case '523004':
                return { text: '523004 تذاكر سفر', cls: 'bg-light text-warning border border-warning', kind: 'expense' };
            case '523101':
                return { text: '523101 رحلات داخلية', cls: 'bg-light text-secondary border', kind: 'expense' };
            case '523102':
                return { text: '523102 رحلات خارجية', cls: 'bg-light text-secondary border', kind: 'expense' };
            case '524101':
                return { text: '524101 خروج وعودة', cls: 'bg-light text-dark border', kind: 'expense' };
            case '524102':
                return { text: '524102 تصريح عمل', cls: 'bg-light text-dark border', kind: 'expense' };
            case '524104':
                return { text: '524104 رسوم إقامة', cls: 'bg-light text-dark border', kind: 'expense' };
            case '523002':
                return { text: '523002 إضافي ومكافآت', cls: 'bg-light text-success border border-success', kind: 'expense' };
            case '560030':
                return { text: '560030 بنزين ووقود', cls: 'bg-light text-danger border border-danger', kind: 'expense' };
            case '560029':
                return { text: '560029 صيانة سيارات', cls: 'bg-light text-danger border border-danger', kind: 'expense' };
            default:
                return { text: accountId || 'GL', cls: 'bg-light text-secondary border', kind: 'other' };
        }
    }

    function getClassificationBadgeMeta(classification) {
        switch (classification) {
            case 'deduction':
            case 'salary_deduction':
                return { text: 'استقطاع راتب', cls: 'bg-success text-white' };
            case 'advance':
            case 'advance_or_loan':
                return { text: 'صرف سلفة/قرض', cls: 'bg-primary text-white' };
            case 'custody':
                return { text: 'عهدة نقدية', cls: 'bg-info text-dark' };
            case 'vacation_tickets':
                return { text: 'تذكرة سفر إجازة', cls: 'bg-warning text-dark' };
            case 'business_travel':
                return { text: 'مهمة / رحلة عمل', cls: 'bg-secondary text-white' };
            case 'exit_reentry_visa':
                return { text: 'تأشيرة خروج وعودة', cls: 'bg-dark text-white' };
            case 'work_permit':
                return { text: 'تصريح عمل', cls: 'bg-dark text-white' };
            case 'iqama_fees':
                return { text: 'رسوم إقامة', cls: 'bg-dark text-white' };
            case 'overtime_bonus':
                return { text: 'إضافي ومكافأة', cls: 'bg-success text-white' };
            case 'fuel_and_gasoline':
                return { text: 'بنزين ووقود', cls: 'bg-danger text-white' };
            case 'vehicle_maintenance':
                return { text: 'صيانة سيارة', cls: 'bg-danger text-white' };
            case 'vehicle_insurance':
                return { text: 'تأمين سيارة', cls: 'bg-danger text-white' };
            case 'opening_transfer':
                return { text: 'رصيد افتتاحي', cls: 'bg-secondary text-white' };
            default:
                return { text: 'حركة GL', cls: 'bg-secondary text-white' };
        }
    }

    function filterAndRenderAdvances() {
        const body = element('financeAdvancesBody');
        const thead = element('financeAdvancesTableHead');
        if (!body) return;

        let list = [...currentAdvances];
        const search = (filters.advances?.search || '').toLowerCase().trim();
        const account = filters.advances?.account || 'all';
        const status = filters.advances?.status || 'all';

        // 1. Filter by category (loans vs expenses vs all)
        if (advancesCategory === 'loans') {
            list = list.filter(a => isAdvanceAccount(a.main_account_id));
        } else if (advancesCategory === 'expenses') {
            list = list.filter(a => isExpenseAccount(a.main_account_id));
        }

        // 2. Filter by Account
        if (account && account !== 'all') {
            list = list.filter(a => a.main_account_id === account);
        } else {
            // Group by worker_id when viewing "All Accounts" in current category
            const groupedMap = new Map();
            for (const item of list) {
                const wid = item.worker_id;
                if (!groupedMap.has(wid)) {
                    groupedMap.set(wid, {
                        worker_id: wid,
                        data_area_id: item.data_area_id,
                        employee_name_arabic: item.employee_name_arabic,
                        employee_name: item.employee_name,
                        main_account_id: 'all',
                        accounts: [item.main_account_id],
                        total_debit: 0,
                        total_credit: 0,
                        gl_balance: 0,
                        last_movement_date: item.last_movement_date,
                        last_voucher: item.last_voucher,
                        last_description: item.last_description,
                        coverage_status: 'covered',
                        open_lines_count: 0,
                    });
                }
                const g = groupedMap.get(wid);
                if (!g.accounts.includes(item.main_account_id)) {
                    g.accounts.push(item.main_account_id);
                }
                g.total_debit += Number(item.total_debit || 0);
                g.total_credit += Number(item.total_credit || 0);
                g.gl_balance += Number(item.gl_balance || 0);
                g.open_lines_count += Number(item.open_lines_count || 0);
                if (item.last_movement_date && (!g.last_movement_date || item.last_movement_date > g.last_movement_date)) {
                    g.last_movement_date = item.last_movement_date;
                    g.last_voucher = item.last_voucher;
                    g.last_description = item.last_description;
                }
            }
            for (const g of groupedMap.values()) {
                g.coverage_status = g.gl_balance > 0 ? 'active' : 'covered';
            }
            list = Array.from(groupedMap.values());
        }

        // 3. Filter by Status (active/covered)
        if (status && status !== 'all') {
            list = list.filter(a => a.coverage_status === status);
        }

        // 4. Filter by Search
        if (search) {
            list = list.filter(a =>
                (a.worker_id || '').toLowerCase().includes(search) ||
                (a.employee_name_arabic || a.employee_name || '').toLowerCase().includes(search) ||
                (a.last_voucher || '').toLowerCase().includes(search) ||
                (a.last_description || '').toLowerCase().includes(search)
            );
        }

        const badge = element('financeAdvancesCountBadge');
        if (badge) {
            badge.textContent = `${list.length} ${advancesCategory === 'expenses' ? 'حركة / موظف' : 'موظف'}`;
        }

        const sort = sortState.advances;
        if (sort && sort.key) {
            list.sort((a, b) => {
                let valA = a[sort.key] ?? '';
                let valB = b[sort.key] ?? '';
                if (sort.key === 'employee_name' || sort.key === 'employee_name_arabic') {
                    valA = a.employee_name_arabic || a.employee_name || '';
                    valB = b.employee_name_arabic || b.employee_name || '';
                }
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sort.dir === 'asc' ? valA - valB : valB - valA;
                }
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
                return sort.dir === 'asc' ? valA.localeCompare(valB, 'ar') : valB.localeCompare(valA, 'ar');
            });
        }

        if (!list.length) {
            body.innerHTML = '<tr><td colspan="10" class="finance-empty-state">لا توجد سجلات مطابقة للبحث أو الفلتر المختار.</td></tr>';
            return;
        }

        body.replaceChildren(...list.map(adv => {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.title = 'انقر لعرض كشف الحساب التفصيلي للموظف';

            const idCell = document.createElement('td');
            idCell.dir = 'ltr';
            idCell.className = 'fw-bold font-monospace';
            idCell.textContent = adv.worker_id || '—';

            const nameCell = document.createElement('td');
            nameCell.className = 'fw-bold';
            nameCell.textContent = adv.employee_name_arabic || adv.employee_name || (adv.worker_id ? `موظف ${adv.worker_id}` : '—');

            const accCell = document.createElement('td');
            accCell.className = 'text-center';
            if (adv.main_account_id === 'all' && Array.isArray(adv.accounts)) {
                const badgeWrap = document.createElement('div');
                badgeWrap.className = 'd-flex flex-wrap justify-content-center gap-1';
                adv.accounts.forEach(acc => {
                    const accMeta = getAccountBadgeMeta(acc);
                    const accBadge = document.createElement('span');
                    accBadge.className = `badge ${accMeta.cls}`;
                    accBadge.style.fontSize = '0.75rem';
                    accBadge.style.padding = '3px 6px';
                    accBadge.textContent = accMeta.text;
                    badgeWrap.append(accBadge);
                });
                accCell.append(badgeWrap);
            } else {
                const accBadge = document.createElement('span');
                const accMeta = getAccountBadgeMeta(adv.main_account_id);
                accBadge.className = `badge ${accMeta.cls}`;
                accBadge.textContent = accMeta.text;
                accCell.append(accBadge);
            }

            const debitCell = document.createElement('td');
            debitCell.className = 'text-end fw-bold';
            debitCell.dir = 'ltr';
            debitCell.textContent = money.format(Number(adv.total_debit) || 0);

            const creditCell = document.createElement('td');
            creditCell.className = 'text-end fw-bold text-success';
            creditCell.dir = 'ltr';
            creditCell.textContent = money.format(Number(adv.total_credit) || 0);

            const isExpense = advancesCategory === 'expenses' || isExpenseAccount(adv.main_account_id);
            const glCell = document.createElement('td');
            glCell.className = `text-end fw-bold ${isExpense ? 'text-secondary' : (Number(adv.gl_balance) > 0 ? 'text-danger' : 'text-success')}`;
            glCell.dir = 'ltr';
            glCell.textContent = isExpense ? '— (مصروف)' : money.format(Number(adv.gl_balance) || 0);

            const dateCell = document.createElement('td');
            dateCell.dir = 'ltr';
            dateCell.textContent = adv.last_movement_date || '—';

            const voucherCell = document.createElement('td');
            voucherCell.dir = 'ltr';
            voucherCell.className = 'text-muted small';
            voucherCell.textContent = adv.last_voucher || '—';

            const statusCell = document.createElement('td');
            statusCell.className = 'text-center';
            const statusBadge = document.createElement('span');
            if (isExpense) {
                statusBadge.className = 'badge bg-warning bg-opacity-10 text-warning border border-warning';
                statusBadge.textContent = 'مصروف تشغيلي';
            } else {
                statusBadge.className = `badge ${adv.coverage_status === 'active' ? 'bg-warning text-dark' : 'bg-success'}`;
                statusBadge.textContent = adv.coverage_status === 'active' ? 'رصيد قائم' : 'مسدد/مغطى';
            }
            statusCell.append(statusBadge);

            const actionCell = document.createElement('td');
            actionCell.className = 'text-center';
            const actionBtn = document.createElement('button');
            actionBtn.className = 'btn btn-outline-primary btn-sm py-0 px-2';
            actionBtn.innerHTML = '<i class="fa-solid fa-eye me-1"></i> عرض';
            actionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEmployeeAdvanceDetailsModal(adv.worker_id);
            });
            actionCell.append(actionBtn);

            row.append(idCell, nameCell, accCell, debitCell, creditCell, glCell, dateCell, voucherCell, statusCell, actionCell);
            row.addEventListener('click', () => openEmployeeAdvanceDetailsModal(adv.worker_id));
            return row;
        }));
    }

    function renderEmployeeAdvances(payload) {
        if (!payload || payload.state !== 'ready') return;
        currentAdvances = payload.data || [];
        updateAdvancesCategoryUi(advancesCategory);
    }

    function filterAndRenderPurchases() {
        const body = element('financePurchasesBody');
        if (!body) return;

        let list = [...currentPurchases];
        const search = (filters.purchases?.search || '').toLowerCase().trim();
        const status = filters.purchases?.status || 'all';

        if (status && status !== 'all') {
            list = list.filter(p => p.purchase_order_status === status);
        }

        if (search) {
            list = list.filter(p =>
                (p.purchase_order_number || '').toLowerCase().includes(search) ||
                (p.vendor_name || '').toLowerCase().includes(search) ||
                (p.vendor_account_number || '').toLowerCase().includes(search)
            );
        }

        const badge = element('financePurchasesCountBadge');
        if (badge) {
            badge.textContent = `${list.length} أمر`;
        }

        const sort = sortState.purchases;
        if (sort && sort.key) {
            list.sort((a, b) => {
                let valA = a[sort.key] ?? '';
                let valB = b[sort.key] ?? '';
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sort.dir === 'asc' ? valA - valB : valB - valA;
                }
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
                return sort.dir === 'asc' ? valA.localeCompare(valB, 'ar') : valB.localeCompare(valA, 'ar');
            });
        }

        if (!list.length) {
            body.innerHTML = '<tr><td colspan="9" class="finance-empty-state">لا توجد أوامر شراء مطابقة للبحث.</td></tr>';
            return;
        }

        body.replaceChildren(...list.map(po => {
            const row = document.createElement('tr');

            const idCell = document.createElement('td');
            const idBadge = document.createElement('span');
            idBadge.className = 'finance-invoice-badge';
            idBadge.textContent = po.purchase_order_number || '—';
            idCell.append(idBadge);

            const vendorCell = document.createElement('td');
            vendorCell.className = 'fw-bold';
            vendorCell.textContent = po.vendor_name || po.vendor_account_number || '—';

            const orderDateCell = document.createElement('td');
            orderDateCell.dir = 'ltr';
            orderDateCell.textContent = po.accounting_date || '—';

            const reqDateCell = document.createElement('td');
            reqDateCell.dir = 'ltr';
            reqDateCell.textContent = po.requested_delivery_date || '—';

            const confDateCell = document.createElement('td');
            confDateCell.dir = 'ltr';
            confDateCell.textContent = po.confirmed_delivery_date || '—';

            const totalCell = document.createElement('td');
            totalCell.className = 'text-end fw-bold';
            totalCell.dir = 'ltr';
            totalCell.textContent = money.format(Number(po.total_amount) || 0);

            const remCell = document.createElement('td');
            remCell.className = 'text-end fw-bold text-primary';
            remCell.dir = 'ltr';
            remCell.textContent = money.format(Number(po.remaining_commitment) || 0);

            const linesCell = document.createElement('td');
            linesCell.className = 'text-center';
            linesCell.textContent = integer.format(Number(po.lines_count) || 0);

            const statusCell = document.createElement('td');
            const statusBadge = document.createElement('span');
            statusBadge.className = `badge ${po.purchase_order_status === 'Open Order' ? 'bg-warning text-dark' : (po.purchase_order_status === 'Invoiced' ? 'bg-success' : 'bg-info')}`;
            statusBadge.textContent = po.purchase_order_status || '—';
            statusCell.append(statusBadge);

            row.append(idCell, vendorCell, orderDateCell, reqDateCell, confDateCell, totalCell, remCell, linesCell, statusCell);
            return row;
        }));
    }

    function renderPurchaseOrders(payload) {
        if (!payload || payload.state !== 'ready') return;
        currentPurchases = payload.data || [];
        const s = payload.summary || {};
        setMetric('financePurchasesCommitment', money.format(Number(s.open_commitment) || 0));
        setMetric('financePurchasesTotalAmount', money.format(Number(s.total_po_amount) || 0));
        setMetric('financePurchasesTotalCount', `${integer.format(Number(s.total_po_count) || 0)} أمر شراء مسجل`);
        setMetric('financePurchasesOpenCount', `${integer.format(Number(s.open_po_count) || 0)} أمر مفتوح`);
        setMetric('financePurchasesPastDueCount', `${integer.format(Number(s.past_due_count) || 0)} متجاوز تاريخ التوريد`);
        filterAndRenderPurchases();
    }

    function filterAndRenderInventory() {
        const body = element('financeInventoryBody');
        if (!body) return;

        let list = [...currentInventory];
        const search = (filters.inventory?.search || '').toLowerCase().trim();

        if (search) {
            list = list.filter(i =>
                (i.store_number || '').toLowerCase().includes(search) ||
                (i.store_name || '').toLowerCase().includes(search)
            );
        }

        const badge = element('financeInventoryCountBadge');
        if (badge) {
            badge.textContent = `${list.length} موقع`;
        }

        const sort = sortState.inventory;
        if (sort && sort.key) {
            list.sort((a, b) => {
                let valA = a[sort.key] ?? '';
                let valB = b[sort.key] ?? '';
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sort.dir === 'asc' ? valA - valB : valB - valA;
                }
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
                return sort.dir === 'asc' ? valA.localeCompare(valB, 'ar') : valB.localeCompare(valA, 'ar');
            });
        }

        if (!list.length) {
            body.innerHTML = '<tr><td colspan="7" class="finance-empty-state">لا توجد مواقع مخزون مطابقة للبحث.</td></tr>';
            return;
        }

        body.replaceChildren(...list.map(inv => {
            const row = document.createElement('tr');

            const idCell = document.createElement('td');
            idCell.dir = 'ltr';
            idCell.className = 'fw-bold';
            idCell.textContent = inv.store_number || '—';

            const nameCell = document.createElement('td');
            nameCell.className = 'fw-bold';
            nameCell.textContent = inv.store_name || '—';

            const skusCell = document.createElement('td');
            skusCell.className = 'text-center';
            skusCell.textContent = integer.format(Number(inv.skus_count) || 0);

            const unitsCell = document.createElement('td');
            unitsCell.className = 'text-end fw-bold';
            unitsCell.dir = 'ltr';
            unitsCell.textContent = integer.format(Number(inv.total_units) || 0);

            const costCell = document.createElement('td');
            costCell.className = 'text-end text-muted';
            costCell.dir = 'ltr';
            costCell.textContent = money.format(Number(inv.total_cost_value) || 0);

            const retailCell = document.createElement('td');
            retailCell.className = 'text-end fw-bold text-success';
            retailCell.dir = 'ltr';
            retailCell.textContent = money.format(Number(inv.total_retail_value) || 0);

            const typeCell = document.createElement('td');
            const typeBadge = document.createElement('span');
            typeBadge.className = `badge ${inv.is_warehouse ? 'bg-primary' : 'bg-light text-dark border'}`;
            typeBadge.textContent = inv.is_warehouse ? 'مستودع مركزي' : 'معرض';
            typeCell.append(typeBadge);

            row.append(idCell, nameCell, skusCell, unitsCell, costCell, retailCell, typeCell);
            return row;
        }));
    }

    function renderInventoryValuation(payload) {
        if (!payload || payload.state !== 'ready') return;
        currentInventory = payload.data || [];
        const s = payload.summary || {};
        setMetric('financeInventoryRetailValue', money.format(Number(s.total_retail_value) || 0));
        setMetric('financeInventoryCostValue', money.format(Number(s.total_cost_value) || 0));
        setMetric('financeInventoryWarehouseUnits', `${integer.format(Number(s.warehouse_units) || 0)} قطعة`);
        setMetric('financeInventoryShowroomUnits', `${integer.format(Number(s.showroom_units) || 0)} قطعة`);
        setMetric('financeInventoryTotalUnits', `${integer.format(Number(s.total_units) || 0)} إجمالي قطع البضاعة`);
        filterAndRenderInventory();
    }

    function renderCashAndGateways(payload) {
        if (!payload || payload.state !== 'ready') return;
        currentTreasury = payload;
        const s = payload.summary || {};
        setMetric('financeTreasuryCashCount', `${integer.format(Number(s.cash_pos_count) || 0)} صندوق`);
        setMetric('financeTreasuryBankCount', `${integer.format(Number(s.banks_count) || 0)} حساب بنكي`);
        setMetric('financeTreasuryGatewaysCount', `${integer.format(Number(s.gateways_count) || 0)} وسيط تحصيل`);

        const cashBalanceElem = element('financeTreasuryCashBalance');
        if (cashBalanceElem) {
            cashBalanceElem.textContent = `إجمالي الرصيد: ${money.format(Number(s.cash_pos_total_balance) || 0)}`;
        }
        const bankBalanceElem = element('financeTreasuryBankBalance');
        if (bankBalanceElem) {
            bankBalanceElem.textContent = `إجمالي الرصيد: ${money.format(Number(s.banks_total_balance) || 0)}`;
        }

        const cashBody = element('financeTreasuryCashBody');
        if (cashBody && payload.cash_pos) {
            cashBody.replaceChildren(...payload.cash_pos.map(c => {
                const row = document.createElement('tr');
                const bal = Number(c.balance) || 0;
                const balCell = textElement('td', money.format(bal), `text-end fw-bold ${bal < 0 ? 'text-danger' : (bal > 0 ? 'text-success' : 'text-muted')}`);
                balCell.dir = 'ltr';

                const inCell = textElement('td', money.format(Number(c.total_inflows) || 0), 'text-end text-success');
                inCell.dir = 'ltr';

                const outCell = textElement('td', money.format(Math.abs(Number(c.total_outflows) || 0)), 'text-end text-danger');
                outCell.dir = 'ltr';

                const txCell = textElement('td', integer.format(Number(c.trans_count) || 0), 'text-center');
                txCell.dir = 'ltr';

                row.append(
                    textElement('td', c.main_account_id, 'fw-bold font-monospace'),
                    textElement('td', c.account_name, 'fw-semibold'),
                    inCell,
                    outCell,
                    balCell,
                    txCell
                );
                return row;
            }));
        }

        const banksBody = element('financeTreasuryBanksBody');
        if (banksBody && payload.banks) {
            banksBody.replaceChildren(...payload.banks.map(b => {
                const row = document.createElement('tr');
                const bal = Number(b.balance) || 0;
                const balCell = textElement('td', money.format(bal), `text-end fw-bold ${bal < 0 ? 'text-danger' : (bal > 0 ? 'text-success' : 'text-muted')}`);
                balCell.dir = 'ltr';

                const inCell = textElement('td', money.format(Number(b.total_inflows) || 0), 'text-end text-success');
                inCell.dir = 'ltr';

                const outCell = textElement('td', money.format(Math.abs(Number(b.total_outflows) || 0)), 'text-end text-danger');
                outCell.dir = 'ltr';

                const txCell = textElement('td', integer.format(Number(b.trans_count) || 0), 'text-center');
                txCell.dir = 'ltr';

                row.append(
                    textElement('td', b.main_account_id, 'fw-bold font-monospace'),
                    textElement('td', b.account_name, 'fw-semibold'),
                    inCell,
                    outCell,
                    balCell,
                    txCell
                );
                return row;
            }));
        }

        const gatewaysBody = element('financeTreasuryGatewaysBody');
        if (gatewaysBody && payload.gateways) {
            gatewaysBody.replaceChildren(...payload.gateways.map(g => {
                const row = document.createElement('tr');
                row.append(
                    textElement('td', g.main_account_id, 'fw-bold font-monospace'),
                    textElement('td', g.account_name, 'fw-bold text-primary'),
                    textElement('td', g.main_account_type || 'وسيط دفع')
                );
                return row;
            }));
        }
    }

    function renderVatHub(payload) {
        if (!payload || payload.state !== 'ready') return;
        currentTaxHub = payload;
        const s = payload.summary || {};
        setMetric('financeTaxOutputVat', money.format(Number(s.total_output_vat) || 0));
        setMetric('financeTaxSalesExcl', `${money.format(Number(s.total_taxable_sales) || 0)} مبيعات خاضعة`);
        setMetric('financeTaxInputVat', money.format(Number(s.total_input_vat) || 0));
        setMetric('financeTaxPurchasesExcl', `${money.format(Number(s.total_taxable_purchases) || 0)} مشتريات خاضعة`);
        setMetric('financeTaxNetPayable', money.format(Number(s.net_vat_payable) || 0));

        const body = element('financeTaxBody');
        if (!body || !payload.monthly) return;

        body.replaceChildren(...payload.monthly.map(m => {
            const row = document.createElement('tr');

            const monthCell = document.createElement('td');
            monthCell.dir = 'ltr';
            monthCell.className = 'fw-bold';
            monthCell.textContent = m.month || '—';

            const salesCell = document.createElement('td');
            salesCell.className = 'text-end';
            salesCell.dir = 'ltr';
            salesCell.textContent = money.format(Number(m.taxable_sales) || 0);

            const outVatCell = document.createElement('td');
            outVatCell.className = 'text-end fw-bold text-primary';
            outVatCell.dir = 'ltr';
            outVatCell.textContent = money.format(Number(m.output_vat) || 0);

            const purchCell = document.createElement('td');
            purchCell.className = 'text-end';
            purchCell.dir = 'ltr';
            purchCell.textContent = money.format(Number(m.taxable_purchases) || 0);

            const inVatCell = document.createElement('td');
            inVatCell.className = 'text-end text-success';
            inVatCell.dir = 'ltr';
            inVatCell.textContent = money.format(Number(m.input_vat) || 0);

            const netCell = document.createElement('td');
            netCell.className = 'text-end fw-bold text-danger';
            netCell.dir = 'ltr';
            netCell.textContent = money.format(Number(m.net_vat_payable) || 0);

            const invCountCell = document.createElement('td');
            invCountCell.className = 'text-center';
            invCountCell.textContent = integer.format(Number(m.invoice_count) || 0);

            const transCountCell = document.createElement('td');
            transCountCell.className = 'text-center';
            transCountCell.textContent = integer.format(Number(m.trans_count) || 0);

            row.append(monthCell, salesCell, outVatCell, purchCell, inVatCell, netCell, invCountCell, transCountCell);
            return row;
        }));
    }


    function renderLeaseInsights(payload) {
        if (!payload?.configured) return;
        const horizons = payload.due_horizons || {};
        const renewals = payload.renewals || {};
        [30, 60, 90].forEach(days => {
            const bucket = horizons[`days_${days}`] || {};
            setMetric(`financeLeaseDue${days}`, money.format(Number(bucket.amount) || 0));
            setMetric(
                `financeLeaseDue${days}Count`,
                `${integer.format(Number(bucket.count) || 0)} دفعة مجدولة`
            );
        });
        setMetric('financeLeaseRenewals90', integer.format(Number(renewals.expiring_90) || 0));
        setMetric(
            'financeLeaseOverdueReview',
            `${integer.format(Number(renewals.overdue_review) || 0)} عقد متجاوز يحتاج مراجعة`
        );
    }

    function renderApAging(payload) {
        const container = element('financeApAging');
        if (!payload?.configured) {
            container.innerHTML = '<div class="finance-empty-state">بيانات AP غير متاحة.</div>';
            return;
        }
        const labels = {
            not_due: 'غير مستحق', days_1_30: '1–30 يومًا',
            days_31_60: '31–60 يومًا', days_61_90: '61–90 يومًا',
            over_90: 'أكثر من 90 يومًا'
        };
        container.replaceChildren(...Object.entries(labels).map(([key, label], index) => {
            const bucket = payload.buckets?.[key] || {};
            const card = document.createElement('article');
            card.className = `finance-aging-card${index ? ' is-overdue' : ''}`;
            const labelNode = document.createElement('span');
            labelNode.textContent = label;
            const amount = document.createElement('strong');
            amount.textContent = money.format(Number(bucket.balance) || 0);
            const count = document.createElement('small');
            count.textContent = `${integer.format(Number(bucket.transaction_count) || 0)} حركة`;
            card.append(labelNode, amount, count);
            return card;
        }));
        element('financeApAsOf').textContent = `كما في ${payload.as_of || '—'}`;
        element('financeApReconciliation').textContent = payload.summary?.bucket_balance_matches
            ? 'مجموع الأعمار مطابق للرصيد المفتوح'
            : 'يوجد فرق مصالحة يحتاج مراجعة';
    }

    function sortAndRenderTopVendors() {
        const body = element('financeTopVendorsBody');
        if (!body) return;
        let list = [...currentTopVendors];
        const state = sortState.topVendors;
        if (state) {
            list.sort((a, b) => compareValues(a, b, state.key, state.dir));
        }
        updateSortHeaders('topVendors');

        if (!list.length) {
            body.innerHTML = '<tr><td colspan="6" class="finance-empty-state">لا توجد أرصدة موردين مفتوحة.</td></tr>';
            return;
        }

        body.replaceChildren(...list.slice(0, 25).map(vendor => {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.title = 'انقر لعرض كامل حركات المورد والتسويات المحاسبية';
            [vendor.vendor_name || '—', vendor.vendor_account_number || '—',
                money.format(Number(vendor.transaction_amount) || 0),
                money.format(Number(vendor.paid_amount) || 0),
                money.format(Number(vendor.remaining_amount) || 0),
                money.format(Number(vendor.overdue_remaining_amount) || 0)
            ].forEach((value, index) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                if (index === 1) cell.dir = 'ltr';
                if (index >= 2) {
                    cell.dir = 'ltr';
                    cell.className = 'text-end fw-bold';
                }
                if (index === 5 && Number(vendor.overdue_remaining_amount) > 0) {
                    cell.classList.add('text-danger');
                }
                row.append(cell);
            });
            row.addEventListener('click', () => openVendorPaymentsModal(
                vendor.vendor_account_number,
                vendor.data_area_id
            ));
            return row;
        }));
    }

    function renderVendorAnalytics(payload) {
        element('financeApReconciliation').textContent = payload.summary?.bucket_balance_matches
            ? 'مجموع الأعمار مطابق للرصيد المفتوح'
            : 'يوجد فرق مصالحة يحتاج مراجعة';
        currentTopVendors = payload?.vendors || [];
        sortAndRenderTopVendors();
    }

    function renderTrialBalanceTrend(payload) {
        const body = element('financeExpenseTrendBody');
        if (payload?.state !== 'ready' || !(payload.data || []).length) {
            body.innerHTML = '<tr><td colspan="5" class="finance-empty-state">التاريخ المحاسبي قيد التحميل أو غير متاح.</td></tr>';
            return;
        }
        body.replaceChildren(...payload.data.map(month => {
            const row = document.createElement('tr');
            [month.month,
                month.revenue_available ? money.format(Number(month.revenue) || 0) : 'غير متوفر',
                money.format(Number(month.cogs) || 0),
                money.format(Number(month.operating_expense) || 0),
                month.revenue_available ? money.format(Number(month.operating_result) || 0) : 'غير متوفر'
            ].forEach((value, index) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                if (index > 0) cell.dir = 'ltr';
                if (index >= 1) cell.className = 'text-end';
                if (index === 4 && month.revenue_available) {
                    cell.className += Number(month.operating_result) >= 0 ? ' text-success fw-bold' : ' text-danger fw-bold';
                }
                row.append(cell);
            });
            return row;
        }));
    }

    function renderAdditionalAnalytics(payload) {
        const sections = payload?.sections || {};
        const po = sections.purchase_commitments || {};
        const assets = sections.fixed_assets || {};
        const ar = sections.ar_aging || {};
        const bank = sections.bank_cashflow || {};
        const vat = sections.purchase_vat || {};
        const availability = sections.source_availability || {};

        setMetric('financeAdditionalState', payload?.state === 'ready'
            ? 'كل المصادر المطبقة جاهزة'
            : 'بعض المصادر غير متاحة؛ الباقي يعمل');

        setMetric('financePoCommitment', po.state === 'ready'
            ? money.format(Number(po.summary?.open_commitment) || 0) : 'غير متوفر');
        setMetric('financePoCommitmentMeta', po.state === 'ready'
            ? `${integer.format(Number(po.summary?.open_line_count) || 0)} سطر مفتوح · ${money.format(Number(po.summary?.upcoming_commitment_30d) || 0)} خلال 30 يومًا`
            : 'مصدر PO غير متاح');

        setMetric('financeAssetNbv', assets.state === 'ready'
            ? money.format(Number(assets.summary?.net_book_value) || 0) : 'غير متوفر');
        setMetric('financeAssetNbvMeta', assets.state === 'ready'
            ? `${integer.format(Number(assets.summary?.asset_count) || 0)} أصل · ${integer.format(Number(assets.coverage?.mapped_assets) || 0)} مربوط بمعرض معتمد`
            : 'مصدر الأصول غير متاح');

        setMetric('financeArOpen', ar.state === 'ready'
            ? money.format(Number(ar.summary?.open_amount) || 0) : 'غير متوفر');
        setMetric('financeArOpenMeta', ar.state === 'ready'
            ? `${integer.format(Number(ar.summary?.open_item_count) || 0)} استحقاق مفتوح · الأعمار متطابقة مع الرصيد`
            : 'مصدر AR غير متاح');
        const arAging = element('financeArAging');
        const arLabels = {
            not_due: 'غير مستحق', days_1_30: '1–30 يومًا',
            days_31_60: '31–60 يومًا', days_61_90: '61–90 يومًا', over_90: 'أكثر من 90 يومًا'
        };
        if (ar.state !== 'ready') {
            arAging.innerHTML = '<div class="finance-empty-state">بيانات AR Aging غير متاحة.</div>';
        } else {
            arAging.replaceChildren(...(ar.buckets || []).map((bucket, index) => {
                const card = document.createElement('article');
                card.className = `finance-aging-card${index ? ' is-overdue' : ''}`;
                const label = document.createElement('span');
                label.textContent = arLabels[bucket.key] || bucket.key;
                const amount = document.createElement('strong');
                amount.textContent = money.format(Number(bucket.amount) || 0);
                const count = document.createElement('small');
                count.textContent = `${integer.format(Number(bucket.item_count) || 0)} استحقاق`;
                card.append(label, amount, count);
                return card;
            }));
        }

        setMetric('financeBankNet', bank.state === 'ready'
            ? money.format(Number(bank.summary?.net_cash) || 0) : 'غير متوفر');
        setMetric('financeBankNetMeta', bank.state === 'ready'
            ? `داخل ${money.format(Number(bank.summary?.cash_in) || 0)} · خارج ${money.format(Number(bank.summary?.cash_out) || 0)} · بلا أرقام حسابات`
            : 'الحركة البنكية غير متاحة');

        setMetric('financePurchaseVat', vat.state === 'ready'
            ? money.format(Number(vat.summary?.tax_amount) || 0) : 'غير متوفر');
        setMetric('financePurchaseVatMeta', vat.state === 'ready'
            ? `${integer.format(Number(vat.summary?.transaction_count) || 0)} حركة ضريبة مورد مطابقة`
            : 'Purchase VAT غير متاح');

        const budgetSources = (availability.sources || []).filter(source =>
            String(source.entity_name || '').toLowerCase().startsWith('budget')
        );
        const budgetHasData = budgetSources.some(source => Number(source.row_count) > 0);
        const budgetIsEmpty = budgetSources.length > 0 && budgetSources.every(source => source.status === 'empty');
        setMetric('financeBudgetState', budgetHasData ? 'متاح' : budgetIsEmpty ? 'غير مستخدم' : 'غير معروف');
        setMetric('financeBudgetMeta', budgetIsEmpty
            ? 'كيانات Budget في Dynamics فارغة؛ لا نعرضها كميزانية صفر'
            : budgetHasData ? 'يمكن احتساب Budget مقابل الفعلي' : 'لم يُفحص مصدر Budget بعد');

        setMetric('financeAssetsTotalNbv', assets.state === 'ready'
            ? money.format(Number(assets.summary?.net_book_value) || 0) : '—');
    }

    function appendShowroomPnl(payload) {
        if (payload?.state !== 'ready' || !payload.summary) return;
        const summary = payload.summary;
        const metrics = [
            ['الإيراد', summary.revenue_available ? summary.revenue : null],
            ['تكلفة البضاعة', summary.cogs],
            ['المصاريف التشغيلية', summary.operating_expense],
            ['مجمل الربح', summary.gross_profit],
            ['النتيجة التشغيلية', summary.operating_result]
        ].map(([metric, value]) => ({
            metric,
            display: value === null || value === undefined
                ? 'غير متوفر — تغطية الإيراد غير مكتملة'
                : money.format(Number(value) || 0)
        }));
        element('financeShowroomContent').prepend(detailSection(
            'P&L المعرض من Trial Balance',
            [{ key: 'metric', label: 'البند' }, { key: 'display', label: 'القيمة', ltr: true }],
            metrics
        ));
    }

    function renderError(error) {
        console.error('Finance platform load failed:', error);
        setState('error', 'تعذر تحميل المنصة');
        element('financeSetupNotice').hidden = true;
        resetMetrics();
        element('financeCategoryList').innerHTML =
            '<div class="finance-empty-state">تعذر قراءة البيانات. تحقق من تشغيل الخادم وصلاحية Finance.</div>';
        element('financeShowroomsBody').innerHTML =
            '<tr><td colspan="6" class="finance-empty-state">تعذر تحميل سجل المعارض.</td></tr>';
        element('financeVendorInvoicesBody').innerHTML =
            '<tr><td colspan="7" class="finance-empty-state">تعذر تحميل فواتير الموردين.</td></tr>';
        element('financeLeasesBody').innerHTML =
            '<tr><td colspan="5" class="finance-empty-state">تعذر تحميل عقود الإيجار.</td></tr>';
        element('financeAssetsBody').innerHTML =
            '<tr><td colspan="8" class="finance-empty-state">تعذر تحميل سجل الأصول الثابتة.</td></tr>';
        [30, 60, 90].forEach(days => {
            setMetric(`financeLeaseDue${days}`, '—');
            setMetric(`financeLeaseDue${days}Count`, 'تعذر التحميل');
        });
        setMetric('financeLeaseRenewals90', '—');
        setMetric('financeLeaseOverdueReview', 'تعذر التحميل');
        ['financePoCommitment', 'financeAssetNbv', 'financeArOpen', 'financeBankNet',
            'financePurchaseVat', 'financeBudgetState'].forEach(id => setMetric(id, 'غير متوفر'));
    }

    function filterAndRenderMaintenanceShowrooms() {
        const body = element('financeMaintShowroomsBody');
        if (!body) return;
        const list = currentMaintenance.showrooms || [];
        const term = (filters.maintenance?.search || '').toLowerCase().trim();

        let filtered = list.filter(item => {
            if (!term) return true;
            return String(item.showroom_number || '').toLowerCase().includes(term) ||
                String(item.showroom_name || '').toLowerCase().includes(term) ||
                String(item.branch_code || '').toLowerCase().includes(term);
        });

        const sort = sortState.maintenance;
        if (sort) {
            filtered.sort((a, b) => {
                const va = a[sort.key];
                const vb = b[sort.key];
                if (typeof va === 'string') {
                    return sort.dir === 'asc' ? va.localeCompare(vb, 'ar') : vb.localeCompare(va, 'ar');
                }
                return sort.dir === 'asc' ? (Number(va) || 0) - (Number(vb) || 0) : (Number(vb) || 0) - (Number(va) || 0);
            });
        }

        if (!filtered.length) {
            tableMessage(body, 9, 'لا توجد بيانات صيانة مطابقة للبحث والفترة المحددة.');
            return;
        }

        body.replaceChildren();
        filtered.forEach(item => {
            const row = document.createElement('tr');

            // 1. Showroom Name & Code
            const cellName = document.createElement('td');
            const nameBold = document.createElement('strong');
            nameBold.className = 'd-block text-dark';
            nameBold.textContent = item.showroom_name || item.showroom_number;
            const codeSub = document.createElement('span');
            codeSub.className = 'text-muted small';
            codeSub.textContent = `كود الفرع: ${item.showroom_number}`;
            cellName.append(nameBold, codeSub);

            // 2. Sales Revenue
            const cellSales = textElement('td', money.format(item.sales_revenue || 0), 'text-end');
            cellSales.dir = 'ltr';

            // 3. Showroom Maintenance (560019)
            const cellMaint = textElement('td', money.format(item.showroom_maint_amount || 0), 'text-end fw-semibold');
            cellMaint.dir = 'ltr';

            // 4. Contractor AP Invoices
            const cellAp = textElement('td', money.format(item.ap_contractor_amount || 0), 'text-end text-primary fw-bold');
            cellAp.dir = 'ltr';

            // 5. Petty Cash / Direct Vouchers
            const cellPetty = textElement('td', money.format(item.petty_cash_amount || 0), 'text-end text-success fw-bold');
            cellPetty.dir = 'ltr';

            // 6. Total Maintenance (GL)
            const cellTotal = textElement('td', money.format(item.total_maintenance_amount || 0), 'text-end fw-bold text-danger');
            cellTotal.dir = 'ltr';

            // 7. Maintenance % of Sales Badge
            const cellRatio = document.createElement('td');
            cellRatio.className = 'text-center';
            const ratioPct = item.maintenance_ratio_pct || 0;
            const badge = document.createElement('span');
            let badgeClass = 'badge bg-success-subtle text-success border border-success-subtle';
            if (ratioPct > 1.5) {
                badgeClass = 'badge bg-danger-subtle text-danger border border-danger-subtle';
            } else if (ratioPct > 0.6) {
                badgeClass = 'badge bg-warning-subtle text-warning border border-warning-subtle';
            }
            badge.className = `${badgeClass} px-2 py-1`;
            badge.textContent = `${ratioPct.toFixed(2)}%`;
            badge.dir = 'ltr';
            cellRatio.append(badge);

            // 8. Invoices Count
            const cellCount = textElement('td', integer.format(item.invoice_count || 0), 'text-center');
            cellCount.dir = 'ltr';

            // 9. Action Button (Open Showroom Detail)
            const cellAction = document.createElement('td');
            cellAction.className = 'text-center';
            const detailBtn = document.createElement('button');
            detailBtn.type = 'button';
            detailBtn.className = 'btn btn-sm btn-outline-primary py-0 px-2';
            detailBtn.innerHTML = '<i class="fa-solid fa-folder-open me-1"></i> التفاصيل';
            detailBtn.addEventListener('click', () => openShowroomDetail(item.showroom_number));
            cellAction.append(detailBtn);

            row.append(cellName, cellSales, cellMaint, cellAp, cellPetty, cellTotal, cellRatio, cellCount, cellAction);
            body.append(row);
        });
    }

    function renderMaintenance(payload) {
        currentMaintenance = payload || {};
        const summary = payload.summary || {};

        setMetric('financeMaintTotalCost', money.format(summary.total_maintenance_cost || 0));
        setMetric('financeMaintApCost', money.format(summary.total_ap_contractors_cost || 0));
        setMetric('financeMaintPettyCashCost', money.format(summary.total_petty_cash_cost || 0));
        setMetric('financeMaintTopShowroom', summary.top_spending_showroom || '—');
        setMetric('financeMaintInvoicesCount', `${integer.format(summary.total_invoices_count || 0)} فاتورة مقاول`);

        const contractorsBadge = element('financeMaintContractorsCountBadge');
        if (contractorsBadge) {
            contractorsBadge.textContent = `${payload.contractors?.length || 0} مقاول`;
        }
        const subnavBadge = element('financeSubnavMaintenanceBadge');
        if (subnavBadge) {
            subnavBadge.textContent = money.format(summary.total_maintenance_cost || 0);
        }

        // 1. Render Contractors Table
        const contractorsBody = element('financeMaintContractorsBody');
        if (contractorsBody) {
            const contractors = payload.contractors || [];
            if (!contractors.length) {
                tableMessage(contractorsBody, 5, 'لا توجد بيانات مقاولين في الفترة المحددة.');
            } else {
                contractorsBody.replaceChildren();
                contractors.forEach(c => {
                    const row = document.createElement('tr');
                    row.className = 'finance-clickable-row';
                    row.style.cursor = 'pointer';
                    row.title = 'انقر لعرض كافة فواتير المقاول والمعارض المرتبطة';

                    const cName = document.createElement('td');
                    cName.innerHTML = `<strong class="d-block text-primary"><i class="fa-solid fa-folder-open me-1 text-warning"></i> ${c.vendor_name || c.invoice_account}</strong>`;
                    const cAcc = textElement('td', c.invoice_account, 'small text-muted');
                    cAcc.dir = 'ltr';
                    const cInv = textElement('td', integer.format(c.invoice_count || 0), 'text-center fw-bold');
                    cInv.dir = 'ltr';
                    const cSh = textElement('td', `${integer.format(c.showrooms_served || 0)} معرض`, 'text-center small');
                    const cAmt = textElement('td', money.format(c.total_amount || 0), 'text-end fw-bold text-primary');
                    cAmt.dir = 'ltr';
                    row.append(cName, cAcc, cInv, cSh, cAmt);
                    row.addEventListener('click', () => openContractorDetail(c.invoice_account, c.vendor_name));
                    contractorsBody.append(row);
                });
            }
        }

        // 2. Render Monthly Trend Table
        const trendBody = element('financeMaintTrendBody');
        if (trendBody) {
            const trend = payload.monthly_trend || [];
            if (!trend.length) {
                tableMessage(trendBody, 4, 'لا توجد بيانات اتجاه شهري.');
            } else {
                trendBody.replaceChildren();
                trend.forEach(t => {
                    const row = document.createElement('tr');
                    const tMonth = textElement('td', t.period_month, 'fw-bold');
                    tMonth.dir = 'ltr';
                    const tInv = textElement('td', integer.format(t.invoice_count || 0), 'text-center');
                    tInv.dir = 'ltr';
                    const tSh = textElement('td', integer.format(t.active_showrooms || 0), 'text-center');
                    tSh.dir = 'ltr';
                    const tAmt = textElement('td', money.format(t.total_amount || 0), 'text-end fw-bold');
                    tAmt.dir = 'ltr';
                    row.append(tMonth, tInv, tSh, tAmt);
                    trendBody.append(row);
                });
            }
        }

        // 3. Render Showrooms comparison
        filterAndRenderMaintenanceShowrooms();

        // 4. Render Recent Invoices
        const recentBody = element('financeMaintRecentInvoicesBody');
        if (recentBody) {
            const invoices = payload.recent_invoices || [];
            if (!invoices.length) {
                tableMessage(recentBody, 8, 'لا توجد فواتير صيانة حديثة.');
            } else {
                recentBody.replaceChildren();
                invoices.slice(0, 50).forEach(inv => {
                    const row = document.createElement('tr');
                    const shCell = document.createElement('td');
                    shCell.innerHTML = `<strong class="d-block">${inv.showroom_name}</strong><span class="small text-muted">${inv.branch_code}</span>`;
                    const invCell = textElement('td', inv.invoice_id, 'small');
                    invCell.dir = 'ltr';
                    const vCell = textElement('td', inv.vendor_name || inv.invoice_account);
                    const dateCell = textElement('td', inv.invoice_date, 'small text-muted');
                    dateCell.dir = 'ltr';
                    const accCell = document.createElement('td');
                    accCell.innerHTML = `<span class="small d-block">${inv.account_name}</span><span class="text-muted" style="font-size:0.75rem;">${inv.main_account}</span>`;
                    const descCell = textElement('td', inv.description || '—', 'small text-truncate');
                    descCell.style.maxWidth = '200px';
                    const amtCell = textElement('td', money.format(inv.line_amount || 0), 'text-end fw-bold');
                    amtCell.dir = 'ltr';
                    const taxCell = textElement('td', money.format(inv.sales_tax_amount || 0), 'text-end text-muted small');
                    taxCell.dir = 'ltr';
                    row.append(shCell, invCell, vCell, dateCell, accCell, descCell, amtCell, taxCell);
                    recentBody.append(row);
                });
            }
        }
    }

    function openContractorDetail(invoiceAccount, vendorName) {
        const modalEl = element('financeContractorInvoicesModal');
        if (!modalEl) return;

        const titleEl = element('financeContractorInvoicesTitle');
        if (titleEl) titleEl.textContent = `سجل أعمال وفواتير: ${vendorName || invoiceAccount}`;
        const subTitleEl = element('financeContractorInvoicesSubtitle');
        if (subTitleEl) subTitleEl.textContent = `كود المورد: ${invoiceAccount} — كافة فواتير الصيانة والمعارض المستفيدة`;

        const allInvoices = (currentMaintenance.recent_invoices || []).filter(
            inv => String(inv.invoice_account) === String(invoiceAccount)
        );

        const totalAmt = allInvoices.reduce((sum, i) => sum + (Number(i.line_amount) || 0), 0);
        const totalTax = allInvoices.reduce((sum, i) => sum + (Number(i.sales_tax_amount) || 0), 0);
        const totalGross = totalAmt + totalTax;
        const showrooms = new Set(allInvoices.map(i => i.branch_code)).size;

        const headerStats = element('financeContractorHeaderStats');
        if (headerStats) {
            headerStats.innerHTML = `
                <div class="col-md-3">
                    <div class="p-3 bg-light rounded text-center border">
                        <small class="text-muted d-block mb-1">إجمالي مبالغ الصيانة</small>
                        <strong class="text-primary fs-5" dir="ltr">${money.format(totalAmt)} SAR</strong>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="p-3 bg-light rounded text-center border">
                        <small class="text-muted d-block mb-1">الضريبة المضافة</small>
                        <strong class="text-secondary fs-5" dir="ltr">${money.format(totalTax)} SAR</strong>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="p-3 bg-light rounded text-center border">
                        <small class="text-muted d-block mb-1">الإجمالي شامل الضريبة</small>
                        <strong class="text-success fs-5" dir="ltr">${money.format(totalGross)} SAR</strong>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="p-3 bg-light rounded text-center border">
                        <small class="text-muted d-block mb-1">الفواتير / المعارض</small>
                        <strong class="text-dark fs-5">${allInvoices.length} فاتورة / ${showrooms} معرض</strong>
                    </div>
                </div>
            `;
        }

        function renderInvoicesTable(filterTerm = '') {
            const body = element('financeContractorInvoicesBody');
            if (!body) return;

            const term = (filterTerm || '').toLowerCase().trim();
            const filtered = allInvoices.filter(inv => {
                if (!term) return true;
                return String(inv.showroom_name || '').toLowerCase().includes(term) ||
                    String(inv.branch_code || '').toLowerCase().includes(term) ||
                    String(inv.invoice_id || '').toLowerCase().includes(term) ||
                    String(inv.account_name || '').toLowerCase().includes(term) ||
                    String(inv.description || '').toLowerCase().includes(term);
            });

            if (!filtered.length) {
                tableMessage(body, 8, 'لا توجد فواتير صيانة مطابقة للبحث.');
                return;
            }

            body.replaceChildren();
            filtered.forEach(inv => {
                const row = document.createElement('tr');

                // Showroom
                const shCell = document.createElement('td');
                shCell.innerHTML = `<strong class="d-block text-dark">${inv.showroom_name}</strong><span class="small text-muted">كود الفرع: ${inv.branch_code}</span>`;

                // Invoice ID
                const invCell = textElement('td', inv.invoice_id, 'fw-bold small');
                invCell.dir = 'ltr';

                // Date
                const dateCell = textElement('td', inv.invoice_date, 'small text-muted');
                dateCell.dir = 'ltr';

                // Main Account
                const accCell = document.createElement('td');
                accCell.innerHTML = `<span class="small d-block fw-semibold">${inv.account_name}</span><span class="text-muted" style="font-size:0.75rem;" dir="ltr">${inv.main_account}</span>`;

                // Description
                const descCell = textElement('td', inv.description || '—', 'small');

                // Net Amount
                const amtCell = textElement('td', money.format(inv.line_amount || 0), 'text-end fw-bold');
                amtCell.dir = 'ltr';

                // Tax Amount
                const taxCell = textElement('td', money.format(inv.sales_tax_amount || 0), 'text-end text-muted small');
                taxCell.dir = 'ltr';

                // Gross Amount
                const grossVal = (Number(inv.line_amount) || 0) + (Number(inv.sales_tax_amount) || 0);
                const grossCell = textElement('td', money.format(grossVal), 'text-end fw-bold text-success');
                grossCell.dir = 'ltr';

                row.append(shCell, invCell, dateCell, accCell, descCell, amtCell, taxCell, grossCell);
                body.append(row);
            });
        }

        const searchInput = element('financeContractorModalSearch');
        if (searchInput) {
            searchInput.value = '';
            searchInput.oninput = () => renderInvoicesTable(searchInput.value);
        }

        renderInvoicesTable();

        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }
    }

    function renderOverviewCharts(overview, showrooms, additional, maintData) {
        if (typeof Chart === 'undefined') return;

        // 1. OPEX Donut Chart
        const donutCtx = element('financeOpexDonutChart')?.getContext('2d');
        if (donutCtx) {
            if (chartInstances.opexDonut) {
                chartInstances.opexDonut.destroy();
            }

            const categories = overview?.categories || [];
            let labels = [];
            let values = [];

            if (categories.length) {
                labels = categories.slice(0, 7).map(c => c.name || c.main_account_id || 'مصروف تشغيلي');
                values = categories.slice(0, 7).map(c => Math.abs(Number(c.amount) || 0));
            } else {
                labels = ['مصاريف تشغيلية'];
                values = [Number(overview?.summary?.non_sales_expenses) || 1];
            }

            chartInstances.opexDonut = new Chart(donutCtx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: [
                            '#fe7900', '#3b82f6', '#10b981', '#f59e0b',
                            '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'
                        ],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                boxWidth: 12,
                                font: { family: 'Tajawal', size: 11 },
                                color: '#4b5563'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.label}: ${money.format(ctx.raw)} SAR`
                            }
                        }
                    },
                    cutout: '68%'
                }
            });
        }

        // 2. Showroom Expense & Performance Comparison (Bar Chart)
        const barCtx = element('financeEbitdaBarChart')?.getContext('2d');
        if (barCtx) {
            if (chartInstances.ebitdaBar) {
                chartInstances.ebitdaBar.destroy();
            }

            const rawShowrooms = Array.isArray(showrooms?.data) ? showrooms.data : (Array.isArray(showrooms?.showrooms) ? showrooms.showrooms : (Array.isArray(showrooms) ? showrooms : []));
            const shList = rawShowrooms.filter(s => Number(s.non_sales_amount) > 0);
            const sorted = [...shList].sort((a, b) => (Number(b.non_sales_amount) || 0) - (Number(a.non_sales_amount) || 0));
            const top5 = sorted.slice(0, 5);
            const bottom5 = sorted.slice(-5).reverse();
            const combined = [...top5, ...bottom5];

            const barLabels = combined.map(s => s.name || s.number);
            const barValues = combined.map(s => Number(s.non_sales_amount || 0));
            const barColors = combined.map((s, idx) => idx < top5.length ? 'rgba(254, 121, 0, 0.85)' : 'rgba(59, 130, 246, 0.85)');

            chartInstances.ebitdaBar = new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels: barLabels,
                    datasets: [{
                        label: 'المصروفات التشغيلية المعتمدة (SAR)',
                        data: barValues,
                        backgroundColor: barColors,
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` المصروف المعتمد: ${money.format(ctx.raw)} SAR`
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                font: { family: 'Tajawal', size: 10 },
                                callback: val => (val >= 1000 ? (val / 1000) + 'k' : val)
                            },
                            grid: { color: 'rgba(0,0,0,0.04)' }
                        },
                        y: {
                            ticks: { font: { family: 'Tajawal', size: 10 } },
                            grid: { display: false }
                        }
                    }
                }
            });
        }
    }

    function renderMaintenanceChart(trendData) {
        if (typeof Chart === 'undefined') return;
        const ctx = element('financeMaintTrendChart')?.getContext('2d');
        if (!ctx) return;

        if (chartInstances.maintTrend) {
            chartInstances.maintTrend.destroy();
        }

        const data = [...(trendData || [])].reverse();
        const labels = data.map(t => t.period_month);
        const values = data.map(t => Number(t.total_amount) || 0);

        chartInstances.maintTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'تكلفة الصيانة الشهرية (SAR)',
                    data: values,
                    borderColor: '#fe7900',
                    backgroundColor: 'rgba(254, 121, 0, 0.12)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2.5,
                    pointRadius: 4,
                    pointBackgroundColor: '#fe7900'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` التكلفة: ${money.format(ctx.raw)} SAR`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { font: { family: 'Tajawal', size: 9 } },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            font: { family: 'Tajawal', size: 9 },
                            callback: val => (val >= 1000 ? (val / 1000) + 'k' : val)
                        },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    }
                }
            }
        });
    }

    function exportShowroom360Pack(payload, pnl) {
        if (!payload || !payload.showroom) {
            alert('يرجى فتح ملف المعرض أولاً لتصدير البيانات.');
            return;
        }
        if (typeof XLSX === 'undefined') {
            alert('مكتبة تصدير Excel غير محملة.');
            return;
        }

        const sh = payload.showroom;
        const pnlSum = pnl?.summary || {};
        const hasPnl = pnl?.state === 'ready' && pnlSum.revenue_available;

        const wb = XLSX.utils.book_new();

        // Sheet 1: Showroom P&L
        const pnlRows = [
            { "البند المالي": "اسم المعرض / الفرع", "القيمة بالريال": sh.name, "ملاحظات": `كود الفرع: ${sh.branch_dimension || sh.number}` },
            { "البند المالي": "الفترة المالية", "القيمة بالريال": `${payload.period?.start || ''} إلى ${payload.period?.end || ''}`, "ملاحظات": "تاريخ الحركة" },
            { "البند المالي": "إيرادات مبيعات المعرض (Sales Revenue)", "القيمة بالريال": hasPnl ? Number(pnlSum.revenue || 0) : "غير متوفر", "ملاحظات": "إجمالي المبيعات المعتمدة" },
            { "البند المالي": "تكلفة شراء البضاعة المباعة (COGS)", "القيمة بالريال": hasPnl ? Number(pnlSum.cogs || 0) : "غير متوفر", "ملاحظات": "تكلفة المخزون المباع" },
            { "البند المالي": "مجمل الربح التجاري (Gross Profit)", "القيمة بالريال": hasPnl ? Number(pnlSum.gross_profit || 0) : "غير متوفر", "ملاحظات": hasPnl ? `الهامش: ${pnlSum.gross_margin_pct || 0}%` : "—" },
            { "البند المالي": "مصروف إيجار المعرض الشهري", "القيمة بالريال": Number(pnlSum.lease_amortization || payload.summary?.upcoming_lease_amount || 0), "ملاحظات": "إيجار الفرع" },
            { "البند المالي": "رواتب ومنافع موظفي المعرض", "القيمة بالريال": Number(pnlSum.salaries_expense || 0), "ملاحظات": "رواتب كادر المعرض" },
            { "البند المالي": "مصاريف الصيانة والخدمات", "القيمة بالريال": Number(pnlSum.maintenance_expense || 0), "ملاحظات": "صيانة وتشغيل" },
            { "البند المالي": "استهلاك وإهلاك الديكور والأصول", "القيمة بالريال": Number(pnlSum.depreciation_expense || 0), "ملاحظات": "إهلاك دفتري" },
            { "البند المالي": "مصاريف تشغيلية أخرى", "القيمة بالريال": Number(pnlSum.other_opex || 0), "ملاحظات": "كهرباء، ضيافة، عُدد" },
            { "البند المالي": "إجمالي المصاريف التشغيلية المعتمدة", "القيمة بالريال": Number(pnlSum.total_expense || payload.summary?.trial_balance_expense || 0), "ملاحظات": "المصروفات المعتمدة" },
            { "البند المالي": "صافي الربح التشغيلي للمعرض (EBITDA)", "القيمة بالريال": hasPnl ? Number(pnlSum.operating_result || 0) : "—", "ملاحظات": hasPnl ? `هامش EBITDA: ${pnlSum.ebitda_margin_pct || 0}%` : "—" }
        ];
        const wsPnl = XLSX.utils.json_to_sheet(pnlRows);
        XLSX.utils.book_append_sheet(wb, wsPnl, "قائمة الدخل والربحية");

        // Sheet 2: Expense Categories (Trial Balance breakdown for this showroom)
        const expRows = (payload.expense_categories || []).map(cat => ({
            "رقم الحساب المحاسبي": cat.main_account_id,
            "التصنيف والبيان": cat.category,
            "المبالغ المصروفة (مدين)": Number(cat.debit_amount || 0),
            "المبالغ المسددة / المستردة (دائن)": Number(cat.credit_amount || 0),
            "صافي المصروف الفعلي": Number(cat.net_amount || 0)
        }));
        const wsExp = XLSX.utils.json_to_sheet(expRows.length ? expRows : [{ "ملاحظة": "لا توجد مصاريف تشغيلية مسجلة لهذا المعرض في الفترة" }]);
        XLSX.utils.book_append_sheet(wb, wsExp, "تفاصيل المصروفات المعتمدة");

        // Sheet 3: Leases
        const leaseRows = (payload.leases || []).map(l => ({
            "رقم العقد": l.lease_id,
            "الوصف وبيان المعرض": l.description || '—',
            "حساب المؤجر": l.vendor_account_number || '—',
            "الدفعة الشهرية المستهلكة": Number(l.payment_amount || 0),
            "الرصيد المتبقي من العقد": Number(l.remaining_balance || 0),
            "تاريخ البداية": l.commencement_date || '—',
            "تاريخ النهاية": l.expiration_date || '—',
            "حالة العقد": l.lease_status || 'Open',
            "دفعات مستحقة قادمة": Number(l.upcoming_payment_amount || 0)
        }));
        const wsLeases = XLSX.utils.json_to_sheet(leaseRows.length ? leaseRows : [{ "ملاحظة": "لا توجد عقود إيجار مسجلة لهذا المعرض" }]);
        XLSX.utils.book_append_sheet(wb, wsLeases, "عقود الإيجار");

        // Sheet 4: Fixed Assets
        const assetRows = (payload.assets || []).map(a => ({
            "رقم الأصل في النظام": a.fixed_asset_number,
            "اسم ووصف الأصل": a.name,
            "التصنيف المحاسبي للأصل": a.fixed_asset_group_id || '—',
            "الموقع / المعرض": a.asset_location_name || a.asset_location_id || sh.branch_dimension,
            "تاريخ الشراء / الاقتناء": a.acquisition_date || '—',
            "تكلفة الشراء الأصلية": Number(a.acquisition_price || 0),
            "القيمة الدفترية الصافية (NBV)": Number(a.net_book_value || 0)
        }));
        const wsAssets = XLSX.utils.json_to_sheet(assetRows.length ? assetRows : [{ "ملاحظة": "لا توجد أصول ثابتة مرتبطة بهذا المعرض" }]);
        XLSX.utils.book_append_sheet(wb, wsAssets, "الأصول الثابتة والممتلكات");

        // Sheet 5: Vendor Invoices
        const invRows = (payload.vendor_invoices || []).map(inv => ({
            "رقم الفاتورة": inv.invoice_id,
            "حساب المورد": inv.invoice_account,
            "اسم المورد / المقاول": inv.vendor_name,
            "تاريخ الفاتورة": inv.invoice_date,
            "موعد السداد (الاستحقاق)": inv.due_date || '—',
            "أمر الشراء (التعميد)": inv.purchase_order_number || '—',
            "البيان / الوصف": inv.description || '—',
            "المبلغ المعتمد للفرع": Number(inv.allocated_amount || 0),
            "ضريبة القيمة المضافة": Number(inv.allocated_tax_amount || 0),
            "الإجمالي شامل الضريبة": Number(inv.allocated_amount || 0) + Number(inv.allocated_tax_amount || 0)
        }));
        const wsInvs = XLSX.utils.json_to_sheet(invRows.length ? invRows : [{ "ملاحظة": "لا توجد فواتير موردين موزعة على هذا المعرض في الفترة" }]);
        XLSX.utils.book_append_sheet(wb, wsInvs, "فواتير الموردين والمقاولين");

        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `Orange_Showroom_360_${sh.branch_dimension || sh.number}_${dateStr}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    function exportMaintenanceExecutiveReport() {
        if (!currentMaintenance || !currentMaintenance.showrooms) {
            alert('لا توجد بيانات صيانة متاحة للتصدير.');
            return;
        }
        if (typeof XLSX === 'undefined') {
            alert('مكتبة تصدير Excel غير محملة.');
            return;
        }

        const wb = XLSX.utils.book_new();

        // Sheet 1: Showrooms Benchmark
        const shRows = (currentMaintenance.showrooms || []).map(sh => ({
            "كود الفرع": sh.branch_code,
            "اسم المعرض": sh.showroom_name,
            "مبيعات المعرض": Number(sh.sales_revenue || 0),
            "صيانة معارض (560019)": Number(sh.showroom_maint_amount || 0),
            "صيانة أجهزة وإلكترونيات (560014)": Number(sh.electronic_maint_amount || 0),
            "صيانة أخرى ومصاريف": Number(sh.other_maint_amount || 0),
            "إجمالي مصاريف الصيانة": Number(sh.total_maintenance_amount || 0),
            "نسبة الصيانة من المبيعات %": Number(sh.maintenance_ratio_pct || 0),
            "عدد الفواتير": Number(sh.invoice_count || 0)
        }));
        const wsSh = XLSX.utils.json_to_sheet(shRows);
        XLSX.utils.book_append_sheet(wb, wsSh, "ملخص المعارض");

        // Sheet 2: Top Contractors
        const cRows = (currentMaintenance.contractors || []).map(c => ({
            "كود المورد / المقاول": c.invoice_account,
            "اسم المقاول": c.vendor_name,
            "عدد الفواتير": Number(c.invoice_count || 0),
            "المعارض المخدومة": Number(c.showrooms_served || 0),
            "إجمالي المبالغ": Number(c.total_amount || 0),
            "إجمالي الضريبة": Number(c.total_tax || 0),
            "الإجمالي شامل الضريبة": Number(c.total_amount || 0) + Number(c.total_tax || 0)
        }));
        const wsC = XLSX.utils.json_to_sheet(cRows);
        XLSX.utils.book_append_sheet(wb, wsC, "كبار المقاولين");

        // Sheet 3: Detailed Invoices
        const invRows = (currentMaintenance.recent_invoices || []).map(inv => ({
            "كود الفرع": inv.branch_code,
            "اسم المعرض": inv.showroom_name,
            "رقم الفاتورة": inv.invoice_id,
            "كود المقاول": inv.invoice_account,
            "اسم المقاول / المورد": inv.vendor_name,
            "تاريخ الفاتورة": inv.invoice_date,
            "رقم الحساب": inv.main_account,
            "اسم الحساب المحاسبي": inv.account_name,
            "البيان / الوصف": inv.description || '—',
            "المبلغ": Number(inv.line_amount || 0),
            "الضريبة": Number(inv.sales_tax_amount || 0),
            "الإجمالي شامل الضريبة": Number(inv.line_amount || 0) + Number(inv.sales_tax_amount || 0)
        }));
        const wsInv = XLSX.utils.json_to_sheet(invRows);
        XLSX.utils.book_append_sheet(wb, wsInv, "سجل الفواتير التفصيلي");

        // Sheet 4: Monthly Trend
        const trendRows = (currentMaintenance.monthly_trend || []).map(t => ({
            "الشهر": t.period_month,
            "عدد الفواتير": Number(t.invoice_count || 0),
            "المعارض النشطة": Number(t.active_showrooms || 0),
            "إجمالي تكلفة الصيانة": Number(t.total_amount || 0)
        }));
        const wsTrend = XLSX.utils.json_to_sheet(trendRows);
        XLSX.utils.book_append_sheet(wb, wsTrend, "التطور الشهري");

        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `Orange_Maintenance_Executive_Report_${dateStr}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    async function load() {
        if (loading || !window.FinancePlatformApi) return;
        loading = true;
        setState('loading', 'جارٍ تحديث البيانات');
        const button = element('financePlatformRefresh');
        button.disabled = true;
        try {
            const params = periodParams();
            const [
                overview, showrooms, vendorInvoices, leases, leaseInsights, apAging,
                vendorAnalytics, trend, additional, fixedAssets, advances, purchases,
                inventory, treasury, taxHub, maintData
            ] = await Promise.all([
                window.FinancePlatformApi.overview(params),
                window.FinancePlatformApi.showrooms({ ...params, page: 1, page_size: 100 }),
                window.FinancePlatformApi.vendorInvoices({ page: 1, page_size: 100 }),
                window.FinancePlatformApi.leases({ horizon_days: 90 }),
                window.FinancePlatformApi.leaseInsights({})
                    .catch(() => ({ configured: false })),
                window.FinancePlatformApi.apAging({})
                    .catch(() => ({ configured: false })),
                window.FinancePlatformApi.vendorAnalytics({ vendor_limit: 50, invoice_limit: 50 })
                    .catch(() => ({ configured: false, vendors: [], open_invoices: [] })),
                window.FinancePlatformApi.trialBalanceTrend({
                    start: '2025-01-01', end: element('financePlatformEnd').value
                }).catch(() => ({ state: 'unavailable', data: [] })),
                window.FinancePlatformApi.additionalAnalytics({
                    as_of: element('financePlatformEnd').value,
                    month: element('financePlatformEnd').value.slice(0, 7)
                }).catch(() => ({ state: 'partial', sections: {} })),
                window.FinancePlatformApi.fixedAssets()
                    .catch(() => ({ state: 'unavailable', data: [] })),
                window.FinancePlatformApi.employeeAdvances()
                    .catch(() => ({ state: 'unavailable', data: [] })),
                window.FinancePlatformApi.purchaseOrders()
                    .catch(() => ({ state: 'unavailable', data: [] })),
                window.FinancePlatformApi.inventoryValuation()
                    .catch(() => ({ state: 'unavailable', data: [] })),
                window.FinancePlatformApi.cashAndGateways()
                    .catch(() => ({ state: 'unavailable', data: [] })),
                window.FinancePlatformApi.vatHub()
                    .catch(() => ({ state: 'unavailable', data: [] })),
                window.FinancePlatformApi.maintenanceAnalytics(params)
                    .catch(() => ({ state: 'unavailable', showrooms: [], contractors: [], monthly_trend: [], recent_invoices: [], summary: {} }))
            ]);
            renderOverview(overview);
            renderOverviewCharts(overview, showrooms, additional, maintData);
            renderShowrooms(showrooms, overview.summary?.expense_scope_status);
            renderVendorInvoices(vendorInvoices);
            renderLeases(leases);
            renderLeaseInsights(leaseInsights);
            renderApAging(apAging);
            renderVendorAnalytics(vendorAnalytics);
            renderTrialBalanceTrend(trend);
            renderAdditionalAnalytics(additional);
            renderFixedAssets(fixedAssets);
            renderEmployeeAdvances(advances);
            renderPurchaseOrders(purchases);
            renderInventoryValuation(inventory);
            renderCashAndGateways(treasury);
            renderVatHub(taxHub);
            renderMaintenance(maintData);
        } catch (error) {
            renderError(error);
        } finally {
            loading = false;
            button.disabled = false;
        }
    }

    function switchSubtab(tabName) {
        const validTabs = ['overview', 'showrooms', 'ap', 'leases', 'assets', 'advances', 'purchases', 'inventory', 'treasury', 'tax', 'maintenance'];
        if (!validTabs.includes(tabName)) tabName = 'overview';

        document.querySelectorAll('.finance-subnav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subtab === tabName);
        });

        document.querySelectorAll('.finance-tab-pane').forEach(pane => {
            pane.hidden = (pane.dataset.pane !== tabName);
        });

        if (window.location.hash !== `#${tabName}`) {
            history.replaceState(null, '', `#${tabName}`);
        }
    }

    function initSubnav() {
        document.querySelectorAll('.finance-subnav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                switchSubtab(btn.dataset.subtab);
            });
        });

        document.querySelectorAll('[data-goto-tab]').forEach(el => {
            el.addEventListener('click', () => {
                const targetTab = el.dataset.gotoTab;
                if (targetTab) {
                    switchSubtab(targetTab);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        });

        const initialHash = (window.location.hash || '').replace('#', '');
        if (['overview', 'showrooms', 'ap', 'leases', 'assets', 'advances', 'purchases', 'inventory', 'treasury', 'tax', 'maintenance'].includes(initialHash)) {
            switchSubtab(initialHash);
        } else {
            switchSubtab('overview');
        }

        window.addEventListener('hashchange', () => {
            const currentHash = (window.location.hash || '').replace('#', '');
            if (['overview', 'showrooms', 'ap', 'leases', 'assets', 'advances', 'purchases', 'inventory', 'treasury', 'tax', 'maintenance'].includes(currentHash)) {
                switchSubtab(currentHash);
            }
        });
    }

    function applyPreset(presetName) {
        const today = new Date();
        let start, end;

        if (presetName === 'thisMonth') {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = today;
        } else if (presetName === 'lastMonth') {
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
        } else if (presetName === 'thisQuarter') {
            const currentQuarter = Math.floor(today.getMonth() / 3);
            start = new Date(today.getFullYear(), currentQuarter * 3, 1);
            end = today;
        } else if (presetName === 'ytd') {
            start = new Date(today.getFullYear(), 0, 1);
            end = today;
        } else if (presetName === 'lastYear') {
            start = new Date(today.getFullYear() - 1, 0, 1);
            end = new Date(today.getFullYear() - 1, 11, 31);
        } else if (presetName === 'last30days') {
            start = new Date();
            start.setDate(today.getDate() - 30);
            end = today;
        }

        if (start && end) {
            element('financePlatformStart').value = isoDate(start);
            element('financePlatformEnd').value = isoDate(end);

            document.querySelectorAll('.finance-preset-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.preset === presetName);
            });

            load();
        }
    }

    function initialize() {
        if (initialized) return;
        initialized = true;
        setDefaultPeriod();
        initSubnav();

        document.querySelectorAll('.finance-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
        });

        const showroomsSearch = element('financeShowroomsSearch');
        const showroomsSearchClear = element('financeShowroomsSearchClear');
        const showroomsStatus = element('financeShowroomsStatusFilter');

        if (showroomsSearch) {
            showroomsSearch.addEventListener('input', () => {
                filters.showrooms.search = showroomsSearch.value;
                if (showroomsSearchClear) showroomsSearchClear.hidden = !showroomsSearch.value;
                filterAndRenderShowrooms();
            });
        }
        if (showroomsSearchClear) {
            showroomsSearchClear.addEventListener('click', () => {
                if (showroomsSearch) showroomsSearch.value = '';
                filters.showrooms.search = '';
                showroomsSearchClear.hidden = true;
                filterAndRenderShowrooms();
            });
        }
        if (showroomsStatus) {
            showroomsStatus.addEventListener('change', () => {
                filters.showrooms.status = showroomsStatus.value;
                filterAndRenderShowrooms();
            });
        }

        const invoicesSearch = element('financeInvoicesSearch');
        const invoicesSearchClear = element('financeInvoicesSearchClear');
        const invoicesStatus = element('financeInvoicesStatusFilter');

        if (invoicesSearch) {
            invoicesSearch.addEventListener('input', () => {
                filters.invoices.search = invoicesSearch.value;
                if (invoicesSearchClear) invoicesSearchClear.hidden = !invoicesSearch.value;
                filterAndRenderInvoices();
            });
        }
        if (invoicesSearchClear) {
            invoicesSearchClear.addEventListener('click', () => {
                if (invoicesSearch) invoicesSearch.value = '';
                filters.invoices.search = '';
                invoicesSearchClear.hidden = true;
                filterAndRenderInvoices();
            });
        }
        if (invoicesStatus) {
            invoicesStatus.addEventListener('change', () => {
                filters.invoices.status = invoicesStatus.value;
                filterAndRenderInvoices();
            });
        }

        const assetsSearch = element('financeAssetsSearch');
        const assetsSearchClear = element('financeAssetsSearchClear');
        const assetsGroup = element('financeAssetsGroupFilter');
        const assetsScope = element('financeAssetsScopeFilter');

        if (assetsSearch) {
            assetsSearch.addEventListener('input', () => {
                filters.assets.search = assetsSearch.value;
                if (assetsSearchClear) assetsSearchClear.hidden = !assetsSearch.value;
                filterAndRenderAssets();
            });
        }
        if (assetsSearchClear) {
            assetsSearchClear.addEventListener('click', () => {
                if (assetsSearch) assetsSearch.value = '';
                filters.assets.search = '';
                assetsSearchClear.hidden = true;
                filterAndRenderAssets();
            });
        }
        if (assetsGroup) {
            assetsGroup.addEventListener('change', () => {
                filters.assets.group = assetsGroup.value;
                filterAndRenderAssets();
            });
        }
        if (assetsScope) {
            assetsScope.addEventListener('change', () => {
                filters.assets.scope = assetsScope.value;
                filterAndRenderAssets();
            });
        }


        const advancesSearch = element('financeAdvancesSearch');
        const advancesSearchClear = element('financeAdvancesSearchClear');
        const advancesAccount = element('financeAdvancesAccountFilter');
        const advancesStatus = element('financeAdvancesStatusFilter');

        const advLoansBtn = element('financeAdvCategoryLoansBtn');
        const advExpBtn = element('financeAdvCategoryExpensesBtn');
        const advAllBtn = element('financeAdvCategoryAllBtn');

        if (advLoansBtn) {
            advLoansBtn.addEventListener('click', () => updateAdvancesCategoryUi('loans'));
        }
        if (advExpBtn) {
            advExpBtn.addEventListener('click', () => updateAdvancesCategoryUi('expenses'));
        }
        if (advAllBtn) {
            advAllBtn.addEventListener('click', () => updateAdvancesCategoryUi('all'));
        }

        if (advancesSearch) {
            advancesSearch.addEventListener('input', () => {
                filters.advances.search = advancesSearch.value;
                if (advancesSearchClear) advancesSearchClear.hidden = !advancesSearch.value;
                filterAndRenderAdvances();
            });
        }
        if (advancesSearchClear) {
            advancesSearchClear.addEventListener('click', () => {
                if (advancesSearch) advancesSearch.value = '';
                filters.advances.search = '';
                advancesSearchClear.hidden = true;
                filterAndRenderAdvances();
            });
        }
        if (advancesAccount) {
            advancesAccount.addEventListener('change', () => {
                filters.advances.account = advancesAccount.value;
                filterAndRenderAdvances();
            });
        }
        if (advancesStatus) {
            advancesStatus.addEventListener('change', () => {
                filters.advances.status = advancesStatus.value;
                filterAndRenderAdvances();
            });
        }

        const purchasesSearch = element('financePurchasesSearch');
        const purchasesSearchClear = element('financePurchasesSearchClear');
        const purchasesStatus = element('financePurchasesStatusFilter');

        if (purchasesSearch) {
            purchasesSearch.addEventListener('input', () => {
                filters.purchases.search = purchasesSearch.value;
                if (purchasesSearchClear) purchasesSearchClear.hidden = !purchasesSearch.value;
                filterAndRenderPurchases();
            });
        }
        if (purchasesSearchClear) {
            purchasesSearchClear.addEventListener('click', () => {
                if (purchasesSearch) purchasesSearch.value = '';
                filters.purchases.search = '';
                purchasesSearchClear.hidden = true;
                filterAndRenderPurchases();
            });
        }
        if (purchasesStatus) {
            purchasesStatus.addEventListener('change', () => {
                filters.purchases.status = purchasesStatus.value;
                filterAndRenderPurchases();
            });
        }

        const inventorySearch = element('financeInventorySearch');
        const inventorySearchClear = element('financeInventorySearchClear');

        if (inventorySearch) {
            inventorySearch.addEventListener('input', () => {
                filters.inventory.search = inventorySearch.value;
                if (inventorySearchClear) inventorySearchClear.hidden = !inventorySearch.value;
                filterAndRenderInventory();
            });
        }
        if (inventorySearchClear) {
            inventorySearchClear.addEventListener('click', () => {
                if (inventorySearch) inventorySearch.value = '';
                filters.inventory.search = '';
                inventorySearchClear.hidden = true;
                filterAndRenderInventory();
            });
        }

        const maintSearch = element('financeMaintSearch');
        const maintSearchClear = element('financeMaintSearchClear');

        if (maintSearch) {
            maintSearch.addEventListener('input', () => {
                filters.maintenance.search = maintSearch.value;
                if (maintSearchClear) maintSearchClear.hidden = !maintSearch.value;
                filterAndRenderMaintenanceShowrooms();
            });
        }
        if (maintSearchClear) {
            maintSearchClear.addEventListener('click', () => {
                if (maintSearch) maintSearch.value = '';
                filters.maintenance.search = '';
                maintSearchClear.hidden = true;
                filterAndRenderMaintenanceShowrooms();
            });
        }

        document.querySelectorAll('th.finance-sortable').forEach(th => {
            th.addEventListener('click', () => {
                const table = th.dataset.table;
                const key = th.dataset.sort;
                if (!table || !key) return;
                if (sortState[table]?.key === key) {
                    sortState[table].dir = sortState[table].dir === 'asc' ? 'desc' : 'asc';
                } else {
                    sortState[table] = { key, dir: 'asc' };
                }
                if (table === 'showrooms') filterAndRenderShowrooms();
                else if (table === 'invoices') filterAndRenderInvoices();
                else if (table === 'topVendors') sortAndRenderTopVendors();
                else if (table === 'leases') sortAndRenderLeases();
                else if (table === 'assets') filterAndRenderAssets();
                else if (table === 'advances') filterAndRenderAdvances();
                else if (table === 'purchases') filterAndRenderPurchases();
                else if (table === 'inventory') filterAndRenderInventory();
                else if (table === 'maintenance') filterAndRenderMaintenanceShowrooms();
            });
        });

        element('financePlatformRefresh').addEventListener('click', load);
        element('financePlatformApplyPeriod').addEventListener('click', () => {
            document.querySelectorAll('.finance-preset-btn').forEach(btn => btn.classList.remove('active'));
            load();
        });
        element('financeShowroomClose').addEventListener('click', closeShowroomDetail);
        element('financeShowroomBackdrop').addEventListener('click', closeShowroomDetail);

        const showroomExportBtn = element('financeShowroomExportPackBtn');
        if (showroomExportBtn) {
            showroomExportBtn.addEventListener('click', () => {
                if (currentShowroomPayload) {
                    exportShowroom360Pack(currentShowroomPayload, currentShowroomPnl);
                } else {
                    alert('يرجى فتح تفاصيل أحد المعارض أولاً لتصدير ملفه.');
                }
            });
        }

        const maintExportBtn = element('financeMaintExportReportBtn');
        if (maintExportBtn) {
            maintExportBtn.addEventListener('click', () => {
                exportMaintenanceExecutiveReport();
            });
        }



        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !element('financeShowroomDrawer').hidden) {
                closeShowroomDetail();
            }
        });
        element('platform-tab').addEventListener('shown.bs.tab', load);
        load();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
