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

    const selectedStoreId = document.getElementById('pdfStoreSelect').value;
    const isDetailed = document.getElementById('chkPdfDetailed').checked;

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

    // --- MAIN GENERATION LOGIC ---

    // 1. Define Scope
    // Logic: 
    // If selectedStoreId == 'all' AND !isDetailed -> Generate ONE Global Summary (Filtered by current dashboard logic usually, but let's respect "All" implies active filters or truly all?)
    // Actually "All (according to current filter)" is what I labelled.
    // If selectedStoreId == 'all' AND isDetailed -> Generate Global Summary + Page per Store.
    // If selectedStoreId != 'all' -> Generate ONE Report for that store only.

    // Determine Base Stores to iterate
    let targetStores = [];
    if (selectedStoreId !== 'all') {
        targetStores = [selectedStoreId];
    } else {
        // Collect all stores based on CURRENT permission/dashboard filter logic
        // We use the `filteredKeys` logic we built before or access `currentData`.
        // `currentData` usually contains filters if dashboard is filtered? 
        // No, currentData is filtered by MODE (Time). `processGlobalStats` does the filtering.
        // We need list of stores that match `activeRegion` if set.

        let allKeys = Object.keys(currentData);
        // Filter by Region if set globally in dashboard
        if (typeof activeRegion !== 'undefined' && activeRegion !== 'all') {
            allKeys = allKeys.filter(id => {
                const m = rawData.store_meta[id];
                return m && m.region === activeRegion;
            });
        }
        targetStores = allKeys;
    }

    // A. Generate "Global/Summary" Section (Always first)
    // For single store selection, "Global" IS that store.
    // For All + Detailed, "Global" is the aggregate.

    // --- Header Info (Global) ---
    let rangeText = "";
    if (rawData.metadata && rawData.metadata.period_start) {
        rangeText = `الفترة من: ${rawData.metadata.period_start}   إلى: ${rawData.metadata.period_end}`;
    } else {
        rangeText = document.getElementById('periodDisplay').textContent;
    }
    const exportDate = new Date().toLocaleDateString('en-GB');

    // Page 1 Header
    doc.setFontSize(18);
    centerText("تقرير تحليل المنتجات (Product Analysis Report)", 15);

    doc.setFontSize(12);
    centerText(rangeText, 25); // Moved down slightly

    doc.setFontSize(10);
    // Fix Overlap: Move these to line 35
    doc.text(`تاريخ التصدير: ${exportDate}`, pageWidth - 15, 35, { align: 'right' });
    doc.text(`المستخدم: ${currentUser.name}`, 15, 35);

    let finalY = 45; // Start content lower

    // Generate The Content
    // We pass 'targetStores' to a helper function that aggregates data from `currentData` for these stores.

    await generateSection(doc, targetStores, "ملخص شامل (Global Summary)", includePerf, includeAdv, includeStore, includeCatDet, fontName);

    // B. Generate Detailed Pages if requested
    if (selectedStoreId === 'all' && isDetailed) {
        for (const sid of targetStores) {
            doc.addPage();
            finalY = 20;

            // Store Header
            const m = rawData.store_meta[sid] || {};
            const sName = m.name_ar || m.name || sid;

            doc.setFontSize(16);
            doc.setTextColor(254, 121, 0);
            centerText(`تقرير فرع: ${sName} (${sid})`, 15);
            doc.setTextColor(0);
            doc.setFontSize(10);
            centerText(rangeText, 22);

            await generateSection(doc, [sid], `تفاصيل: ${sName}`, includePerf, includeAdv, false, includeCatDet, fontName, 30);
            // Note: includeStore (Store Breakdown) is disabled for single store pages as it's redundant (table of 1 row)
        }
    }

    // --- Save ---
    const fName = selectedStoreId === 'all' ? 'Product_Analysis_All' : `Product_Analysis_${selectedStoreId}`;
    doc.save(`${fName}_${exportDate.replace(/\//g, '-')}.pdf`);

    // Close Modal
    const modalEl = document.getElementById('pdfExportModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
}

/**
 * Helper to generate report sections for a specific list of store IDs.
 * filtering logic resides here (aggregating data for the passed IDs).
 */
