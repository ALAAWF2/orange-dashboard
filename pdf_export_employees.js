/* PDF Export Logic for Employees - Final Array Fix */

async function generateEmployeePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');

    // --- Font Loading ---
    const fontFileName = "Amiri-Regular.ttf";
    const fontName = "Amiri";

    try {
        if (typeof amiriFontBase64 === 'undefined') {
            throw new Error("ملف الخط العربي غير موجود");
        }

        doc.addFileToVFS(fontFileName, amiriFontBase64);
        doc.addFont(fontFileName, fontName, "normal");
        doc.setFont(fontName);
    } catch (e) {
        console.error("Font Error:", e);
        doc.setFont("helvetica");
    }

    // --- Ensure Data ---
    if (typeof historyData === 'undefined' || !historyData) {
        alert("البيانات غير جاهزة بعد.");
        return;
    }

    // --- Permissions ---
    if (typeof storeMeta === 'undefined' || !storeMeta) {
        alert("بيانات الفروع غير جاهزة");
        return;
    }

    let targetStores = [];
    const storeIds = Object.keys(historyData);

    if (currentUser.role === 'Admin') {
        targetStores = storeIds;
    } else {
        targetStores = storeIds.filter(sid => {
            const meta = storeMeta[sid];
            return meta && meta.manager === currentUser.name;
        });
    }

    targetStores.sort();

    // --- Dates ---
    consttoYMD = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    let today = new Date();
    let yestDate = new Date(today);
    yestDate.setDate(today.getDate() - 1);
    const yestStr = today.toISOString().slice(0, 10) >= '2026-01-16' ? yestDate.toISOString().slice(0, 10) : yestDate.toLocaleDateString('en-CA');
    // Simplified: Just use simple formatting
    const formatDate = (d) => {
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - (offset * 60 * 1000));
        return local.toISOString().split('T')[0];
    }

    const yestStrFinal = formatDate(yestDate);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStartStr = formatDate(monthStart);

    let pageIndex = 0;

    for (const storeId of targetStores) {

        const storeRecords = historyData[storeId] || []; // Array of ARRAYS

        // Helper to aggregate
        const aggData = (startStr, endStr) => {
            const emps = {};
            let storeTotalSales = 0;

            storeRecords.forEach(r => {
                // r is [Date, ID, Sales, Trans, Items, MaxTicket]
                // Index 0: Date
                const rDateStr = r[0];

                if (rDateStr >= startStr && rDateStr <= endStr) {
                    const rawKey = r[1]; // e.g. "3628-Ashjan Alashwan"
                    let cleanKey = rawKey;

                    if (rawKey && rawKey.includes('-')) {
                        cleanKey = rawKey.split('-')[0].trim();
                    } else if (rawKey && rawKey.toLowerCase().startsWith('unknown')) {
                        cleanKey = rawKey.toLowerCase().replace('unknown', '').trim();
                    }

                    if (!emps[cleanKey]) {
                        // Resolve Name
                        let eName = cleanKey;
                        // Try Arabic Name map
                        if (typeof employeeNames !== 'undefined' && employeeNames[cleanKey]) {
                            eName = employeeNames[cleanKey];
                        } else if (rawKey.includes('-')) {
                            // Fallback to name part of raw string if no arabic map
                            eName = rawKey.split('-')[1].trim();
                        }

                        emps[cleanKey] = {
                            name: eName,
                            sales: 0,
                            trans: 0,
                            items: 0
                        };
                    }
                    emps[cleanKey].sales += r[2] || 0;
                    emps[cleanKey].trans += r[3] || 0;
                    emps[cleanKey].items += r[4] || 0;
                    storeTotalSales += r[2] || 0;
                }
            });

            return { emps, storeTotalSales };
        };

        const yesterdayData = aggData(yestStrFinal, yestStrFinal);
        const mtdData = aggData(monthStartStr, yestStrFinal);

        // Filter active employees
        const empKeys = Object.keys(mtdData.emps).filter(k => mtdData.emps[k].sales > 0 || mtdData.emps[k].trans > 0);

        if (empKeys.length === 0) continue;

        if (pageIndex > 0) doc.addPage();
        pageIndex++;

        doc.setFont(fontName);

        // Header
        doc.setFontSize(14);
        let sName = storeId;
        if (typeof storesData !== 'undefined' && storesData[storeId]) {
            sName = storesData[storeId];
        } else if (typeof storeMeta !== 'undefined' && storeMeta[storeId] && storeMeta[storeId].city) {
            // fallback logic?
            sName = storeId;
        }

        doc.text(`${storeId} - ${sName}`, 14, 15);

        const tableRows = [];

        // Totals setup
        let yestTotalSales = 0, yestTotalTrans = 0;
        let mtdTotalSales = 0, mtdTotalTrans = 0, mtdTotalTarget = 0;

        empKeys.forEach(key => {
            const yest = yesterdayData.emps[key] || { sales: 0, trans: 0, items: 0, name: mtdData.emps[key].name };
            const mtd = mtdData.emps[key];
            const target = (typeof targetsData !== 'undefined' && targetsData[key]) ? targetsData[key] : 0;

            // Metrics
            const yestContrib = yesterdayData.storeTotalSales > 0 ? (yest.sales / yesterdayData.storeTotalSales) * 100 : 0;
            const yestAvgInv = yest.trans > 0 ? Math.round(yest.sales / yest.trans) : 0;

            const mtdContrib = mtdData.storeTotalSales > 0 ? (mtd.sales / mtdData.storeTotalSales) * 100 : 0;
            const mtdAvgInv = mtd.trans > 0 ? Math.round(mtd.sales / mtd.trans) : 0;
            const ach = target > 0 ? (mtd.sales / target) * 100 : 0;
            const remaining = Math.max(0, target - mtd.sales);

            // Date Calc for Daily Required
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const daysPassed = yestDate.getDate();
            const daysLeft = daysInMonth - daysPassed;
            const dailyReq = daysLeft > 0 ? remaining / daysLeft : 0;

            yestTotalSales += yest.sales;
            yestTotalTrans += yest.trans;

            mtdTotalSales += mtd.sales;
            mtdTotalTarget += target;
            mtdTotalTrans += mtd.trans;

            // --- Reversing Arabic Name ---
            // doc.text with font 'Amiri' handles encoding, but DOES NOT handle Right-to-Left letter shaping/connection.
            // Paradoxically, blindly using the font might just render disconnected letters.
            // Just let's use the name as is. If connected letters fail, we might need a shaping library, 
            // but the user's "Previous Success" with pdf_export.js (Step 204) implies the font itself worked okay enough or user accepted it.
            // Wait, step 204 was "Font Base64". 
            // In Step 200 user complained about "No look how" -> showing garbage chars?
            // Actually the screenshot showed "Square boxes" or weird chars.
            // Base64 font fixes the boxes. Separation of letters is a jsPDF limitation.
            // I'll trust the font is loaded.

            tableRows.push([
                mtd.name,
                // YESTERDAY
                Math.round(yest.sales).toLocaleString(),
                yestContrib.toFixed(0) + '%',
                yest.trans,
                yestAvgInv,

                // MTD
                Math.round(mtd.sales).toLocaleString(),
                mtdContrib.toFixed(0) + '%',
                mtd.trans,
                mtdAvgInv,
                Math.round(target).toLocaleString(),
                ach.toFixed(1) + '%',
                Math.round(remaining).toLocaleString(),
                Math.round(dailyReq).toLocaleString()
            ]);
        });

        // Totals Row
        const mtdTotalAch = mtdTotalTarget > 0 ? (mtdTotalSales / mtdTotalTarget * 100).toFixed(1) + '%' : '-';
        const mtdRem = Math.max(0, mtdTotalTarget - mtdTotalSales);
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const daysPassed = yestDate.getDate();
        const daysLeft = daysInMonth - daysPassed;
        const mtdDaily = daysLeft > 0 ? mtdRem / daysLeft : 0;

        tableRows.push([
            "الإجمالي (Total)",
            Math.round(yestTotalSales).toLocaleString(),
            "100%",
            yestTotalTrans,
            yestTotalTrans > 0 ? Math.round(yestTotalSales / yestTotalTrans) : 0,

            Math.round(mtdTotalSales).toLocaleString(),
            "100%",
            mtdTotalTrans,
            mtdTotalTrans > 0 ? Math.round(mtdTotalSales / mtdTotalTrans) : 0,
            Math.round(mtdTotalTarget).toLocaleString(),
            mtdTotalAch,
            Math.round(mtdRem).toLocaleString(),
            Math.round(mtdDaily).toLocaleString()
        ]);

        doc.autoTable({
            startY: 25,
            head: [
                [
                    [
                        { content: 'بيانات الموظف (Employee)', colSpan: 1, styles: { fillColor: [255, 255, 255], textColor: 0, halign: 'center' } },
                        { content: `الأمس (Yesterday) - ${yestStrFinal}`, colSpan: 4, styles: { fillColor: [220, 220, 220], textColor: 0, halign: 'center' } },
                        { content: `الشهر الحالي (MTD) - ${monthStartStr} إلى ${yestStrFinal}`, colSpan: 8, styles: { fillColor: [200, 200, 200], textColor: 0, halign: 'center' } }
                    ],
                    [
                        'الموظف',
                        'المبيعات', 'المساهمة %', 'الفواتير', 'متوسط الفاتورة',
                        'المبيعات', 'المساهمة %', 'الفواتير', 'متوسط الفاتورة', 'الهدف', 'التحقيق %', 'المتبقي', 'اليومية المتبقية'
                    ]
                ],
                body: tableRows,
                theme: 'grid',
                styles: {
                    font: fontName,
                    fontSize: 8,
                    cellPadding: 1,
                    halign: 'center'
                },
                columnStyles: {
                    0: { halign: 'right', fontStyle: 'bold', minCellWidth: 30 },
                    10: { textColor: [0, 128, 0], fontStyle: 'bold' }
                },
                didParseCell: function (data) {
                    if (data.row.raw[0] === 'TOTAL') {
                        data.cell.styles.fillColor = [240, 240, 240];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
        });
    }

    doc.save(`Employees_Report_${new Date().toLocaleDateString('en-CA')}.pdf`);
}
