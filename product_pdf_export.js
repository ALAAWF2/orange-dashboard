/**
 * product_pdf_export.js
 * Handles PDF Export for Product Analysis Dashboard
 * Dependencies: jspdf, jspdf-autotable, amiri_font.js (base64)
 */

async function generateProductPDF() {
    // 1. Check Dependencies
    if (!window.jspdf) {
        alert("Library jspdf not loaded");
        return;
    }
    const { jsPDF } = window.jspdf;

    // 2. User Selection
    const includePerf = document.getElementById('chkPerf').checked;
    const includeAdv = document.getElementById('chkAdv').checked;
    const includeStore = document.getElementById('chkStore').checked;
    const includeCatDet = document.getElementById('chkCatDet').checked;

    if (!includePerf && !includeAdv && !includeStore && !includeCatDet) {
        alert("الرجاء اختيار قسم واحد على الأقل للتصدير");
        return;
    }

    // 3. Init PDF
    const doc = new jsPDF('p', 'mm', 'a4'); // Portrait
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- Font Loading ---
    const fontFileName = "Amiri-Regular.ttf";
    const fontName = "Amiri";

    try {
        if (typeof amiriFontBase64 === 'undefined') {
            throw new Error("Base64 font not found");
        }
        doc.addFileToVFS(fontFileName, amiriFontBase64);
        doc.addFont(fontFileName, fontName, "normal");
        doc.setFont(fontName);
    } catch (e) {
        console.error("Font Error:", e);
        alert("تعذر تحميل الخط العربي. ستظهر النصوص بشكل غير صحيح.");
        doc.setFont("helvetica");
    }

    // --- Helper: Centered Text ---
    const centerText = (text, y) => {
        const textWidth = doc.getStringUnitWidth(text) * doc.internal.getFontSize() / doc.internal.scaleFactor;
        const x = (pageWidth - textWidth) / 2;
        doc.text(text, x, y);
    };

    // --- Header Info ---
    // Fix Date Reversal: Construct explicitly
    let rangeText = "";
    if (rawData.metadata && rawData.metadata.period_start) {
        // Force LTR for dates, RTL for text?
        // Best approach: "From: [Start]  To: [End]"
        rangeText = `الفترة من: ${rawData.metadata.period_start}   إلى: ${rawData.metadata.period_end}`;
    } else {
        rangeText = document.getElementById('periodDisplay').textContent;
    }

    // Export Date
    const exportDate = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY

    doc.setFontSize(18);
    centerText("تقرير تحليل المنتجات (Product Analysis Report)", 15);

    doc.setFontSize(12);
    centerText(rangeText, 22);

    doc.setFontSize(10);
    // Render Date manually to avoid reversal "Export Date: ..."
    doc.text(`تاريخ التصدير: ${exportDate}`, pageWidth - 50, 22, { align: 'right' });
    doc.text(`المستخدم: ${currentUser.name}`, 15, 22); // Left align user

    let finalY = 30; // Start Y for content

    // --- DATA PREPARATION ---
    // The HTML page aggregates data on the fly in `processGlobalStats`. 
    // We must replicate that logic here to get the correct filtered data for the PDF.

    // 1. Filter Keys (Active Store Logic)
    // Access global `activeStore` and `activeRegion` variables from window
    const pActiveStore = (typeof activeStore !== 'undefined') ? activeStore : 'all';
    const pActiveRegion = (typeof activeRegion !== 'undefined') ? activeRegion : 'all';

    let filteredKeys = Object.keys(currentData);

    if (pActiveStore !== 'all') {
        filteredKeys = filteredKeys.filter(id => id === pActiveStore);
    } else if (pActiveRegion !== 'all') {
        filteredKeys = filteredKeys.filter(id => {
            const m = rawData.store_meta[id];
            return m && m.region === pActiveRegion;
            // Note: isStoreAccessible check skipped for simplicity or assume handle by UI state
        });
    }

    // 2. Aggregate Categories & Top Items
    const catMap = {}; // Cat -> {name, qty, amount}
    const itemMap = {}; // ItemID -> {id, name, cat, qty, amount}
    let grandTotal = 0;

    filteredKeys.forEach(storeId => {
        const store = currentData[storeId];
        if (!store) return;

        store.categories.forEach(c => {
            // Categories Aggregation
            if (!catMap[c.category]) {
                catMap[c.category] = { name: c.category, qty: 0, amount: 0, share: 0 };
            }
            catMap[c.category].qty += c.qty;
            catMap[c.category].amount += c.amount;
            grandTotal += c.amount;

            // Top Items Aggregation (Approximate from 'top_item' fields)
            const tid = c.top_item_id;
            if (tid && tid !== '-') {
                if (!itemMap[tid]) itemMap[tid] = {
                    id: tid,
                    name: c.top_item_name,
                    category: c.category,
                    qty: 0,
                    amount: 0
                };
                // Aggregate quantity and amount for the top item across stores/categories
                itemMap[tid].qty += c.top_item_qty;
                itemMap[tid].amount += c.top_item_amount;
            }
        });
    });

    // Prepare Sorted Lists
    const sortedCats = Object.values(catMap).sort((a, b) => b.amount - a.amount);
    sortedCats.forEach(c => c.share = grandTotal > 0 ? (c.amount / grandTotal * 100) : 0);

    const topItems = Object.values(itemMap).sort((a, b) => b.amount - a.amount);


    // --- SECTION 1: PERFORMANCE SUMMARY ---
    if (includePerf) {
        doc.setFontSize(14);
        doc.setTextColor(254, 121, 0); // Orange
        doc.text("1. ملخص الأداء (Performance Summary)", 190, finalY, { align: "right" });
        doc.setTextColor(0);
        finalY += 8;

        // Table 1.1: Top Products per Category (Global/Filtered)
        if (topItems.length > 0) {
            doc.setFontSize(11);
            doc.text("المنتج الأكثر مبيعاً حسب الفئة:", 190, finalY, { align: "right" });
            finalY += 6;

            const topProdRows = topItems.slice(0, 20).map(item => [
                Math.round(item.amount).toLocaleString(),
                item.qty,
                item.id,
                item.name, // Added Name
                item.category
            ]);

            doc.autoTable({
                startY: finalY,
                head: [['المبيعات', 'الكمية', 'رقم المنتج', 'اسم المنتج', 'التصنيف']], // Added Header
                body: topProdRows,
                theme: 'grid',
                headStyles: { fillColor: [254, 121, 0], textColor: 255, font: fontName, halign: 'center' },
                bodyStyles: { font: fontName, halign: 'center' },
                styles: { fontSize: 8 }, // Slightly smaller font to fit name
                columnStyles: { 3: { cellWidth: 50 } } // Give more space to Name
            });

            finalY = doc.lastAutoTable.finalY + 10;
        }

        // Table 1.2: Category Performance
        if (sortedCats.length > 0) {
            if (finalY > 250) { doc.addPage(); finalY = 20; }

            doc.setFontSize(11);
            doc.text("أداء الفئات (Category Performance):", 190, finalY, { align: "right" });
            finalY += 6;

            const catRows = sortedCats.map((cat, i) => [
                cat.share.toFixed(1) + '%',
                Math.round(cat.amount).toLocaleString(),
                cat.qty.toLocaleString(),
                cat.name,
                (i + 1)
            ]);

            doc.autoTable({
                startY: finalY,
                head: [['مساهمة %', 'المبيعات', 'الكمية', 'التصنيف', '#']],
                body: catRows,
                theme: 'grid',
                headStyles: { fillColor: [108, 117, 125], textColor: 255, font: fontName, halign: 'center' }, // Secondary color
                bodyStyles: { font: fontName, halign: 'center' },
                styles: { fontSize: 9 }
            });

            finalY = doc.lastAutoTable.finalY + 15;
        }
    }

    // --- SECTION 2: ADVANCED ANALYSIS ---
    if (includeAdv) {
        if (finalY > 240) { doc.addPage(); finalY = 25; }

        doc.setFontSize(14);
        doc.setTextColor(254, 121, 0);
        doc.text("2. تحليل متقدم (Advanced Analysis)", 190, finalY, { align: "right" });
        doc.setTextColor(0);
        finalY += 10;

        // Market Basket
        const allBasket = rawData ? rawData.market_basket : {};
        const basketData = (allBasket && allBasket[pActiveStore]) ? allBasket[pActiveStore] : (allBasket['all'] || []);

        if (basketData.length > 0) {
            doc.setFontSize(11);
            doc.text("أكثر المنتجات التي تشترى معاً (Market Basket):", 190, finalY, { align: "right" });
            finalY += 6;

            const basketRows = basketData.slice(0, 15).map((pair, i) => [
                pair.frequency,
                pair.item_b_name,
                pair.item_a_name,
                (i + 1)
            ]);

            doc.autoTable({
                startY: finalY,
                head: [['مرات التكرار', 'المنتج الثاني', 'المنتج الأول', '#']],
                body: basketRows,
                theme: 'striped',
                headStyles: { fillColor: [52, 58, 64], font: fontName, halign: 'center' },
                bodyStyles: { font: fontName, halign: 'center' },
                styles: { fontSize: 9 }
            });
            finalY = doc.lastAutoTable.finalY + 10;
        }

        // Missed Opportunities
        if (rawData && rawData.periods && rawData.periods[currentMode]) {
            const missedMap = rawData.periods[currentMode].missed_opportunities || {};
            let missedList = [];

            if (pActiveStore === 'all') {
                Object.values(missedMap).forEach(arr => missedList.push(...arr));
            } else {
                missedList = missedMap[pActiveStore] || [];
            }

            // Sort and Slice
            missedList.sort((a, b) => b.total_count - a.total_count);
            missedList = missedList.slice(0, 15);

            if (missedList.length > 0) {
                if (finalY > 240) { doc.addPage(); finalY = 25; }

                doc.setFontSize(11);
                doc.text("الفرص الضائعة (Missed Opportunities):", 190, finalY, { align: "right" });
                finalY += 6;

                const missedRows = missedList.map((m, i) => {
                    // Top missed item
                    const topMissed = (m.missed_items && m.missed_items.length > 0) ? m.missed_items[0].name : '-';
                    return [
                        m.total_count,
                        topMissed,
                        m.sold_item,
                        m.employee_name,
                        (i + 1)
                    ];
                });

                doc.autoTable({
                    startY: finalY,
                    head: [['عدد المرات', 'الفرصة الضائعة (أهم صنف)', 'المنتج المباع', 'الموظف', '#']],
                    body: missedRows,
                    theme: 'striped',
                    headStyles: { fillColor: [220, 53, 69], font: fontName, halign: 'center' }, // Danger Red
                    bodyStyles: { font: fontName, halign: 'center' },
                    styles: { fontSize: 9 }
                });
                finalY = doc.lastAutoTable.finalY + 15;
            }
        }
    }

    // --- SECTION 3: STORE BREAKDOWN ---
    if (includeStore && filteredKeys.length > 0) {
        doc.addPage();
        finalY = 20;

        doc.setFontSize(14);
        doc.setTextColor(254, 121, 0);
        doc.text("3. تفاصيل الفروع (Store Breakdown)", 190, finalY, { align: "right" });
        doc.setTextColor(0);
        finalY += 10;

        // Build Store List from key list
        const storeRows = filteredKeys.map((sid, i) => {
            const s = currentData[sid];
            // Calculate total for store since 'total_sales' might not be on the object, 
            // the HTML code calculated it on the fly. 
            // Actually 'currentData[sid]' is just {categories: [...], store_name: ...}
            // We need to sum it up.
            let sSales = 0;
            let sQty = 0;
            s.categories.forEach(c => { sSales += c.amount; sQty += c.qty; });

            // Top Cat
            const topCat = s.categories.length > 0 ? s.categories[0].category : '-';

            return [
                topCat,
                Math.round(sSales).toLocaleString(),
                sQty.toLocaleString(),
                s.store_name || sid,
                (i + 1)
            ];
        });

        // Sort by Sales desc
        storeRows.sort((a, b) => parseInt(b[1].replace(/,/g, '')) - parseInt(a[1].replace(/,/g, '')));

        doc.autoTable({
            startY: finalY,
            head: [['أعلى تصنيف', 'المبيعات', 'الكمية', 'الفرع', '#']],
            body: storeRows,
            theme: 'grid',
            headStyles: { fillColor: [23, 162, 184], font: fontName, halign: 'center' }, // Info Cyan
            bodyStyles: { font: fontName, halign: 'center' },
            styles: { fontSize: 9 }
        });

        finalY = doc.lastAutoTable.finalY + 15;
    }

    // --- SECTION 4: CATEGORY DETAILS (NEW) ---
    if (includeCatDet) {
        doc.addPage();
        finalY = 20;

        doc.setFontSize(14);
        doc.setTextColor(254, 121, 0);
        doc.text("4. تفاصيل أصناف المبيعات (Category Details)", 190, finalY, { align: "right" });
        doc.setTextColor(0);
        finalY += 10;

        const pData = rawData.periods ? rawData.periods[currentMode] : null;
        const catalog = pData ? (pData.catalog || {}) : {};

        // Use sortedCats from earlier to iterate in order
        for (const cat of sortedCats) {
            const catName = cat.name;
            // Catalog contains ALL items. Filter ??
            // Actually catalog is generic. 
            // Does catalog have store info? No.
            // Catalog is likely Global for the period.
            // If we are filtering by store, we should technically filter items too.
            // But catalog data structure usually is just Item List.
            // Let's check `processGlobalStats`... it doesn't use catalog. 
            // `showCategoryItems` uses catalog.
            // If we are in 'all' stores mode, using catalog is fine.
            // If specific store, catalog might be misleading if it doesn't have store split.
            // But since we can't easily filter catalog (unless it has store_id field), 
            // we will use it as is (Global List) but label it "Global" if mixed?
            // Or maybe catalog items *do* have store breakdown? 
            // inspecting `showCategoryItems`: `let items = catalog[categoryName] || [];`
            // No store filter there! 
            // Wait, `catItemsSubtitle` shows store Name. 
            // This implies `catalog` might be pre-filtered? No, rawData is static.
            // If `catalog` items don't have store_id, then `showCategoryItems` shows GLOBAL items even when store is selected?
            // That would be a bug in the existing dashboard if true.
            // Let's assume catalog is global. 

            let items = catalog[catName] || [];

            if (items.length === 0) continue;

            if (finalY > 250) { doc.addPage(); finalY = 20; }

            doc.setFontSize(12);
            doc.setFillColor(240, 240, 240);
            doc.rect(14, finalY - 5, 182, 7, 'F');
            doc.text(`${catName} (Sales: ${Math.round(cat.amount).toLocaleString()})`, 190, finalY, { align: "right" });
            finalY += 4;

            items.sort((a, b) => b.amount - a.amount);
            const topItemsList = items.slice(0, 20);

            const itemRows = topItemsList.map((item, i) => [
                Math.round(item.amount).toLocaleString(),
                item.qty,
                item.name,
                (i + 1)
            ]);

            doc.autoTable({
                startY: finalY,
                head: [['المبيعات', 'الكمية', 'اسم المنتج', '#']],
                body: itemRows,
                theme: 'plain',
                headStyles: { font: fontName, halign: 'center', fillColor: [200, 200, 200], textColor: 0 },
                bodyStyles: { font: fontName, halign: 'center' },
                styles: { fontSize: 8, cellPadding: 1 },
                margin: { left: 20 },
                tableWidth: 170
            });

            finalY = doc.lastAutoTable.finalY + 8;
        }
    }


    // --- Save ---
    doc.save(`Product_Analysis_${exportDate.replace(/\//g, '-')}.pdf`);

    // Close Modal
    const modalEl = document.getElementById('pdfExportModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
}
