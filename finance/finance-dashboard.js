(() => {
    'use strict';

    const money = new Intl.NumberFormat('ar-SA', {
        style: 'currency',
        currency: 'SAR',
        maximumFractionDigits: 0
    });
    const integer = new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 });
    const dateTime = new Intl.DateTimeFormat('ar-SA', {
        timeZone: 'Asia/Riyadh',
        calendar: 'gregory',
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    let loading = false;
    let initialized = false;

    function element(id) {
        return document.getElementById(id);
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
        state.className = `finance-state-chip is-${kind}`;
        state.replaceChildren();
        const dot = document.createElement('span');
        dot.className = 'finance-state-dot';
        state.append(dot, document.createTextNode(label));
    }

    function setMetric(id, value) {
        element(id).textContent = value;
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

    function renderSetupState(payload) {
        element('financeSetupNotice').hidden = false;
        setState('waiting', 'بانتظار تفعيل قاعدة Finance');
        resetMetrics();
        element('financeSchemaCoverage').textContent =
            `${payload.present_table_count || 0} / ${payload.expected_table_count || 0}`;
        element('financeLastSync').textContent = 'لم تبدأ بعد';
        element('financeCategoryList').innerHTML =
            '<div class="finance-empty-state">ستظهر التصنيفات بعد تطبيق migration واستيراد البيانات.</div>';
        element('financeShowroomsBody').innerHTML =
            '<tr><td colspan="6" class="finance-empty-state">سجل المعارض جاهز للربط، ولم تُكتب بيانات Dynamics إلى PostgreSQL بعد.</td></tr>';
        element('financeVendorInvoicesBody').innerHTML =
            '<tr><td colspan="5" class="finance-empty-state">تظهر الفواتير بعد استيراد AP.</td></tr>';
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
        element('financeSchemaCoverage').textContent =
            `${payload.present_table_count} / ${payload.expected_table_count}`;
        element('financePeriodLabel').textContent =
            `${payload.period?.start || '—'} — ${payload.period?.end || '—'}`;
        renderLastSync(payload.latest_sync);
        renderCategories(payload.categories || [], summary.expense_scope_status);
    }

    function renderLastSync(sync) {
        if (!sync?.started_at) {
            element('financeLastSync').textContent = 'لا توجد مزامنة ناجحة';
            return;
        }
        const parsed = new Date(sync.finished_at || sync.started_at);
        element('financeLastSync').textContent = Number.isNaN(parsed.getTime())
            ? 'مسجلة'
            : dateTime.format(parsed);
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

    function renderShowroomDetail(payload) {
        const showroom = payload.showroom || {};
        const summary = payload.summary || {};
        element('financeShowroomTitle').textContent = showroom.name || 'تفاصيل المعرض المالية';
        element('financeShowroomMeta').textContent =
            `Dynamics ${showroom.number || '—'} · Branch ${showroom.branch_dimension || '—'} · ${payload.period?.start || '—'} إلى ${payload.period?.end || '—'}`;

        const content = element('financeShowroomContent');
        content.replaceChildren();
        const cards = document.createElement('div');
        cards.className = 'finance-showroom-summary';
        [
            ['مصروف Trial Balance', money.format(Number(summary.trial_balance_expense) || 0)],
            ['فواتير المورد المرتبطة', integer.format(summary.vendor_invoice_count || 0)],
            ['عقود الإيجار', integer.format(summary.lease_count || 0)],
            ['الأصول المرتبطة', integer.format(summary.asset_count || 0)]
        ].forEach(([label, value]) => {
            const card = document.createElement('article');
            const labelNode = document.createElement('span');
            labelNode.textContent = label;
            const valueNode = document.createElement('strong');
            valueNode.textContent = value;
            card.append(labelNode, valueNode);
            cards.append(card);
        });
        content.append(cards);

        content.append(detailSection('حسابات المصروف من ميزان المراجعة', [
            { key: 'main_account_id', label: 'الحساب', ltr: true },
            { key: 'category', label: 'الوصف' },
            { key: 'debit_amount', label: 'مدين', money: true },
            { key: 'credit_amount', label: 'دائن', money: true },
            { key: 'net_amount', label: 'الصافي', money: true }
        ], payload.expense_categories || []));

        content.append(detailSection('فواتير الموردين المرتبطة ببُعد المعرض', [
            { key: 'invoice_id', label: 'الفاتورة', ltr: true },
            { key: 'invoice_account', label: 'المورد', ltr: true },
            { key: 'invoice_date', label: 'التاريخ', ltr: true },
            { key: 'due_date', label: 'الاستحقاق', ltr: true },
            { key: 'allocated_amount', label: 'المبلغ المرتبط', money: true },
            { key: 'allocated_tax_amount', label: 'الضريبة', money: true }
        ], payload.vendor_invoices || []));

        content.append(detailSection('عقود الإيجار والاستحقاقات', [
            { key: 'lease_id', label: 'العقد', ltr: true },
            { key: 'description', label: 'الوصف' },
            { key: 'expiration_date', label: 'الانتهاء', ltr: true },
            { key: 'remaining_balance', label: 'الرصيد', money: true },
            { key: 'upcoming_payment_amount', label: 'القادم خلال 90 يومًا', money: true }
        ], payload.leases || []));

        content.append(detailSection('الأصول المرتبطة مباشرة', [
            { key: 'fixed_asset_number', label: 'الأصل', ltr: true },
            { key: 'name', label: 'الاسم' },
            { key: 'asset_location_name', label: 'الموقع' },
            { key: 'acquisition_date', label: 'الاقتناء', ltr: true },
            { key: 'acquisition_price', label: 'قيمة الاقتناء', money: true }
        ], payload.assets || []));

        const coverage = document.createElement('p');
        coverage.className = 'finance-showroom-coverage';
        coverage.textContent = payload.coverage?.note || '';
        content.append(coverage);
    }

    async function openShowroomDetail(showroomNumber) {
        const drawer = element('financeShowroomDrawer');
        drawer.hidden = false;
        document.body.classList.add('finance-drawer-open');
        element('financeShowroomTitle').textContent = 'تفاصيل المعرض المالية';
        element('financeShowroomMeta').textContent = `Dynamics ${showroomNumber}`;
        element('financeShowroomContent').innerHTML =
            '<div class="finance-empty-state">جارٍ تحميل المصروفات والفواتير والعقود المرتبطة…</div>';
        try {
            const payload = await window.FinancePlatformApi.showroomDetail(showroomNumber, {
                ...periodParams(),
                horizon_days: 90
            });
            renderShowroomDetail(payload);
        } catch (error) {
            console.error('Finance showroom detail failed:', error);
            element('financeShowroomContent').innerHTML =
                '<div class="finance-empty-state">تعذر تحميل تفاصيل المعرض. تحقق من الاتصال والصلاحية.</div>';
        }
    }

    function renderShowrooms(payload, expenseScopeStatus) {
        if (!payload.configured) return;
        const body = element('financeShowroomsBody');
        const rows = payload.data || [];
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="6" class="finance-empty-state">لا توجد معارض مستوردة حتى الآن.</td></tr>';
            return;
        }
        body.replaceChildren(...rows.map(showroom => {
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
            const branchCode = document.createElement('span');
            branchCode.textContent = showroom.branch_dimension || '—';
            const branchStatus = document.createElement('small');
            branchStatus.className = showroom.branch_dimension ? 'is-linked' : 'is-unlinked';
            branchStatus.textContent = showroom.branch_dimension ? 'مربوط' : 'غير مربوط';
            branch.append(branchCode, branchStatus);
            const statusCell = document.createElement('td');
            const status = document.createElement('span');
            status.className = `finance-status-label${showroom.status === 'historical' ? ' is-historical' : ''}`;
            status.textContent = showroom.status === 'historical' ? 'تاريخي / مغلق' : 'حالي';
            statusCell.append(status);
            const amount = document.createElement('td');
            amount.className = 'text-end fw-bold';
            amount.dir = 'ltr';
            amount.textContent = expenseScopeStatus === 'approved'
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

    function renderVendorInvoices(payload) {
        const body = element('financeVendorInvoicesBody');
        if (!payload?.configured) return;
        const rows = payload.data || [];
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="5" class="finance-empty-state">لا توجد فواتير موردين مستوردة.</td></tr>';
            return;
        }
        body.replaceChildren(...rows.map(invoice => {
            const row = document.createElement('tr');
            const values = [
                invoice.invoice_id || '—',
                invoice.invoice_account || '—',
                invoice.invoice_date || '—',
                invoice.due_date || '—',
                money.format(Number(invoice.invoice_amount) || 0)
            ];
            values.forEach((value, index) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                if (index === 0 || index === 1) cell.dir = 'ltr';
                if (index === 4) cell.className = 'text-end fw-bold';
                row.append(cell);
            });
            return row;
        }));
    }

    function renderLeases(payload) {
        const body = element('financeLeasesBody');
        if (!payload?.configured) return;
        const rows = payload.data || [];
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="5" class="finance-empty-state">لا توجد عقود إيجار مستوردة.</td></tr>';
            return;
        }
        body.replaceChildren(...rows.slice(0, 50).map(lease => {
            const row = document.createElement('tr');
            const values = [
                lease.lease_id || '—',
                lease.description || '—',
                lease.expiration_date || '—',
                lease.lease_status || '—',
                money.format(Number(lease.upcoming_payment_amount) || 0)
            ];
            values.forEach((value, index) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                if (index === 0) cell.dir = 'ltr';
                if (index === 4) cell.className = 'text-end fw-bold';
                row.append(cell);
            });
            return row;
        }));
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
            '<tr><td colspan="5" class="finance-empty-state">تعذر تحميل فواتير الموردين.</td></tr>';
        element('financeLeasesBody').innerHTML =
            '<tr><td colspan="5" class="finance-empty-state">تعذر تحميل عقود الإيجار.</td></tr>';
    }

    async function load() {
        if (loading || !window.FinancePlatformApi) return;
        loading = true;
        setState('loading', 'جارٍ تحديث البيانات');
        const button = element('financePlatformRefresh');
        button.disabled = true;
        try {
            const params = periodParams();
            const [overview, showrooms, vendorInvoices, leases] = await Promise.all([
                window.FinancePlatformApi.overview(params),
                window.FinancePlatformApi.showrooms({ ...params, page: 1, page_size: 100 }),
                window.FinancePlatformApi.vendorInvoices({ page: 1, page_size: 25 }),
                window.FinancePlatformApi.leases({ horizon_days: 90 })
            ]);
            renderOverview(overview);
            renderShowrooms(showrooms, overview.summary?.expense_scope_status);
            renderVendorInvoices(vendorInvoices);
            renderLeases(leases);
        } catch (error) {
            renderError(error);
        } finally {
            loading = false;
            button.disabled = false;
        }
    }

    function initialize() {
        if (initialized) return;
        initialized = true;
        setDefaultPeriod();
        element('financePlatformRefresh').addEventListener('click', load);
        element('financePlatformApplyPeriod').addEventListener('click', load);
        element('financeShowroomClose').addEventListener('click', closeShowroomDetail);
        element('financeShowroomBackdrop').addEventListener('click', closeShowroomDetail);
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
