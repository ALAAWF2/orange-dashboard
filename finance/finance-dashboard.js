(() => {
    'use strict';

    const money = new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0
    });
    const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
    let loading = false;
    let initialized = false;

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

    async function openInvoiceLinesModal(sourceKey) {
        const modalEl = element('financeInvoiceLinesModal');
        if (!modalEl) return;
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        const headerEl = element('financeInvoiceLinesHeader');
        const bodyEl = element('financeInvoiceLinesBody');
        headerEl.innerHTML = 'جارٍ تحميل معلومات الفاتورة…';
        bodyEl.innerHTML = '<tr><td colspan="5" class="text-center text-muted">جارٍ تحميل أسطر الفاتورة…</td></tr>';
        modal.show();
        try {
            const payload = await window.FinancePlatformApi.vendorInvoiceLines(sourceKey);
            if (payload.state === 'not_found' || !payload.header) {
                headerEl.innerHTML = '<div class="alert alert-warning mb-0">لم يتم العثور على الفاتورة.</div>';
                bodyEl.innerHTML = '<tr><td colspan="5" class="text-center text-muted">لا توجد أسطر متاحة.</td></tr>';
                return;
            }
            const h = payload.header;
            headerEl.innerHTML = `
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div>
                        <strong class="fs-6">فاتورة: ${h.invoice_id || sourceKey}</strong>
                        <div class="text-muted small">المورد: ${h.vendor_name || h.invoice_account} (${h.invoice_account})</div>
                    </div>
                    <div class="text-end">
                        <div class="fw-bold text-primary">المبلغ الإجمالي: ${money.format(h.invoice_amount)} ${h.currency_code || 'SAR'}</div>
                        <div class="text-muted small">التاريخ: ${h.invoice_date || '—'} | الاستحقاق: ${h.due_date || '—'}</div>
                    </div>
                </div>
            `;
            const lines = payload.data || [];
            if (!lines.length) {
                bodyEl.innerHTML = '<tr><td colspan="5" class="text-center text-muted">لا توجد أسطر مسجلة في هذه الفاتورة.</td></tr>';
                return;
            }
            bodyEl.replaceChildren(...lines.map((line, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${idx + 1}</td>
                    <td>
                        <div class="fw-bold">${line.description || line.item_number || '—'}</div>
                        ${line.item_number ? `<small class="text-muted" dir="ltr">رمز الصنف: ${line.item_number}</small>` : ''}
                    </td>
                    <td>${line.procurement_category || '—'}</td>
                    <td class="text-end fw-bold" dir="ltr">${money.format(line.line_amount)}</td>
                    <td class="text-end text-muted" dir="ltr">${line.sales_tax_amount ? money.format(line.sales_tax_amount) : '—'}</td>
                `;
                return tr;
            }));
        } catch (err) {
            console.error('Failed to load invoice lines:', err);
            headerEl.innerHTML = '<div class="alert alert-danger mb-0">تعذر تحميل تفاصيل الفاتورة.</div>';
            bodyEl.innerHTML = '<tr><td colspan="5" class="text-center text-danger">حدث خطأ أثناء جلب البيانات.</td></tr>';
        }
    }

    async function openVendorPaymentsModal(vendorAccount) {
        const modalEl = element('financeVendorPaymentsModal');
        if (!modalEl) return;
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        const headerEl = element('financeVendorPaymentsHeader');
        const bodyEl = element('financeVendorPaymentsBody');
        const settlementsBodyEl = element('financeVendorSettlementsBody');
        headerEl.innerHTML = 'جارٍ تحميل معلومات المورد…';
        bodyEl.innerHTML = '<tr><td colspan="8" class="text-center text-muted">جارٍ تحميل الحركات…</td></tr>';
        settlementsBodyEl.innerHTML = '<tr><td colspan="3" class="text-center text-muted">جارٍ تحميل التسويات…</td></tr>';
        modal.show();
        try {
            const payload = await window.FinancePlatformApi.vendorPayments(vendorAccount);
            const v = payload.vendor || {};
            headerEl.innerHTML = `
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div>
                        <strong class="fs-6">${v.vendor_name || vendorAccount}</strong>
                        <div class="text-muted small" dir="ltr">رقم الحساب: ${v.vendor_account_number || vendorAccount} ${v.payment_terms ? `| شروط الدفع: ${v.payment_terms}` : ''}</div>
                    </div>
                </div>
            `;
            const txs = payload.transactions || [];
            if (!txs.length) {
                bodyEl.innerHTML = '<tr><td colspan="8" class="text-center text-muted">لا توجد حركات مسجلة لهذا المورد.</td></tr>';
            } else {
                bodyEl.replaceChildren(...txs.map(tx => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td dir="ltr" class="fw-bold">${tx.voucher || '—'}</td>
                        <td dir="ltr">${tx.invoice_id || '—'}</td>
                        <td dir="ltr">${tx.transaction_date || '—'}</td>
                        <td dir="ltr">${tx.due_date || '—'}</td>
                        <td class="text-end fw-bold" dir="ltr">${money.format(tx.transaction_amount)}</td>
                        <td class="text-end text-success" dir="ltr">${money.format(tx.settled_amount)}</td>
                        <td class="text-end text-danger" dir="ltr">${money.format(tx.remaining_amount)}</td>
                        <td><span class="badge ${tx.is_closed ? 'bg-secondary' : 'bg-warning text-dark'}">${tx.is_closed ? 'مغلقة' : 'مفتوحة'}</span></td>
                    `;
                    return tr;
                }));
            }

            const settlements = payload.settlements || [];
            if (!settlements.length) {
                settlementsBodyEl.innerHTML = '<tr><td colspan="3" class="text-center text-muted">لا توجد تسويات مسجلة لهذا المورد.</td></tr>';
            } else {
                settlementsBodyEl.replaceChildren(...settlements.map(s => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td dir="ltr" class="fw-bold">${s.settlement_voucher || '—'}</td>
                        <td dir="ltr">${s.settlement_date || '—'}</td>
                        <td class="text-end fw-bold text-success" dir="ltr">${money.format(s.settlement_amount)}</td>
                    `;
                    return tr;
                }));
            }
        } catch (err) {
            console.error('Failed to load vendor payments:', err);
            headerEl.innerHTML = '<div class="alert alert-danger mb-0">تعذر تحميل تفاصيل حركات المورد.</div>';
            bodyEl.innerHTML = '<tr><td colspan="8" class="text-center text-danger">حدث خطأ أثناء جلب البيانات.</td></tr>';
            settlementsBodyEl.innerHTML = '<tr><td colspan="3" class="text-center text-danger">حدث خطأ.</td></tr>';
        }
    }

    function renderVendorInvoices(payload) {
        const body = element('financeVendorInvoicesBody');
        if (!payload?.configured) return;
        const rows = payload.data || [];
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="6" class="finance-empty-state">لا توجد فواتير موردين مستوردة.</td></tr>';
            return;
        }
        body.replaceChildren(...rows.map(invoice => {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.title = 'انقر لعرض أسطر الفاتورة التفصيلية';

            const invoiceCell = document.createElement('td');
            invoiceCell.textContent = invoice.invoice_id || '—';
            invoiceCell.dir = 'ltr';

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

            const purchaseOrderCell = document.createElement('td');
            purchaseOrderCell.textContent = invoice.purchase_order_number || '—';
            purchaseOrderCell.dir = 'ltr';

            const dateCell = document.createElement('td');
            dateCell.textContent = invoice.invoice_date || '—';
            dateCell.dir = 'ltr';

            const dueDateCell = document.createElement('td');
            dueDateCell.textContent = invoice.due_date || '—';
            dueDateCell.dir = 'ltr';

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
                purchaseOrderCell,
                dateCell,
                dueDateCell,
                amountCell
            );
            row.addEventListener('click', () => openInvoiceLinesModal(invoice.source_key || invoice.invoice_id));
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

    function renderVendorAnalytics(payload) {
        const body = element('financeTopVendorsBody');
        const rows = payload?.vendors || [];
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="6" class="finance-empty-state">لا توجد أرصدة موردين مفتوحة.</td></tr>';
            return;
        }
        body.replaceChildren(...rows.slice(0, 25).map(vendor => {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.title = 'انقر لعرض سجل الدفعات والتسويات البنكية للمورد';
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
                row.append(cell);
            });
            row.addEventListener('click', () => openVendorPaymentsModal(vendor.vendor_account_number));
            return row;
        }));
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
                month.operating_result === null ? 'غير متوفر' : money.format(Number(month.operating_result) || 0)
            ].forEach((value, index) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                if (index > 0) {
                    cell.dir = 'ltr';
                    cell.className = 'text-end fw-bold';
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
            '<tr><td colspan="5" class="finance-empty-state">تعذر تحميل فواتير الموردين.</td></tr>';
        element('financeLeasesBody').innerHTML =
            '<tr><td colspan="5" class="finance-empty-state">تعذر تحميل عقود الإيجار.</td></tr>';
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
            const [overview, showrooms, vendorInvoices, leases, leaseInsights, apAging, vendorAnalytics, trend, additional] = await Promise.all([
                window.FinancePlatformApi.overview(params),
                window.FinancePlatformApi.showrooms({ ...params, page: 1, page_size: 100 }),
                window.FinancePlatformApi.vendorInvoices({ page: 1, page_size: 25 }),
                window.FinancePlatformApi.leases({ horizon_days: 90 }),
                window.FinancePlatformApi.leaseInsights({})
                    .catch(() => ({ configured: false })),
                window.FinancePlatformApi.apAging({})
                    .catch(() => ({ configured: false })),
                window.FinancePlatformApi.vendorAnalytics({ vendor_limit: 25, invoice_limit: 50 })
                    .catch(() => ({ configured: false, vendors: [], open_invoices: [] })),
                window.FinancePlatformApi.trialBalanceTrend({
                    start: '2025-01-01', end: element('financePlatformEnd').value
                }).catch(() => ({ state: 'unavailable', data: [] })),
                window.FinancePlatformApi.additionalAnalytics({
                    as_of: element('financePlatformEnd').value,
                    month: element('financePlatformEnd').value.slice(0, 7)
                }).catch(() => ({ state: 'partial', sections: {} }))
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