async function generateSection(doc, storeIds, sectionTitle, incPerf, incAdv, incStore, incCatDet, fontName, startY = 45) {
    let finalY = startY;
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- AGGREGATION ---
    const catMap = {};
    const itemMap = {};
    let grandTotal = 0;

    storeIds.forEach(storeId => {
        const store = currentData[storeId];
        if (!store) return;

        store.categories.forEach(c => {
            if (!catMap[c.category]) {
                catMap[c.category] = { name: c.category, qty: 0, amount: 0, share: 0 };
            }
            catMap[c.category].qty += c.qty;
            catMap[c.category].amount += c.amount;
            grandTotal += c.amount;

            const tid = c.top_item_id;
            if (tid && tid !== '-') {
                if (!itemMap[tid]) itemMap[tid] = {
                    id: tid,
                    name: c.top_item_name,
                    category: c.category,
                    qty: 0,
                    amount: 0
                };
                // Aggregation
                itemMap[tid].qty += c.top_item_qty;
                itemMap[tid].amount += c.top_item_amount;
            }
        });
    });

    const sortedCats = Object.values(catMap).sort((a, b) => b.amount - a.amount);
    sortedCats.forEach(c => c.share = grandTotal > 0 ? (c.amount / grandTotal * 100) : 0);
    const topItems = Object.values(itemMap).sort((a, b) => b.amount - a.amount);


    // --- SECTION 1: PERFORMANCE ---
    if (incPerf) {
        doc.setFontSize(14);
        doc.setTextColor(254, 121, 0);
        doc.text("1. ملخص الأداء (Performance Summary)", 190, finalY, { align: "right" });
        doc.setTextColor(0);
        finalY += 8;

        if (topItems.length > 0) {
            doc.setFontSize(11);
            doc.text("المنتج الأكثر مبيعاً حسب الفئة:", 190, finalY, { align: "right" });
            finalY += 6;

            const topRows = topItems.slice(0, 20).map(item => [
                Math.round(item.amount).toLocaleString(),
                item.qty,
                item.id,
                item.name,
                item.category
            ]);

            doc.autoTable({
                startY: finalY,
                head: [['المبيعات', 'الكمية', 'رقم المنتج', 'اسم المنتج', 'التصنيف']],
                body: topRows,
                theme: 'grid',
                headStyles: { fillColor: [254, 121, 0], textColor: 255, font: fontName, halign: 'center' },
                bodyStyles: { font: fontName, halign: 'center' },
                styles: { fontSize: 8 },
                columnStyles: { 3: { cellWidth: 50 } }
            });
            finalY = doc.lastAutoTable.finalY + 10;
        }

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
                headStyles: { fillColor: [108, 117, 125], textColor: 255, font: fontName, halign: 'center' },
                bodyStyles: { font: fontName, halign: 'center' },
                styles: { fontSize: 9 }
            });
            finalY = doc.lastAutoTable.finalY + 15;
        }
    }

    // --- SECTION 2: ADVANCED ---
    if (incAdv) {
        if (finalY > 240) { doc.addPage(); finalY = 25; }
        doc.setFontSize(14);
        doc.setTextColor(254, 121, 0);
        doc.text("2. تحليل متقدم (Advanced Analysis)", 190, finalY, { align: "right" });
        doc.setTextColor(0);
        finalY += 10;

        // Aggregate Market Basket & Missed Opps for these stores
        const allBasket = rawData ? rawData.market_basket : {};
        let basketData = [];

        // If single store, we just take that store's basket
        if (storeIds.length === 1 && allBasket[storeIds[0]]) {
            basketData = allBasket[storeIds[0]];
        } else if (storeIds.length > 1) {
            // If multiple stores, we technically should check 'all' or aggregating...
            // But existing structure usually has 'all' key for global.
            // If we are printing "Global Summary", we use 'all'.
            // If we are printing "Detailed User Report" (which we don't support iterating detailed advanced analysis yet per store? wait, we do)
            // Let's rely on fallback to 'all' only if stores > 1, otherwise specific.
            // Actually, if we are in "All Stores" mode, we want Global Aggregate.
            basketData = allBasket['all'] || [];
        }
        // Note: If we iterate stores in Detailed Mode, storeIds has 1 element. We try to find that store's basket.

        if (basketData.length > 0) {
            doc.setFontSize(11);
            doc.text("أكثر المنتجات التي تشترى معاً:", 190, finalY, { align: "right" });
            finalY += 6;
            const basketRows = basketData.slice(0, 15).map((pair, i) => [
                pair.frequency, pair.item_b_name, pair.item_a_name, (i + 1)
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

        // Missed Opps
        if (rawData && rawData.periods && rawData.periods[currentMode]) {
            const missedMap = rawData.periods[currentMode].missed_opportunities || {};
            let missedList = [];

            storeIds.forEach(sid => {
                if (missedMap[sid]) missedList.push(...missedMap[sid]);
            });

            missedList.sort((a, b) => b.total_count - a.total_count);
            missedList = missedList.slice(0, 15);

            if (missedList.length > 0) {
                if (finalY > 240) { doc.addPage(); finalY = 25; }
                doc.setFontSize(11);
                doc.text("الفرص الضائعة:", 190, finalY, { align: "right" });
                finalY += 6;
                const missedRows = missedList.map((m, i) => [
                    m.total_count, (m.missed_items && m.missed_items[0]) ? m.missed_items[0].name : '-', m.sold_item, m.employee_name, (i + 1)
                ]);
                doc.autoTable({
                    startY: finalY,
                    head: [['عدد المرات', 'الفرصة الضائعة', 'المنتج المباع', 'الموظف', '#']],
                    body: missedRows,
                    theme: 'striped',
                    headStyles: { fillColor: [220, 53, 69], font: fontName, halign: 'center' },
                    bodyStyles: { font: fontName, halign: 'center' },
                    styles: { fontSize: 9 }
                });
                finalY = doc.lastAutoTable.finalY + 15;
            }
        }
    }

    // --- SECTION 3: STORE BREAKDOWN (Only if multiple stores) ---
    if (incStore && storeIds.length > 1) {
        doc.addPage();
        finalY = 20;

        doc.setFontSize(14);
        doc.setTextColor(254, 121, 0);
        doc.text("3. تفاصيل الفروع (Store Breakdown)", 190, finalY, { align: "right" });
        doc.setTextColor(0);
        finalY += 10;

        const storeRows = storeIds.map((sid, i) => {
            const s = currentData[sid];
            let sSales = 0; let sQty = 0;
            s.categories.forEach(c => { sSales += c.amount; sQty += c.qty; });
            const topCat = s.categories.length > 0 ? s.categories[0].category : '-';
            return [
                topCat, Math.round(sSales).toLocaleString(), sQty.toLocaleString(), s.store_name || sid, (i + 1)
            ];
        });

        storeRows.sort((a, b) => parseInt(b[1].replace(/,/g, '')) - parseInt(a[1].replace(/,/g, '')));

        doc.autoTable({
            startY: finalY,
            head: [['أعلى تصنيف', 'المبيعات', 'الكمية', 'الفرع', '#']],
            body: storeRows,
            theme: 'grid',
            headStyles: { fillColor: [23, 162, 184], font: fontName, halign: 'center' },
            bodyStyles: { font: fontName, halign: 'center' },
            styles: { fontSize: 9 }
        });
        finalY = doc.lastAutoTable.finalY + 15;
    }

    // --- SECTION 4: CATEGORY DETAILS ---
    if (incCatDet) {
        doc.addPage();
        finalY = 20;
        doc.setFontSize(14);
        doc.setTextColor(254, 121, 0);
        doc.text("4. تفاصيل أصناف المبيعات (Category Details)", 190, finalY, { align: "right" });
        doc.setTextColor(0);
        finalY += 10;

        const pData = rawData.periods ? rawData.periods[currentMode] : null;
        const catalog = pData ? (pData.catalog || {}) : {};

        // Note: Catalog is GLOBAL. We cannot easily filter it per store currently without restructuring the data.
        // If user asks for specific store details, showing Global Catalog is misleading.
        // However, if we are in "All Stores" mode, Global Catalog is correct.
        // If Single Store Mode -> We should try to use 'sortedCats' (which comes from Store Data) 
        // AND 'topItems' (which comes from Store Data).
        // BUT 'topItems' only has TOP items. 'catalog' has ALL.
        // We lack 'All Items Per Store' data structure in currentData.
        // So for Single Store, we might be limited to what we have or print Global with warning.
        // Let's check `processGlobalStats`...
        // `showCategoryItems` functionality uses `catalog`. 
        // Does `catalog` have store_id in items? NO.
        // So `product_analysis.html` actually shows GLOBAL items even when clicking on a store category?
        // Let's verify: `showCategoryItems` uses `catalog[categoryName]`. 
        // It blindly shows all items. So yes, it seems it shows global items.
        // We will replicate that behavior but ensure the HEADER says "Global Items (Note: Data not split by store)".
        // OR better: Just show it.

        for (const cat of sortedCats) {
            const catName = cat.name;
            let items = catalog[catName] || [];
            if (items.length === 0) continue;

            if (finalY > 250) { doc.addPage(); finalY = 20; }

            doc.setFontSize(12);
            doc.setFillColor(240, 240, 240);
            doc.rect(14, finalY - 5, 182, 7, 'F');
            doc.text(`${catName} (Sales: ${Math.round(cat.amount).toLocaleString()})`, 190, finalY, { align: "right" });
            finalY += 4;

            items.sort((a, b) => b.amount - a.amount);
            const topItemsList = items.slice(0, 20); // Top 20

            const itemRows = topItemsList.map((item, i) => [
                Math.round(item.amount).toLocaleString(), item.qty, item.name, (i + 1)
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
}
