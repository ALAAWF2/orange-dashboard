/* PDF Export Logic - Final (Base64 Font) */

function shouldHideVisitorsGlobal() {
    if (typeof shouldHideVisitors === 'function') {
        return shouldHideVisitors();
    }
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return false;
    const currentUser = JSON.parse(userStr);
    if (currentUser.name === 'Sales Manager' || currentUser.role === 'Admin') return false;
    if (typeof USERS !== 'undefined' && USERS[currentUser.name]) {
        return USERS[currentUser.name].hide_visitors === true;
    }
    return currentUser.hide_visitors === true;
}

function getRemainingDays(metadataEndDate, currentRangeStart) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (metadataEndDate && currentRangeStart) {
        const parts = metadataEndDate.split('-');
        if (parts.length === 3) {
            const customEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            customEnd.setHours(0, 0, 0, 0);
            
            let extTargetMonthStart = new Date(customEnd.getFullYear(), customEnd.getMonth(), 1);
            if (customEnd.getDate() < 15) {
                extTargetMonthStart = new Date(customEnd.getFullYear(), customEnd.getMonth() - 1, 1);
            }
            
            const isExtendedMonth = currentRangeStart.getFullYear() === extTargetMonthStart.getFullYear() && 
                                    currentRangeStart.getMonth() === extTargetMonthStart.getMonth();
                                    
            if (isExtendedMonth && today <= customEnd) {
                const diffTime = customEnd.getTime() - today.getTime();
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
                return Math.max(1, diffDays);
            }
        }
    }

    const referenceDate = currentRangeStart || today;
    let lastDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
    let todayDate = today.getDate();

    if (referenceDate.getFullYear() < today.getFullYear() || 
        (referenceDate.getFullYear() === today.getFullYear() && referenceDate.getMonth() < today.getMonth())) {
        return 1;
    }

    if (referenceDate.getFullYear() > today.getFullYear() || 
        (referenceDate.getFullYear() === today.getFullYear() && referenceDate.getMonth() > today.getMonth())) {
        return lastDayOfMonth;
    }

    if (today.getFullYear() === 2026 && today.getMonth() === 2) {
        if (todayDate <= 19) lastDayOfMonth = 19;
        else { lastDayOfMonth = 12; todayDate = todayDate - 19; }
    }

    let remainingDays = lastDayOfMonth - todayDate + 1;
    return Math.max(1, remainingDays);
}

