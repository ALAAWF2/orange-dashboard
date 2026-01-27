/* PDF Export Logic - Final (Base64 Font) */

async function generatePDF(targetStoreId = 'all', isDetailed = false) {
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
        console.log("Arabic Font Applied");
    } catch (e) {
        console.error("Font Error:", e);
        alert("تنبيه: لم يتم تحميل الخط العربي. ستظهر النصوص بشكل غير صحيح.");
        doc.setFont("helvetica"); // Fallback
    }

    // --- Ensure Data ---
    if (typeof rawData === 'undefined' || !rawData || !rawData.store_meta) {
        alert("البيانات غير جاهزة بعد.");
        return;
    }

    const storeMeta = rawData.store_meta;

    // --- Filter Stores for "All" or "Single" ---
    let storesToProcess = [];
    const selManager = document.getElementById('managerFilter') ? document.getElementById('managerFilter').value : 'all';

    // Helper: Is store accessible?
    const isAccessible = (id) => {
        const meta = storeMeta[id];
        if (!meta || meta.type !== 'Showroom') return false;

        // Admin or Manager Check
        if (currentUser.role !== 'Admin' && meta.manager !== currentUser.name) return false;

        // Dashboard Filter Check (Manager Filter)
        if (selManager !== 'all' && meta.manager !== selManager) return false;

        return true;
    };

    if (targetStoreId === 'all') {
        storesToProcess = Object.keys(storeMeta).filter(isAccessible);
    } else {
        if (isAccessible(targetStoreId)) {
            storesToProcess = [targetStoreId];
        }
    }

    if (storesToProcess.length === 0) {
        alert("لا توجد فروع لعرض التقرير");
        return;
    }

    // --- Dates ---
    let startDate, endDate;
    if (window.dashboardState && window.dashboardState.start && window.dashboardState.end) {
        startDate = new Date(window.dashboardState.start);
        endDate = new Date(window.dashboardState.end);
    } else {
        let today = new Date();
        endDate = new Date(today);
        endDate.setDate(today.getDate() - 1);
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    let pageIndex = 0;

    // --- Function to Render a Report Page ---
    const renderPage = (title, storeIdForData, isGlobal = false) => {
        if (pageIndex > 0) doc.addPage();
        pageIndex++;

        doc.setFont(fontName);

        // Header
        doc.setFontSize(18);
        doc.text(title, 14, 20);

        doc.setFontSize(12);
        if (isGlobal) {
            doc.text(`Report Type: Global Summary (${storesToProcess.length} Stores)`, 14, 28);
        } else {
            const m = storeMeta[storeIdForData];
            doc.text(`Manager: ${m ? m.manager : '-'}`, 14, 28);
        }
        doc.text(`Date: ${startDate.toLocaleDateString('en-CA')} to ${endDate.toLocaleDateString('en-CA')}`, 14, 34);

        // --- Calculate Data ---
        // Pre-calc totals for Header KPI
        let headerTotalTarget = 0;
        let headerTotalSales = 0;

        let mStart = new Date(startDate);
        let mEnd = new Date(endDate);

        // Calculate Remaining Days
        const nowReq = new Date();
        const lastDayOfMonth = new Date(nowReq.getFullYear(), nowReq.getMonth() + 1, 0).getDate();
        let remainingDays = lastDayOfMonth - nowReq.getDate() + 1;
        if (remainingDays < 1) remainingDays = 1;


        // 1. First Pass: Calculate Header Totals (Target & Sales)
        let preLoopDate = new Date(mStart);
        while (preLoopDate <= mEnd) {
            const dateStr = preLoopDate.toLocaleDateString('en-CA');
            const dayData = isGlobal
                ? getGlobalDayData(storesToProcess, dateStr)
                : getDayData(storeIdForData, dateStr);

            headerTotalTarget += dayData.target || 0;
            headerTotalSales += dayData.sales || 0;
            preLoopDate.setDate(preLoopDate.getDate() + 1);
        }

        let dailyReq = 0;
        if (headerTotalTarget > headerTotalSales) {
            dailyReq = (headerTotalTarget - headerTotalSales) / remainingDays;
        }
        const achPct = headerTotalTarget > 0 ? ((headerTotalSales / headerTotalTarget) * 100).toFixed(1) : '0.0';

        // Summary KPIs Text
        const kpiText = `اليومية المتبقية: ${Math.round(dailyReq).toLocaleString()}   |   التحقيق: ${achPct}%   |   الهدف: ${Math.round(headerTotalTarget).toLocaleString()}`;
        doc.text(kpiText, 200, 28, { align: 'right' });

        // 2. Build Table Rows
        let rows = [];
        let grandTotalSales = 0;
        let grandSalesLY = 0;
        let grandVisitors = 0;
        let grandVisitorsLY = 0;
        let grandTrans = 0;

        let loopDate = new Date(mStart);
        while (loopDate <= mEnd) {
            const dateStr = loopDate.toLocaleDateString('en-CA');
            const dayData = isGlobal
                ? getGlobalDayData(storesToProcess, dateStr)
                : getDayData(storeIdForData, dateStr);

            const sales = dayData.sales || 0;
            const visitors = dayData.visitors || 0;
            const trans = dayData.trans || 0;

            let lyDate = new Date(loopDate);
            lyDate.setFullYear(loopDate.getFullYear() - 1);
            const lyDateStr = lyDate.toLocaleDateString('en-CA');

            const lyData = isGlobal
                ? getGlobalDayData(storesToProcess, lyDateStr)
                : getDayData(storeIdForData, lyDateStr);

            const salesLY = lyData.sales || 0;
            const visitorsLY = lyData.visitors || 0;

            const growth = salesLY > 0 ? ((sales - salesLY) / salesLY * 100).toFixed(1) + '%' : '-';
            const avgInv = trans > 0 ? Math.round(sales / trans) : 0;
            const custVal = visitors > 0 ? Math.round(sales / visitors) : 0;
            const conv = visitors > 0 ? ((trans / visitors) * 100).toFixed(1) + '%' : '-';

            rows.push([
                dateStr,
                Math.round(sales).toLocaleString(),
                Math.round(salesLY).toLocaleString(),
                growth,
                trans,
                avgInv,
                custVal,
                visitors,
                visitorsLY,
                conv
            ]);

            grandTotalSales += sales;
            grandSalesLY += salesLY;
            grandVisitors += visitors;
            grandVisitorsLY += visitorsLY;
            grandTrans += trans;

            loopDate.setDate(loopDate.getDate() + 1);
        }

        // Totals Row
        const grandGrowth = grandSalesLY > 0 ? ((grandTotalSales - grandSalesLY) / grandSalesLY * 100).toFixed(1) + '%' : '-';
        const grandAvgInv = grandTrans > 0 ? Math.round(grandTotalSales / grandTrans) : 0;
        const grandCustVal = grandVisitors > 0 ? Math.round(grandTotalSales / grandVisitors) : 0;
        const grandConv = grandVisitors > 0 ? ((grandTrans / grandVisitors) * 100).toFixed(1) + '%' : '-';

        rows.push([
            "الإجمالي",
            Math.round(grandTotalSales).toLocaleString(),
            Math.round(grandSalesLY).toLocaleString(),
            grandGrowth,
            grandTrans,
            grandAvgInv,
            grandCustVal,
            grandVisitors,
            grandVisitorsLY,
            grandConv
        ]);

        doc.autoTable({
            head: [['التاريخ', 'مبيعات 2026', 'مبيعات 2025', 'النمو %', 'عدد الفواتير', 'متوسط الفاتورة', 'قيمة العميل', 'زوار 2026', 'زوار 2025', 'التحويل %']],
            body: rows,
            startY: 35,
            theme: 'grid',
            headStyles: {
                fillColor: [254, 121, 0],
                textColor: 255,
                halign: 'center',
                valign: 'middle',
                font: fontName,
                fontSize: 8
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 25 },
                1: { halign: 'center', fontStyle: 'bold' },
            },
            styles: {
                font: fontName,
                fontSize: 7,
                cellPadding: 0.8,
                halign: 'center',
                valign: 'middle'
            },
            margin: { top: 10, bottom: 10, left: 10, right: 10 },
            didParseCell: function (data) {
                if (data.row.raw[0] === 'الإجمالي') {
                    data.cell.styles.fillColor = [240, 240, 240];
                }
            }
        });
    };

    // --- Execution Logic ---

    // 1. Global Summary (If "All" selected)
    if (targetStoreId === 'all') {
        renderPage("Global Summary - ملخص عام", null, true);
    }

    // 2. Individual Reports (If specific store OR "Detailed" checked)
    if (targetStoreId !== 'all' || isDetailed) {
        for (const storeId of storesToProcess) {
            let storeName = rawData.stores ? (rawData.stores[storeId] || storeId) : storeId;
            renderPage(`${storeId} - ${storeName}`, storeId, false);
        }
    }

    doc.save(`Sales_Report_${targetStoreId}_${new Date().toLocaleDateString('en-CA')}.pdf`);
}

function getDayData(storeId, dateStr) {
    if (!rawData) return { sales: 0, target: 0, visitors: 0, trans: 0 };
    const findValue = (arr) => {
        if (!arr) return 0;
        const item = arr.find(row => row[0] === dateStr && row[1] == storeId);
        return item ? item[2] : 0;
    };
    return {
        sales: findValue(rawData.sales),
        target: findValue(rawData.targets),
        visitors: findValue(rawData.visitors),
        trans: findValue(rawData.transactions)
    };
}

function getGlobalDayData(storeIds, dateStr) {
    let total = { sales: 0, target: 0, visitors: 0, trans: 0 };
    storeIds.forEach(sid => {
        const d = getDayData(sid, dateStr);
        total.sales += d.sales;
        total.target += d.target;
        total.visitors += d.visitors;
        total.trans += d.trans;
    });
    return total;
}
