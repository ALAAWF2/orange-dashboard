import sys
import re

file_path = "rep.html"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update HTML dropdowns
content = content.replace(
    '''<div class="filter-group">
                <label>📂 الفئة</label>
                <select id="categoryFilter">
                    <option value="all">الكل</option>
                </select>
            </div>
            <div class="filter-group">
                <label>📦 حالة المخزون</label>
                <select id="stockFilter">
                    <option value="all">الكل</option>
                    <option value="in_stock">متوفر (> 0)</option>
                    <option value="low_stock">منخفض (1-10)</option>
                    <option value="out_of_stock">نفذت الكمية (0)</option>
                </select>
            </div>
            <div class="filter-group">
                <label>🏪 طريقة العرض</label>
                <select id="viewMode">
                    <option value="by_item">مجمع حسب المنتج</option>
                    <option value="by_store">مفصل حسب المعرض</option>
                </select>
            </div>''',
    '''<div class="filter-group">
                <label>📂 الفئة</label>
                <select id="categoryFilter" multiple style="height: 90px; overflow-y: auto;">
                    <option value="all" selected>الكل</option>
                </select>
                <small style="font-size: 0.65rem; color: #888;">استخدم Ctrl للتحديد المتباعد</small>
            </div>
            <div class="filter-group">
                <label>📦 حالة المخزون</label>
                <select id="stockFilter">
                    <option value="all">الكل</option>
                    <option value="in_stock">متوفر (> 0)</option>
                    <option value="low_stock">منخفض (1-10)</option>
                    <option value="out_of_stock">نفذت الكمية (0)</option>
                </select>
            </div>
            <div class="filter-group">
                <label>🏪 طريقة العرض</label>
                <select id="viewMode">
                    <option value="by_item">مجمع حسب المنتج</option>
                    <option value="by_store">مفصل حسب المعرض</option>
                    <option value="by_month">مفصل حسب الشهر</option>
                </select>
            </div>'''
)

# 2. Update category array extraction in runSearch
content = content.replace(
    "const categoryFilter = document.getElementById('categoryFilter').value;",
    "const categoryFilterOptions = Array.from(document.getElementById('categoryFilter').selectedOptions).map(opt => opt.value);\n            const isAllCategories = categoryFilterOptions.includes('all') || categoryFilterOptions.length === 0;"
)

# 3. Update Aggregate loop
old_agg = """                    if (viewMode === 'by_store') {
                        // Aggregate by store_id + item_id
                        for (const r of allRecords) {
                            const key = r.s + '_' + r.i;
                            if (!itemAgg[key]) {
                                itemAgg[key] = { qty: 0, amount: 0, store_id: r.s, item_id: r.i };
                            }
                            itemAgg[key].qty += r.q;
                            itemAgg[key].amount += r.a;
                        }
                    } else {"""
new_agg = """                    if (viewMode === 'by_store') {
                        // Aggregate by store_id + item_id
                        for (const r of allRecords) {
                            const key = r.s + '_' + r.i;
                            if (!itemAgg[key]) {
                                itemAgg[key] = { qty: 0, amount: 0, store_id: r.s, item_id: r.i };
                            }
                            itemAgg[key].qty += r.q;
                            itemAgg[key].amount += r.a;
                        }
                    } else if (viewMode === 'by_month') {
                        // Aggregate by month + item_id
                        for (const r of allRecords) {
                            const month = r.d.substring(0, 7);
                            const key = month + '_' + r.i;
                            if (!itemAgg[key]) {
                                itemAgg[key] = { qty: 0, amount: 0, month: month, item_id: r.i };
                            }
                            itemAgg[key].qty += r.q;
                            itemAgg[key].amount += r.a;
                        }
                    } else {"""
content = content.replace(old_agg, new_agg)

# 4. Update filtering block 1: by_store
content = content.replace(
    "if (categoryFilter !== 'all' && prod.category !== categoryFilter) continue;",
    "if (!isAllCategories && !categoryFilterOptions.includes(prod.category || '')) continue;"
)

# 5. Add by_month building loop
# We'll inject by_month block right before the default `else {` block 
old_build_block = """                    }
                } else {
                    // Default aggregated mode"""