async function buildPDFDoc(targetStoreId = 'all', isDetailed = false) {
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
        doc.setFont("helvetica");
    }

    // --- Ensure Data ---
    if (typeof rawData === 'undefined' || !rawData || !rawData.store_meta) {
        alert("البيانات غير جاهزة بعد.");
        return null;
    }

    const storeMeta = rawData.store_meta;

    // --- Filter Stores for "All" or "Single" ---
    let storesToProcess = [];
    const selManager = document.getElementById('managerFilter') ? document.getElementById('managerFilter').value : 'all';

    // Helper: Is store accessible?
    const isAccessible = (id) => {
        const meta = storeMeta[id];
        if (!meta || meta.type !== 'Showroom') return false;

        const userStr = localStorage.getItem('currentUser');
        const user = userStr ? JSON.parse(userStr) : (typeof currentUser !== 'undefined' ? currentUser : {});

        // Admin or Manager or Alaa Check
        if (user.role !== 'Admin' && user.name !== 'علاء' && meta.manager !== user.name) return false;

        // Dashboard Filter Check (Manager Filter) - applied only when requesting 'all'
        if (targetStoreId === 'all' && selManager !== 'all' && meta.manager !== selManager) return false;

        return true;
    };

    if (targetStoreId === 'all') {
        storesToProcess = Object.keys(storeMeta).filter(isAccessible);
    } else {
        if (isAccessible(targetStoreId)) {
            storesToProcess = [targetStoreId];
        } else if (storeMeta[targetStoreId]) {
            storesToProcess = [targetStoreId];
        }
    }

    if (storesToProcess.length === 0) {
        alert("لا توجد فروع لعرض التقرير");
        return null;
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
        let headerTotalTarget = 0;
        let headerTotalSales = 0;
        let mStart = new Date(startDate);
        let mEnd = new Date(endDate);
        let remainingDays = getRemainingDays(rawData.metadata ? rawData.metadata.target_end_date : null, mStart);

        let preLoopDate = new Date(mStart);
        while (preLoopDate <= mEnd) {
            const dateStr = preLoopDate.toLocaleDateString('en-CA');
            const dayData = isGlobal ? getGlobalDayData(storesToProcess, dateStr) : getDayData(storeIdForData, dateStr);
            let targetVal = dayData.target || 0;
            if (targetVal > 0 && rawData.metadata && rawData.metadata.target_end_date) {
                const extDate = new Date(rawData.metadata.target_end_date);
                const extMonth = extDate.getMonth() === 0 ? 11 : extDate.getMonth() - 1;
                const extYear = extDate.getMonth() === 0 ? extDate.getFullYear() - 1 : extDate.getFullYear();
                if (mStart.getFullYear() === extYear && mStart.getMonth() === extMonth) {
                    const targetDate = new Date(dateStr);
                    if (targetDate.getFullYear() !== extYear || targetDate.getMonth() !== extMonth) targetVal = 0;
                }
            }
            headerTotalTarget += targetVal;
            headerTotalSales += dayData.sales || 0;
            preLoopDate.setDate(preLoopDate.getDate() + 1);
        }

        let dailyReq = 0;
        if (headerTotalTarget > headerTotalSales) {
            dailyReq = Math.ceil((headerTotalTarget - headerTotalSales) / remainingDays);
        }

        let achievement = headerTotalTarget > 0 ? ((headerTotalSales / headerTotalTarget) * 100).toFixed(1) + '%' : '0%';

        // Summary Cards
        doc.setFontSize(10);
        doc.text(`Total Sales: ${Math.round(headerTotalSales).toLocaleString('en-US')} SAR`, 180, 20);
        doc.text(`Total Target: ${Math.round(headerTotalTarget).toLocaleString('en-US')} SAR`, 180, 26);
        doc.text(`Achievement: ${achievement}`, 180, 32);
        doc.text(`Daily Required: ${Math.round(dailyReq).toLocaleString('en-US')} SAR (${remainingDays} days left)`, 180, 38);

        // --- Table Data ---
        let tableRows = [];
        let curDate = new Date(mStart);
        let totSales = 0, totTarget = 0, totVis = 0, totTrans = 0;

        while (curDate <= mEnd) {
            const dateStr = curDate.toLocaleDateString('en-CA');
            const dayData = isGlobal ? getGlobalDayData(storesToProcess, dateStr) : getDayData(storeIdForData, dateStr);
            let targetVal = dayData.target || 0;
            if (targetVal > 0 && rawData.metadata && rawData.metadata.target_end_date) {
                const extDate = new Date(rawData.metadata.target_end_date);
                const extMonth = extDate.getMonth() === 0 ? 11 : extDate.getMonth() - 1;
                const extYear = extDate.getMonth() === 0 ? extDate.getFullYear() - 1 : extDate.getFullYear();
                if (mStart.getFullYear() === extYear && mStart.getMonth() === extMonth) {
                    const targetDate = new Date(dateStr);
                    if (targetDate.getFullYear() !== extYear || targetDate.getMonth() !== extMonth) targetVal = 0;
                }
            }
            totSales += dayData.sales;
            totTarget += targetVal;
            totVis += dayData.visitors;
            totTrans += dayData.trans;

            let dayAch = targetVal > 0 ? ((dayData.sales / targetVal) * 100).toFixed(1) + '%' : '-';
            let avgInv = dayData.trans > 0 ? Math.round(dayData.sales / dayData.trans) : 0;
            let conv = dayData.visitors > 0 ? ((dayData.trans / dayData.visitors) * 100).toFixed(1) + '%' : '-';
            const displayVis = shouldHideVisitorsGlobal() ? '-' : dayData.visitors.toLocaleString('en-US');
            const displayConv = shouldHideVisitorsGlobal() ? '-' : conv;

            tableRows.push([dateStr, Math.round(dayData.sales).toLocaleString('en-US'), Math.round(targetVal).toLocaleString('en-US'), dayAch, dayData.trans.toLocaleString('en-US'), avgInv.toLocaleString('en-US'), displayVis, displayConv]);
            curDate.setDate(curDate.getDate() + 1);
        }

        // Totals Row
        let totAch = totTarget > 0 ? ((totSales / totTarget) * 100).toFixed(1) + '%' : '-';
        let totAvgInv = totTrans > 0 ? Math.round(totSales / totTrans) : 0;
        let totConv = totVis > 0 ? ((totTrans / totVis) * 100).toFixed(1) + '%' : '-';
        tableRows.push(['الإجمالي', Math.round(totSales).toLocaleString('en-US'), Math.round(totTarget).toLocaleString('en-US'), totAch, totTrans.toLocaleString('en-US'), totAvgInv.toLocaleString('en-US'), shouldHideVisitorsGlobal() ? '-' : totVis.toLocaleString('en-US'), shouldHideVisitorsGlobal() ? '-' : totConv]);

        doc.autoTable({
            startY: 45,
            head: [['التاريخ (Date)', 'المبيعات (Sales)', 'الهدف (Target)', 'التحقيق (%)', 'الفواتير (Trans)', 'متوسط الفاتورة (Avg Bill)', 'الزوار (Visitors)', 'معدل التحويل (Conv %)']],
            body: tableRows,
            styles: { font: fontName, fontSize: 9, halign: 'center' },
            headStyles: { fillColor: [254, 121, 0], textColor: 255, fontStyle: 'normal' },
            margin: { top: 10, bottom: 10, left: 10, right: 10 },
            didParseCell: function (data) { if (data.row.raw[0] === 'الإجمالي') data.cell.styles.fillColor = [240, 240, 240]; }
        });
    };

    if (targetStoreId === 'all') renderPage("Global Summary - ملخص عام", null, true);
    if (targetStoreId !== 'all' || isDetailed) {
        for (const storeId of storesToProcess) {
            let storeName = rawData.stores ? (rawData.stores[storeId] || storeId) : storeId;
            renderPage(`${storeId} - ${storeName}`, storeId, false);
        }
    }

    return doc;
}

