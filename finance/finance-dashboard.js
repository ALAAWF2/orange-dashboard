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

    const sortState = {
        showrooms: { key: 'name', dir: 'asc' },
        invoices: { key: 'invoice_date', dir: 'desc' },
        topVendors: { key: 'remaining_amount', dir: 'desc' },
        leases: { key: 'expiration_date', dir: 'asc' },
        assets: { key: 'fixed_asset_group_id', dir: 'asc' },
        advances: { key: 'start_date', dir: 'desc' },
        purchases: { key: 'accounting_date', dir: 'desc' },
        inventory: { key: 'total_retail_value', dir: 'desc' }
    };

    const filters = {
        showrooms: { search: '', status: 'all' },
        invoices: { search: '', status: 'all' },
        assets: { search: '', group: 'all', scope: 'all' },
        advances: { search: '', type: 'all', status: 'all' },
        purchases: { search: '', status: 'all' },
        inventory: { search: '' }
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
            const params = { ...periodParams(), horizon_days: 90 };
            const [payload, pnl] = await Promise.all([
                window.FinancePlatformApi.showroomDetail(showroomNumber, params),
                window.FinancePlatformApi.showroomPnl(showroomNumber, params)
                    .catch(() => ({ state: 'unavailable' }))
            ]);
            renderShowroomDetail(payload);
            appendShowroomPnl(pnl);
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

    async function openEmployeeAdvanceDetailsModal(workerId) {
        const modalEl = element('financeAdvanceDetailsModal');
        if (!modalEl) return;
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        const nameEl = element('financeAdvanceModalWorkerName');
        const summaryEl = element('financeAdvanceModalSummary');
        const linesBodyEl = element('financeAdvanceModalLinesBody');

        nameEl.textContent = `تفاصيل حركات الموظف: ${workerId}`;
        summaryEl.innerHTML = '<div class="text-muted">جارٍ تحميل كشف الحساب والبيانات المحاسبية…</div>';
        linesBodyEl.innerHTML = '<tr><td colspan="7" class="finance-empty-state">جارٍ تحميل الحركات…</td></tr>';
        modal.show();

        try {
            const payload = await window.FinancePlatformApi.employeeAdvanceDetails(workerId);
            if (payload.state !== 'ready') {
                summaryEl.innerHTML = '<div class="alert alert-warning mb-0">لم يتم العثور على حركات مسجلة لهذا الموظف.</div>';
                linesBodyEl.innerHTML = '<tr><td colspan="7" class="finance-empty-state">لا توجد حركات.</td></tr>';
                return;
            }

            const bal = payload.balance || {};
            nameEl.textContent = `${bal.employee_name_arabic || 'الموظف'} (${bal.worker_id})`;

            summaryEl.innerHTML = `
                <div class="row g-3">
                    <div class="col-md-3">
                        <div class="p-3 border rounded-3 bg-light">
                            <span class="text-muted small d-block">إجمالي المنصرف (مدين)</span>
                            <strong class="fs-5">${money.format(Number(bal.total_debit) || 0)}</strong>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="p-3 border rounded-3 bg-light">
                            <span class="text-muted small d-block">إجمالي المستقطع (دائن)</span>
                            <strong class="fs-5 text-success">${money.format(Number(bal.total_credit) || 0)}</strong>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="p-3 border rounded-3 bg-light">
                            <span class="text-muted small d-block">رصيد الأستاذ العام (GL)</span>
                            <strong class="fs-5 ${Number(bal.gl_balance) > 0 ? 'text-danger' : 'text-success'}">${money.format(Number(bal.gl_balance) || 0)}</strong>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="p-3 border rounded-3 bg-light">
                            <span class="text-muted small d-block">تاريخ آخر حركة</span>
                            <strong class="fs-6 text-primary">${bal.last_movement_date || '—'}</strong>
                        </div>
                    </div>
                </div>
            `;

            const lines = payload.lines || [];
            if (!lines.length) {
                linesBodyEl.innerHTML = '<tr><td colspan="7" class="finance-empty-state">لا توجد قيود مسجلة لهذا الموظف.</td></tr>';
            } else {
                linesBodyEl.replaceChildren(...lines.map(line => {
                    const row = document.createElement('tr');
                    
                    const dateCell = document.createElement('td');
                    dateCell.dir = 'ltr';
                    dateCell.textContent = line.accounting_date || '—';

                    const journalCell = document.createElement('td');
                    journalCell.dir = 'ltr';
                    journalCell.textContent = line.journal_number || '—';

                    const voucherCell = document.createElement('td');
                    voucherCell.dir = 'ltr';
                    voucherCell.className = 'fw-bold';
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
                    classBadge.className = `badge ${line.classification === 'deduction' ? 'bg-success' : (line.classification === 'advance_or_loan' ? 'bg-primary' : 'bg-secondary')}`;
                    classBadge.textContent = line.classification === 'deduction' ? 'استقطاع راتب' : (line.classification === 'advance_or_loan' ? 'صرف سلفة/قرض' : 'حركة GL');
                    classCell.append(classBadge);

                    row.append(dateCell, journalCell, voucherCell, descCell, debitCell, creditCell, classCell);
                    return row;
                }));
            }
        } catch (err) {
            console.error('Failed to load employee advance details:', err);
            summaryEl.innerHTML = '<div class="alert alert-danger mb-0">تعذر تحميل تفاصيل حركات الموظف.</div>';
            linesBodyEl.innerHTML = '<tr><td colspan="7" class="finance-empty-state text-danger">حدث خطأ أثناء الاتصال بالخادم.</td></tr>';
        }
    }

    function filterAndRenderAdvances() {
        const body = element('financeAdvancesBody');
        if (!body) return;

        let list = [...currentAdvances];
        const search = (filters.advances?.search || '').toLowerCase().trim();
        const account = filters.advances?.account || 'all';
        const status = filters.advances?.status || 'all';

        if (account && account !== 'all') {
            list = list.filter(a => a.main_account_id === account);
        }

        if (status && status !== 'all') {
            list = list.filter(a => a.coverage_status === status);
        }

        if (search) {
            list = list.filter(a =>
                (a.worker_id || '').toLowerCase().includes(search) ||
                (a.employee_name || '').toLowerCase().includes(search) ||
                (a.last_voucher || '').toLowerCase().includes(search) ||
                (a.last_description || '').toLowerCase().includes(search)
            );
        }

        const badge = element('financeAdvancesCountBadge');
        if (badge) {
            badge.textContent = `${list.length} موظف`;
        }

        const sort = sortState.advances;
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
            body.innerHTML = '<tr><td colspan="10" class="finance-empty-state">لا توجد سلف أو عهد مطابقة للبحث.</td></tr>';
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
            nameCell.textContent = adv.employee_name || '—';

            const accCell = document.createElement('td');
            accCell.className = 'text-center';
            const accBadge = document.createElement('span');
            accBadge.className = `badge ${adv.main_account_id === '151102' ? 'bg-light text-primary border border-primary' : 'bg-light text-secondary border'}`;
            accBadge.textContent = adv.main_account_id === '151102' ? '151102 قروض وسلف' : (adv.main_account_id === '151101' ? '151101 عهد' : adv.main_account_id);
            accCell.append(accBadge);

            const debitCell = document.createElement('td');
            debitCell.className = 'text-end fw-bold';
            debitCell.dir = 'ltr';
            debitCell.textContent = money.format(Number(adv.total_debit) || 0);

            const creditCell = document.createElement('td');
            creditCell.className = 'text-end fw-bold text-success';
            creditCell.dir = 'ltr';
            creditCell.textContent = money.format(Number(adv.total_credit) || 0);

            const glCell = document.createElement('td');
            glCell.className = `text-end fw-bold ${Number(adv.gl_balance) > 0 ? 'text-danger' : 'text-success'}`;
            glCell.dir = 'ltr';
            glCell.textContent = money.format(Number(adv.gl_balance) || 0);

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
            statusBadge.className = `badge ${adv.coverage_status === 'active' ? 'bg-warning text-dark' : 'bg-success'}`;
            statusBadge.textContent = adv.coverage_status === 'active' ? 'رصيد قائم' : 'مسدد/مغطى';
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
        const s = payload.summary || {};
        setMetric('financeAdvancesTotalDebit', money.format(Number(s.total_debit) || 0));
        setMetric('financeAdvancesTotalCredit', money.format(Number(s.total_credit) || 0));
        setMetric('financeAdvancesTotalGlBalance', money.format(Number(s.total_gl_balance) || 0));
        setMetric('financeAdvancesActiveCount', `${integer.format(Number(s.active_count) || 0)} موظف`);
        setMetric('financeAdvancesSettledCount', `${integer.format(Number(s.settled_count) || 0)} رصيد مسدد/مغطى`);
        filterAndRenderAdvances();
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
        setMetric('financeTreasuryCashCount', `${integer.format(Number(s.cash_pos_count) || 0)} صندوق معرض`);
        setMetric('financeTreasuryBankCount', `${integer.format(Number(s.banks_count) || 0)} حساب بنكي`);
        setMetric('financeTreasuryGatewaysCount', `${integer.format(Number(s.gateways_count) || 0)} وسيط تحصيل`);

        const cashBody = element('financeTreasuryCashBody');
        if (cashBody && payload.cash_pos) {
            cashBody.replaceChildren(...payload.cash_pos.map(c => {
                const row = document.createElement('tr');
                row.append(
                    textElement('td', c.main_account_id, 'fw-bold font-monospace'),
                    textElement('td', c.account_name),
                    textElement('td', c.main_account_type || 'نقدية فروع')
                );
                return row;
            }));
        }

        const banksBody = element('financeTreasuryBanksBody');
        if (banksBody && payload.banks) {
            banksBody.replaceChildren(...payload.banks.map(b => {
                const row = document.createElement('tr');
                row.append(
                    textElement('td', b.main_account_id, 'fw-bold font-monospace'),
                    textElement('td', b.account_name),
                    textElement('td', b.main_account_type || 'بنك')
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

    async function load() {
        if (loading || !window.FinancePlatformApi) return;
        loading = true;
        setState('loading', 'جارٍ تحديث البيانات');
        const button = element('financePlatformRefresh');
        button.disabled = true;
        try {
            const params = periodParams();
            const [overview, showrooms, vendorInvoices, leases, leaseInsights, apAging, vendorAnalytics, trend, additional, fixedAssets, advances, purchases, inventory, treasury, taxHub] = await Promise.all([
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
                    .catch(() => ({ state: 'unavailable', data: [] }))
            ]);
            renderOverview(overview);
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
        } catch (error) {
            renderError(error);
        } finally {
            loading = false;
            button.disabled = false;
        }
    }

    function switchSubtab(tabName) {
        const validTabs = ['overview', 'showrooms', 'ap', 'leases', 'assets', 'advances', 'purchases', 'inventory', 'treasury', 'tax'];
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
        if (['overview', 'showrooms', 'ap', 'leases', 'assets', 'advances', 'purchases', 'inventory', 'treasury', 'tax'].includes(initialHash)) {
            switchSubtab(initialHash);
        } else {
            switchSubtab('overview');
        }

        window.addEventListener('hashchange', () => {
            const currentHash = (window.location.hash || '').replace('#', '');
            if (['overview', 'showrooms', 'ap', 'leases', 'assets', 'advances', 'purchases', 'inventory', 'treasury', 'tax'].includes(currentHash)) {
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
            });
        });

        element('financePlatformRefresh').addEventListener('click', load);
        element('financePlatformApplyPeriod').addEventListener('click', () => {
            document.querySelectorAll('.finance-preset-btn').forEach(btn => btn.classList.remove('active'));
            load();
        });
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