new_build_block = """                    }
                } else if (viewMode === 'by_month' && searchType === 'sales_stock') {
                    for (const key of Object.keys(itemAgg)) {
                        const agg = itemAgg[key];
                        const pid = agg.item_id;
                        const month = agg.month;

                        if (pid.startsWith('300') || pid.startsWith('290')) continue;

                        const prod = PRODUCTS[pid];
                        if (!prod) continue;

                        if (!isAllCategories && !categoryFilterOptions.includes(prod.category || '')) continue;
                        if (!matchConditions(prod, conditions)) continue;

                        let totalStock = 0;
                        if (prod.stock) {
                            if (storeFilter !== 'all') {
                                totalStock = prod.stock[storeFilter] || 0;
                            } else {
                                totalStock = prod.stock.total || 0;
                            }
                        }

                        if (stockFilter === 'in_stock' && totalStock <= 0) continue;
                        if (stockFilter === 'out_of_stock' && totalStock > 0) continue;
                        if (stockFilter === 'low_stock' && (totalStock <= 0 || totalStock > 10)) continue;

                        results.push({
                            item_id: pid,
                            alias: prod.alias || '',
                            name: prod.name || '',
                            category: prod.category || '',
                            price: prod.price || 0,
                            qty: agg.qty,
                            amount: Math.round(agg.amount * 100) / 100,
                            stock_total: totalStock,
                            month: month
                        });
                    }
                } else {
                    // Default aggregated mode"""

content = content.replace(old_build_block, new_build_block)

# 6. Apply sorting logic for by_month
old_sort = """            const isByStore = viewMode === 'by_store';

            CURRENT_RESULTS.sort((a, b) => {
                let va, vb;
                if (isByStore) {"""

new_sort = """            const isByStore = viewMode === 'by_store';
            const isByMonth = viewMode === 'by_month';

            CURRENT_RESULTS.sort((a, b) => {
                let va, vb;
                if (isByStore) {"""

content = content.replace(old_sort, new_sort)

old_sort_cond = """                        default: return 0;
                    }
                } else {
                    switch (col) {"""
new_sort_cond = """                        default: return 0;
                    }
                } else if (isByMonth) {
                    switch (col) {
                        case 0: return 0;
                        case 1: va = a.month || ''; vb = b.month || ''; break;
                        case 2: va = a.alias; vb = b.alias; break;
                        case 3: va = a.name; vb = b.name; break;
                        case 4: va = a.category; vb = b.category; break;
                        case 5: va = a.price; vb = b.price; break;
                        case 6: va = a.qty; vb = b.qty; break;
                        case 7: va = a.amount; vb = b.amount; break;
                        case 8: va = a.stock_total; vb = b.stock_total; break;
                        default: return 0;
                    }
                } else {
                    switch (col) {"""

content = content.replace(old_sort_cond, new_sort_cond)

# 7. Render logic: headers
old_render_header = """            // Update table headers based on view mode
            const thead = document.getElementById('mainTableHead');
            if (isByStore) {
                thead.innerHTML = `
                    <th onclick="sortTable(0)">#<span class="sort-icon">▼</span></th>
                    <th onclick="sortTable(1)">المعرض<span class="sort-icon">▼</span></th>"""

new_render_header = """            const isByMonth = viewMode === 'by_month';
            // Update table headers based on view mode
            const thead = document.getElementById('mainTableHead');
            if (isByStore) {
                thead.innerHTML = `
                    <th onclick="sortTable(0)">#<span class="sort-icon">▼</span></th>
                    <th onclick="sortTable(1)">المعرض<span class="sort-icon">▼</span></th>"""

content = content.replace(old_render_header, new_render_header)

old_render_header2 = """                    <th onclick="sortTable(8)">ستوك المعرض<span class="sort-icon">▼</span></th>
                `;
            } else {
                thead.innerHTML = `"""

