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
            '<tr><td colspan="5" class="finance-empty-state">سجل المعارض جاهز للربط، ولم تُكتب بيانات Dynamics إلى PostgreSQL بعد.</td></tr>';
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
        setMetric('financeExpenseTotal', money.format(summary.non_sales_expenses || 0));
        setMetric('financeVendorBalance', money.format(summary.open_vendor_balance || 0));
        setMetric('financeVendorOpenCount', integer.format(summary.open_vendor_transactions || 0));
        setMetric('financeLeaseCount', integer.format(summary.active_leases || 0));
        setMetric('financeFixedAssetCount', integer.format(summary.fixed_assets || 0));
        element('financeSchemaCoverage').textContent =
            `${payload.present_table_count} / ${payload.expected_table_count}`;
        element('financePeriodLabel').textContent =
            `${payload.period?.start || '—'} — ${payload.period?.end || '—'}`;
        renderLastSync(payload.latest_sync);
        renderCategories(payload.categories || []);
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

    function renderCategories(categories) {
        const container = element('financeCategoryList');
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

    function renderShowrooms(payload) {
        if (!payload.configured) return;
        const body = element('financeShowroomsBody');
        const rows = payload.data || [];
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="5" class="finance-empty-state">لا توجد معارض مستوردة حتى الآن.</td></tr>';
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
            branch.textContent = showroom.branch_dimension || 'غير مربوط';
            const statusCell = document.createElement('td');
            const status = document.createElement('span');
            status.className = `finance-status-label${showroom.status === 'historical' ? ' is-historical' : ''}`;
            status.textContent = showroom.status === 'historical' ? 'تاريخي / مغلق' : 'حالي';
            statusCell.append(status);
            const amount = document.createElement('td');
            amount.className = 'text-end fw-bold';
            amount.dir = 'ltr';
            amount.textContent = money.format(Number(showroom.non_sales_amount) || 0);
            row.append(number, name, branch, statusCell, amount);
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
            '<tr><td colspan="5" class="finance-empty-state">تعذر تحميل سجل المعارض.</td></tr>';
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
            renderShowrooms(showrooms);
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
        element('platform-tab').addEventListener('shown.bs.tab', load);
        load();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