async function generatePDF(targetStoreId = 'all', isDetailed = false) {
    const doc = await buildPDFDoc(targetStoreId, isDetailed);
    if (doc) {
        doc.save(`Sales_Report_${targetStoreId}_${new Date().toLocaleDateString('en-CA')}.pdf`);
    }
}

async function shareStorePdfWebShare(targetStoreId, storeName) {
    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : (typeof currentUser !== 'undefined' ? currentUser : {});
    if (user.name !== 'علاء') {
        if (typeof showToast === 'function') showToast("هذه الميزة متاحة حصرياً للمستخدم علاء");
        else alert("هذه الميزة متاحة حصرياً للمستخدم علاء");
        return;
    }
    try {
        if (typeof showToast === 'function') showToast(`جاري إعداد تقرير PDF لمعرض ${storeName}...`);
        const doc = await buildPDFDoc(targetStoreId, false);
        if (!doc) return;
        const pdfBlob = doc.output('blob');
        const cleanName = String(storeName).replace(/[/\\?%*:|"<>]/g, '_');
        const fileName = `Orange_Report_${cleanName}_${new Date().toLocaleDateString('en-CA')}.pdf`;
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ title: `تقرير مبيعات معرض ${storeName}`, text: `السلام عليكم، مرفق تقرير مبيعات وأداء معرض Orange - ${storeName} 🍊`, files: [file] });
            if (typeof showToast === 'function') showToast(`تم فتح مشاركة تقرير ${storeName}`);
        } else {
            doc.save(fileName);
            if (typeof showToast === 'function') showToast(`تم تنزيل ملف الـ PDF لمعرض ${storeName}`);
        }
    } catch (e) {
        if (e && e.name !== 'AbortError') console.error('Share PDF Error:', e);
    }
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