new_render_header2 = """                    <th onclick="sortTable(8)">ستوك المعرض<span class="sort-icon">▼</span></th>
                `;
            } else if (isByMonth) {
                thead.innerHTML = `
                    <th onclick="sortTable(0)">#<span class="sort-icon">▼</span></th>
                    <th onclick="sortTable(1)">الشهر<span class="sort-icon">▼</span></th>
                    <th onclick="sortTable(2)">Alias<span class="sort-icon">▼</span></th>
                    <th onclick="sortTable(3)">اسم المنتج<span class="sort-icon">▼</span></th>
                    <th onclick="sortTable(4)">الفئة<span class="sort-icon">▼</span></th>
                    <th onclick="sortTable(5)">سعر البيع<span class="sort-icon">▼</span></th>
                    <th onclick="sortTable(6)">الكمية المباعة<span class="sort-icon">▼</span></th>
                    <th onclick="sortTable(7)">إجمالي المبيعات<span class="sort-icon">▼</span></th>
                    <th onclick="sortTable(8)">الستوك الحالي<span class="sort-icon">▼</span></th>
                `;
            } else {
                thead.innerHTML = `"""

content = content.replace(old_render_header2, new_render_header2)


# 8. Render logic: rows
old_colspan = """const colSpan = isByStore ? 9 : 8;"""
new_colspan = """const colSpan = (isByStore || isByMonth) ? 9 : 8;"""
content = content.replace(old_colspan, new_colspan)

old_render_row = """                if (isByStore) {
                    // Per-store row: no tooltip needed
                    html += `<tr>
                    <td>${i + 1}</td>
                    <td style="font-weight:600;white-space:nowrap">${r.store_name || ''}</td>"""

new_render_row = """                if (isByStore) {
                    // Per-store row: no tooltip needed
                    html += `<tr>
                    <td>${i + 1}</td>
                    <td style="font-weight:600;white-space:nowrap">${r.store_name || ''}</td>"""

old_render_row2 = """                    <td class="stock-cell">
                        <span class="stock-badge ${stockClass}">${r.stock_total.toLocaleString('en-US')}</span>
                    </td>
                </tr>`;
                } else {
                    // Aggregated row with tooltip"""

new_render_row2 = """                    <td class="stock-cell">
                        <span class="stock-badge ${stockClass}">${r.stock_total.toLocaleString('en-US')}</span>
                    </td>
                </tr>`;
                } else if (isByMonth) {
                    html += `<tr>
                    <td>${i + 1}</td>
                    <td style="font-weight:600;white-space:nowrap;color:#2980b9;">${r.month || ''}</td>
                    <td style="font-family:monospace;font-weight:700">${r.alias}</td>
                    <td>${r.name}</td>
                    <td>${r.category}</td>
                    <td>${r.price.toLocaleString('en-US')}</td>
                    <td style="font-weight:700">${r.qty.toLocaleString('en-US')}</td>
                    <td style="font-weight:700;color:var(--orange)">${r.amount.toLocaleString('en-US')}</td>
                    <td class="stock-cell">
                        <span class="stock-badge ${stockClass}">${r.stock_total.toLocaleString('en-US')}</span>
                    </td>
                </tr>`;
                } else {
                    // Aggregated row with tooltip"""

content = content.replace(old_render_row2, new_render_row2)

# 9. Excel export
old_excel = """                    const isByStore = viewMode === 'by_store';

                    const rows = CURRENT_RESULTS.map((r, i) => {
                        const row = { '#': i + 1 };
                        if (isByStore) row['المعرض'] = r.store_name || '';
                        row['Alias'] = r.alias;"""

new_excel = """                    const isByStore = viewMode === 'by_store';
                    const isByMonth = viewMode === 'by_month';

                    const rows = CURRENT_RESULTS.map((r, i) => {
                        const row = { '#': i + 1 };
                        if (isByStore) row['المعرض'] = r.store_name || '';
                        if (isByMonth) row['الشهر'] = r.month || '';
                        row['Alias'] = r.alias;"""

content = content.replace(old_excel, new_excel)

# Fix excel col span lengths if byMonth
old_excel_cols = """                    // Column widths
                    ws['!cols'] = [
                        { wch: 5 },   // #
                        { wch: 12 },  // Alias"""

new_excel_cols = """                    // Column widths
                    ws['!cols'] = [
                        { wch: 5 },   // #
                        ...(isByStore || isByMonth ? [{ wch: 15 }] : []), // Store or Month
                        { wch: 12 },  // Alias"""

content = content.replace(old_excel_cols, new_excel_cols)


# 10. PDF Export updates
old_pdf = """                    const viewMode = document.getElementById('viewMode').value;
                    const isByStore = viewMode === 'by_store';

                    const rows = CURRENT_RESULTS.map((r, i) => {""" # Wait, PDF uses tableData 

old_pdf2 = """                    const storeFilter = document.getElementById('storeFilter').value;
                    const storeName = storeFilter === 'all' ? 'الكل' : (META.stores[storeFilter] || storeFilter);
                    const searchType = document.getElementById('searchType').value;

                    doc.setFontSize(14);"""

new_pdf2 = """                    const storeFilter = document.getElementById('storeFilter').value;
                    const storeName = storeFilter === 'all' ? 'الكل' : (META.stores[storeFilter] || storeFilter);
                    const searchType = document.getElementById('searchType').value;
                    const viewMode = document.getElementById('viewMode').value;
                    const isByStore = viewMode === 'by_store';
                    const isByMonth = viewMode === 'by_month';

                    doc.setFontSize(14);"""
content = content.replace(old_pdf2, new_pdf2)

old_pdf3 = """                    const tableData = CURRENT_RESULTS.map((r, i) => [
                        i + 1,
                        r.alias,
                        r.name,
                        r.category,
                        r.price.toLocaleString('en-US'),
                        r.qty.toLocaleString('en-US'),
                        r.amount.toLocaleString('en-US'),
                        r.stock_total.toLocaleString('en-US')
                    ]);"""

new_pdf3 = """                    const tableData = CURRENT_RESULTS.map((r, i) => {
                        const base = [
                            i + 1,
                            r.alias,
                            r.name,
                            r.category,
                            r.price.toLocaleString('en-US'),
                            r.qty.toLocaleString('en-US'),
                            r.amount.toLocaleString('en-US'),
                            r.stock_total.toLocaleString('en-US')
                        ];
                        if (isByStore) base.splice(1, 0, r.store_name || '');
                        else if (isByMonth) base.splice(1, 0, r.month || '');
                        return base;
                    });"""
content = content.replace(old_pdf3, new_pdf3)

old_pdf4 = """                    tableData.push([
                        '', 'الإجمالي', '-', '-', '-',
                        sumQty.toLocaleString('en-US'),
                        sumAmt.toLocaleString('en-US'),
                        sumStk.toLocaleString('en-US')
                    ]);

                    doc.autoTable({
                        startY: 28,
                        head: [[
                            '#', 'Alias', 'اسم المنتج', 'الفئة', 'سعر البيع', 'الكمية', 'المبيعات', 'الستوك'
                        ]],"""

new_pdf4 = """                    const sumRow = [
                        '', 'الإجمالي', '-', '-', '-',
                        sumQty.toLocaleString('en-US'),
                        sumAmt.toLocaleString('en-US'),
                        sumStk.toLocaleString('en-US')
                    ];
                    if (isByStore || isByMonth) sumRow.splice(1, 0, '-');
                    tableData.push(sumRow);
                    
                    let headerRow = ['#', 'Alias', 'اسم المنتج', 'الفئة', 'سعر البيع', 'الكمية', 'المبيعات', 'الستوك'];
                    if (isByStore) headerRow.splice(1, 0, 'المعرض');
                    else if (isByMonth) headerRow.splice(1, 0, 'الشهر');

                    doc.autoTable({
                        startY: 28,
                        head: [headerRow],"""

content = content.replace(old_pdf4, new_pdf4)

# Other instances of category array replacements (Analysis Modal)
# showAnalysisModal
content = content.replace(
    '''const categoryFilter = document.getElementById('categoryFilter').value;''',
    '''const categoryFilterOptions = Array.from(document.getElementById('categoryFilter').selectedOptions).map(opt => opt.value);
            const isAllCategories = categoryFilterOptions.includes('all') || categoryFilterOptions.length === 0;'''
)

# And in showAnalysisModal update logic check
content = content.replace(
    '''if (categoryFilter !== 'all' && prod.category !== categoryFilter) continue;''',
    '''if (!isAllCategories && !categoryFilterOptions.includes(prod.category || '')) continue;'''
)
# And in exportAnalysisExcel update logic check
content = content.replace(
    '''if (categoryFilter !== 'all' && p.category !== categoryFilter) continue;''',
    '''if (!isAllCategories && !categoryFilterOptions.includes(p.category || '')) continue;'''
)


with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated successfully!")
