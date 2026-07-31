/**
 * excel_export.js
 * Handles Excel export for both Store Sales and Employee Sales (Sales Manager only).
 */

let excelModal = null;

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

// Initialize Modal
function showExcelModal() {
    if (!excelModal) {
        excelModal = new bootstrap.Modal(document.getElementById('excelDateModal'));
    }

    // 1. Pre-fill Dates (from Dashboard filters if custom, else standard month)
    const startDateVal = document.getElementById('startDate').value;
    const endDateVal = document.getElementById('endDate').value;

    document.getElementById('excelStartDate').value = startDateVal;
    document.getElementById('excelEndDate').value = endDateVal;

    // Set Default Previous Year Dates
    updateExcelPrevStartDate();
    updateExcelPrevEndDate();

    // 2. Check Permissions for Employee Request
    const user = JSON.parse(localStorage.getItem('currentUser'));
    const reportTypeGroup = document.getElementById('excelReportTypeGroup');

    // Explicitly check for "Sales Manager" as requested
    if (user && (user.name === 'Sales Manager' || user.role === 'Admin')) {
        reportTypeGroup.style.display = 'block';
    } else {
        reportTypeGroup.style.display = 'none';
        // Reset to Store default just in case
        document.getElementById('typeStore').checked = true;
    }

    excelModal.show();
}

function getPrevDateForExport(dStr) {
    if (!dStr) return '';
    let pDate = new Date(dStr);
    pDate.setFullYear(pDate.getFullYear() - 1);
    if (dStr.startsWith('2026-02') || dStr.startsWith('2026-03')) {
        pDate.setDate(pDate.getDate() + 11);
    }
    // To enable April shift (+5 days) for Ramadan/Eid alignment, uncomment below:
    // else if (dStr.startsWith('2026-04')) { pDate.setDate(pDate.getDate() + 5); }
    return pDate.toLocaleDateString('en-CA');
}

function updateExcelPrevStartDate() {
    const startVal = document.getElementById('excelStartDate').value;
    if (startVal) document.getElementById('excelPrevStartDate').value = getPrevDateForExport(startVal);
}

function updateExcelPrevEndDate() {
    const endVal = document.getElementById('excelEndDate').value;
    if (endVal) document.getElementById('excelPrevEndDate').value = getPrevDateForExport(endVal);
}

async function generateExcelReport() {
    const startDate = document.getElementById('excelStartDate').value;
    const endDate = document.getElementById('excelEndDate').value;
    const reportType = document.querySelector('input[name="excelReportType"]:checked').value;

    if (!startDate || !endDate) {
        alert("الرجاء اختيار الفترة الزمنية");
        return;
    }

    const btn = document.querySelector('#excelDateModal .btn-success');
    const originalText = btn.textContent;
    btn.textContent = 'جاري التصدير...';
    btn.disabled = true;

    try {
        if (reportType === 'employee') {
            await exportEmployeeSales(startDate, endDate);
        } else {
            await exportStoreSales(startDate, endDate);
        }

        // Close Modal on success
        excelModal.hide();

    } catch (e) {
        console.error(e);
        alert("حدث خطأ أثناء التصدير: " + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// --- OPTION 1: Store Sales Export (Corrected for Flat List Structure) ---
async function exportStoreSales(startDate, endDate) {
    if (!window.rawData) {
        throw new Error("لا توجد بيانات (Data not loaded yet)");
    }

    const managerFilter = document.getElementById('managerFilter').value;
    const cityFilter = document.getElementById('cityFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;
    const branchFilter = document.getElementById('branchFilter').value;

    // Helper: Check filters
    const passFilter = (storeId) => {
        if (branchFilter !== 'all' && storeId !== branchFilter) return false;

        const meta = (window.rawData.store_meta && window.rawData.store_meta[storeId]) || {};
        if (managerFilter !== 'all' && meta.manager !== managerFilter) return false;
        if (cityFilter !== 'all' && meta.city !== cityFilter) return false;
        if (typeFilter !== 'all' && meta.type !== typeFilter) return false;

        return true;
    };

    // Helper: Date Check
    // Dates in JSON are YYYY-MM-DD string. Inputs are same. String comparison works perfectly for ISO dates.
    const inRange = (dStr) => dStr >= startDate && dStr <= endDate;

    // Aggregation Map: "Date_StoreId" -> { date, storeId, sales, trans, visitors, items }
    let dataMap = {};

    const getKey = (d, s) => `${d}_${s}`;
    const ensureEntry = (d, s) => {
        const k = getKey(d, s);
        if (!dataMap[k]) {
            dataMap[k] = {
                date: d,
                storeId: s,
                sales: 0,
                target: 0,
                trans: 0,
                visitors: 0,
                items: 0
            };
        }
        return dataMap[k];
    };

    // Pre-populate dataMap for all dates in range and all filtered stores
    const allStoreIds = Object.keys(window.rawData.stores || {});
    let currentDate = new Date(startDate);
    const endObj = new Date(endDate);

    while (currentDate <= endObj) {
        const dStr = currentDate.toLocaleDateString('en-CA');
        allStoreIds.forEach(s => {
            // Include store if it passes the filter, even if there are no sales
            if (passFilter(s)) {
                ensureEntry(dStr, s);
            }
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }

    const salesDict = {};
    const visitorsDict = {};
    const transDict = {};
    const itemsDict = {};

    // 1. Process Sales
    if (window.rawData.sales) {
        window.rawData.sales.forEach(([d, s, v]) => {
            salesDict[`${d}_${s}`] = v;
            if (inRange(d) && passFilter(s)) {
                let entry = ensureEntry(d, s);
                entry.sales += v;
            }
        });
    }

    // 1.1 Process Targets
    if (window.rawData.targets) {
        window.rawData.targets.forEach(([d, s, v]) => {
            if (inRange(d) && passFilter(s)) {
                let entry = ensureEntry(d, s);
                entry.target += v;
            }
        });
    }

    // 2. Process Transactions
    if (window.rawData.transactions) {
        window.rawData.transactions.forEach(([d, s, v]) => {
            transDict[`${d}_${s}`] = v;
            if (inRange(d) && passFilter(s)) {
                let entry = ensureEntry(d, s);
                entry.trans += v;
            }
        });
    }

    // 2.1 Process Items (Pieces)
    if (window.rawData.items) {
        window.rawData.items.forEach(([d, s, v]) => {
            itemsDict[`${d}_${s}`] = v;
            if (inRange(d) && passFilter(s)) {
                let entry = ensureEntry(d, s);
                entry.items += v;
            }
        });
    }

    // 3. Process Visitors
    if (window.rawData.visitors) {
        window.rawData.visitors.forEach(([d, s, v]) => {
            visitorsDict[`${d}_${s}`] = v;
            if (inRange(d) && passFilter(s)) {
                let entry = ensureEntry(d, s);
                entry.visitors += v;
            }
        });
    }

    // Convert Map to Rows
    let rows = Object.values(dataMap);

    if (rows.length === 0) {
        alert("لا توجد بيانات للفترة المحددة (No data found)");
        return;
    }

    const prevStartStr = document.getElementById('excelPrevStartDate').value;
    const prevEndStr = document.getElementById('excelPrevEndDate').value;
    const isCustomPrevDate = (prevStartStr !== getPrevDateForExport(startDate)) || (prevEndStr !== getPrevDateForExport(endDate));

    let offsetDays = 0;
    if (isCustomPrevDate && startDate && prevStartStr) {
        const [sy, sm, sd] = startDate.split('-').map(Number);
        const [psy, psm, psd] = prevStartStr.split('-').map(Number);
        const sUtc = Date.UTC(sy, sm - 1, sd);
        const psUtc = Date.UTC(psy, psm - 1, psd);
        offsetDays = Math.round((sUtc - psUtc) / (1000 * 60 * 60 * 24));
    }

    // Sort: Date asc, then Store Name asc
    rows.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        const nameA = window.rawData.stores[a.storeId] || '';
        const nameB = window.rawData.stores[b.storeId] || '';
        return nameA.localeCompare(nameB);
    });

    // Format for Excel
    let excelRows = rows.map(r => {
        const meta = (window.rawData.store_meta && window.rawData.store_meta[r.storeId]) || {};
        const ach = r.target > 0 ? ((r.sales / r.target) * 100).toFixed(1) + '%' : '0%';

        const [ry, rm, rd] = r.date.split('-').map(Number);
        let pDate = new Date(ry, rm - 1, rd);

        if (isCustomPrevDate) {
            pDate.setDate(pDate.getDate() - offsetDays);
        } else {
            pDate.setFullYear(pDate.getFullYear() - 1);
            if (r.date.startsWith('2026-02') || r.date.startsWith('2026-03')) {
                pDate.setDate(pDate.getDate() + 11);
            }
            // To enable April shift (+5 days) for Ramadan/Eid alignment, uncomment below:
            // else if (r.date.startsWith('2026-04')) { pDate.setDate(pDate.getDate() + 5); }
        }

        let pyy = pDate.getFullYear();
        let pmm = String(pDate.getMonth() + 1).padStart(2, '0');
        let pdd = String(pDate.getDate()).padStart(2, '0');
        let pyStr = `${pyy}-${pmm}-${pdd}`;

        let prevSales = salesDict[`${pyStr}_${r.storeId}`] || 0;
        let prevVisitors = visitorsDict[`${pyStr}_${r.storeId}`] || 0;
        let prevTrans = transDict[`${pyStr}_${r.storeId}`] || 0;
        let prevItems = itemsDict[`${pyStr}_${r.storeId}`] || 0;

        return {
            "التاريخ": r.date,
            "المعرض": window.rawData.stores[r.storeId] || r.storeId,
            "المدينة": meta.city || '-',
            "مدير المنطقة": meta.manager || '-',
            "المبيعات": r.sales,
            "مبيعات السنة السابقة": prevSales,
            "الهدف": r.target,
            "نسبة التحقيق": ach,
            "عدد الفواتير": r.trans,
            "عدد فواتير السنة السابقة": prevTrans,
            "الزوار": shouldHideVisitorsGlobal() ? '-' : r.visitors,
            "زوار السنة السابقة": shouldHideVisitorsGlobal() ? '-' : prevVisitors,
            "متوسط الفاتورة": r.trans > 0 ? (r.sales / r.trans).toFixed(0) : 0,
            "متوسط الفاتورة السنة السابقة": prevTrans > 0 ? (prevSales / prevTrans).toFixed(0) : 0,
            "عدد القطع": r.items || 0,
            "عدد قطع السنة السابقة": prevItems || 0,
            "معدل القطع بالفاتورة": r.trans > 0 ? (r.items / r.trans).toFixed(1) : 0,
            "معدل القطع بالفاتورة السنة السابقة": prevTrans > 0 ? (prevItems / prevTrans).toFixed(1) : 0,
            "نسبة التحويل": (r.visitors > 0 ? ((r.trans / r.visitors) * 100).toFixed(1) + '%' : '0%')
        };
    });

    // Create Worksheet
    const ws = XLSX.utils.json_to_sheet(excelRows);

    // Auto-width columns roughly
    const wscols = [
        { wch: 12 }, // Date
        { wch: 25 }, // Store
        { wch: 10 }, // City
        { wch: 15 }, // Manager
        { wch: 10 }, // Sales
        { wch: 20 }, // Prev Sales
        { wch: 10 }, // Target
        { wch: 12 }, // Achievement
        { wch: 12 }, // Trans
        { wch: 22 }, // Prev Trans
        { wch: 10 }, // Visitors
        { wch: 20 }, // Prev Visitors
        { wch: 15 }, // Avg
        { wch: 25 }, // Prev Avg
        { wch: 12 }, // Items
        { wch: 22 }, // Prev Items
        { wch: 20 }, // Avg Items/Invoice
        { wch: 30 }, // Prev Avg Items/Invoice
        { wch: 12 }  // Conv
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Store Sales");

    // Export
    XLSX.writeFile(wb, `Store_Sales_${startDate}_${endDate}.xlsx`);
}

function getCommissionTargetDate(dateYmd) {
    if (dateYmd >= '2026-03-20' && dateYmd <= '2026-03-31') {
        return '2026-03-20';
    }
    return `${dateYmd.slice(0, 7)}-01`;
}

function parseCommissionEmployeeIdentity(rawEmployee) {
    const raw = String(rawEmployee || '').trim();
    if (!raw || /^(none|r)$/i.test(raw)) return null;

    const separatorIndex = raw.indexOf('-');
    const oldNumber = (separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw).trim();
    const fallbackName = separatorIndex >= 0 ? raw.slice(separatorIndex + 1).trim() : '';
    if (!oldNumber || fallbackName === 'مرتجع') return null;

    const normalizedId = /^\d+$/.test(oldNumber)
        ? oldNumber.padStart(4, '0')
        : oldNumber;
    return { oldNumber, normalizedId, fallbackName };
}

function getCommissionEmployeeCandidates(identity, salesGroupMap) {
    const unpaddedId = /^\d+$/.test(identity.normalizedId)
        ? String(Number(identity.normalizedId))
        : identity.normalizedId;
    const directCandidates = [
        identity.oldNumber,
        identity.normalizedId,
        unpaddedId
    ].filter(Boolean);
    const mappedId = directCandidates
        .map(candidate => salesGroupMap[candidate])
        .find(value => value != null && String(value).trim() !== '');
    const mappedText = mappedId == null ? '' : String(mappedId).trim();
    const mappedNormalized = /^\d+$/.test(mappedText)
        ? mappedText.padStart(4, '0')
        : mappedText;
    const mappedUnpadded = /^\d+$/.test(mappedNormalized)
        ? String(Number(mappedNormalized))
        : mappedNormalized;

    return {
        mappedId: mappedText,
        candidates: [...new Set([
            ...directCandidates,
            mappedText,
            mappedNormalized,
            mappedUnpadded
        ].filter(Boolean))]
    };
}

function getCommissionEmployeeTarget(empData, identity, targetDate) {
    const unpaddedId = /^\d+$/.test(identity.normalizedId)
        ? String(Number(identity.normalizedId))
        : identity.normalizedId;
    const candidates = [...new Set([
        identity.oldNumber,
        identity.normalizedId,
        unpaddedId
    ].filter(Boolean))];
    const monthlyTargets = empData.monthly_targets || {};

    if (Object.keys(monthlyTargets).length > 0) {
        for (const candidate of candidates) {
            const value = monthlyTargets[candidate]?.[targetDate];
            if (value != null) return Number(value) || 0;
        }
        return 0;
    }
    for (const candidate of candidates) {
        const value = empData.targets?.[candidate];
        if (value != null) return Number(value) || 0;
    }
    return 0;
}

function getCommissionStoreTarget(storeCode, targetDate) {
    const storeTargets = window.rawData?.targets || [];
    let targetRow = storeTargets.find(row =>
        Array.isArray(row)
        && row[0] === targetDate
        && String(row[1]) === String(storeCode)
    );
    if (!targetRow && targetDate === '2026-03-20') {
        targetRow = storeTargets.find(row =>
            Array.isArray(row)
            && row[0] === '2026-03-01'
            && String(row[1]) === String(storeCode)
        );
    }
    return Number(targetRow?.[2]) || 0;
}

function getCommissionRate(storeSales, storeTarget) {
    const achievement = storeTarget > 0 ? (storeSales / storeTarget) * 100 : 0;
    if (achievement >= 100) return 0.02;
    if (achievement >= 90) return 0.01;
    if (achievement >= 80) return 0.005;
    return 0;
}

function buildEmployeeCommissionRows(empData, targetStoreIds, startDate, endDate) {
    const selectedStores = new Set(targetStoreIds.map(String));
    const salesGroupMap = empData.sales_group_map || {};
    const employeeNames = empData.employee_names || {};
    const storePeriodTotals = new Map();
    const employeePeriodTotals = new Map();
    const employeeStoreTotals = new Map();

    Object.entries(empData.history || {}).forEach(([storeCode, records]) => {
        (records || []).forEach(record => {
            const date = String(record[0] || '');
            if (date < startDate || date > endDate) return;

            const sales = Number(record[2]) || 0;
            const targetDate = getCommissionTargetDate(date);
            const storePeriodKey = `${targetDate}\u0001${storeCode}`;
            storePeriodTotals.set(
                storePeriodKey,
                (storePeriodTotals.get(storePeriodKey) || 0) + sales
            );

            const identity = parseCommissionEmployeeIdentity(record[1]);
            if (!identity) return;

            const employeePeriodKey = `${targetDate}\u0001${identity.normalizedId}`;
            employeePeriodTotals.set(
                employeePeriodKey,
                (employeePeriodTotals.get(employeePeriodKey) || 0) + sales
            );

            if (!selectedStores.has(String(storeCode))) return;

            const employeeStoreKey =
                `${targetDate}\u0001${storeCode}\u0001${identity.normalizedId}`;
            if (!employeeStoreTotals.has(employeeStoreKey)) {
                const { mappedId, candidates } =
                    getCommissionEmployeeCandidates(identity, salesGroupMap);
                const resolvedName = candidates
                    .map(candidate => employeeNames[candidate])
                    .find(Boolean);
                employeeStoreTotals.set(employeeStoreKey, {
                    targetDate,
                    storeCode,
                    identity,
                    mappedId,
                    name: resolvedName || identity.fallbackName || identity.oldNumber,
                    sales: 0
                });
            }
            employeeStoreTotals.get(employeeStoreKey).sales += sales;
        });
    });

    return [...employeeStoreTotals.values()]
        .filter(record => Math.abs(record.sales) > 0.000001)
        .map(record => {
            const employeeTotalSales = employeePeriodTotals.get(
                `${record.targetDate}\u0001${record.identity.normalizedId}`
            ) || 0;
            const storeTotalSales = storePeriodTotals.get(
                `${record.targetDate}\u0001${record.storeCode}`
            ) || 0;
            const employeeTarget = getCommissionEmployeeTarget(
                empData,
                record.identity,
                record.targetDate
            );
            const storeTarget = getCommissionStoreTarget(
                record.storeCode,
                record.targetDate
            );
            const commissionRate = getCommissionRate(storeTotalSales, storeTarget);
            const proposedCommission =
                record.sales > 0 && employeeTotalSales > 0 && employeeTarget > 0
                    ? record.sales
                        * (employeeTotalSales / employeeTarget)
                        * commissionRate
                    : 0;

            return {
                "التاريخ": record.targetDate,
                "المعرض": window.rawData?.stores?.[record.storeCode] || record.storeCode,
                "الرقم الوظيفي (قديم)": String(record.identity.oldNumber),
                "الرقم الوظيفي (جديد)": String(record.mappedId || ''),
                "اسم الموظف": record.name,
                "المبيعات": record.sales,
                "الهدف (الشهري)": employeeTarget,
                "العمولة المقترحة": Math.round(proposedCommission * 100) / 100
            };
        })
        .sort((a, b) => {
            if (a["التاريخ"] !== b["التاريخ"]) {
                return a["التاريخ"].localeCompare(b["التاريخ"]);
            }
            if (a["المعرض"] !== b["المعرض"]) {
                return a["المعرض"].localeCompare(b["المعرض"]);
            }
            return a["اسم الموظف"].localeCompare(b["اسم الموظف"]);
        });
}

// --- OPTION 2: Employee Sales Export (Sales Manager Only) ---
async function exportEmployeeSales(startDate, endDate) {
    // 1. Fetch employees_data.json
    const res = await fetch('employees_data.json');
    if (!res.ok) throw new Error("Could not fetch employee data (employees_data.json missing)");
    const empData = await res.json();

    // empData struct: { history: { storeId: ... }, targets: {...}, monthly_targets: {...} }
    const targets = empData.targets || {};
    const monthlyTargets = empData.monthly_targets || {};

    const managerFilter = document.getElementById('managerFilter').value;
    const cityFilter = document.getElementById('cityFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;
    const branchFilter = document.getElementById('branchFilter').value;

    let rows = [];
    const empNames = empData.employee_names || {};

    const empSalesDict = {};
    Object.keys(empData.history || {}).forEach(sid => {
        (empData.history[sid] || []).forEach(rec => {
            const [date, empId, sales] = rec;
            empSalesDict[`${date}_${empId}`] = sales;
        });
    });

    // List of Store IDs we care about (from Emp Data)
    let targetStoreIds = Object.keys(empData.history || {});

    // Filter Stores based on Metadata in rawData
    if (window.rawData && window.rawData.store_meta) {
        targetStoreIds = targetStoreIds.filter(sid => {
            if (branchFilter !== 'all' && sid !== branchFilter) return false;

            const meta = window.rawData.store_meta[sid] || {};
            if (managerFilter !== 'all' && meta.manager !== managerFilter) return false;
            if (cityFilter !== 'all' && meta.city !== cityFilter) return false;
            if (typeFilter !== 'all' && meta.type !== typeFilter) return false;

            return true;
        });
    }

    const prevStartStr = document.getElementById('excelPrevStartDate').value;
    const isCustomPrevDate = prevStartStr !== getPrevDateForExport(startDate);
    const offsetDays = isCustomPrevDate ? Math.round((new Date(startDate) - new Date(prevStartStr)) / (1000 * 60 * 60 * 24)) : 0;

    // Iterate Filtered Stores
    targetStoreIds.forEach(sid => {
        const records = empData.history[sid] || [];
        const storeName = (window.rawData && window.rawData.stores[sid]) || sid;

        records.forEach(rec => {
            // rec format: [Date, EmpID, Sales, Trans, Items, ?]
            const [date, empId, sales, trans] = rec;

            // Date Check
            if (date >= startDate && date <= endDate) {

                // Resolve Name & ID
                let name = empId;
                let oldNumber = empId;
                let newNumber = '';

                const salesGroupMap = empData.sales_group_map || {};

                if (empNames[empId]) {
                    name = empNames[empId];
                    // Check if we have a sales group mapping (e.g. 0051 instead of 227)
                    if (salesGroupMap[empId]) {
                        newNumber = salesGroupMap[empId];
                    }
                } else if (empId && empId.includes('-')) {
                    // Fallback parse if format is "ID - Name"
                    let parts = empId.split('-');
                    oldNumber = parts[0].trim();
                    name = parts.slice(1).join('-').trim();

                    // Try to map extracted ID
                    if (salesGroupMap[oldNumber]) {
                        newNumber = salesGroupMap[oldNumber];
                    }
                } else {
                    // Helper: Check mapping for direct ID
                    if (salesGroupMap[empId]) {
                        newNumber = salesGroupMap[empId];
                    }
                }

                // Resolve Target
                // 1. Try Monthly Target for specific month (YYYY-MM-01)
                const dObj = new Date(date);
                const yyyy = dObj.getFullYear();
                const mm = String(dObj.getMonth() + 1).padStart(2, '0');
                let targetKey = `${yyyy}-${mm}-01`;
                
                // 2026 March: Split target periods
                if (yyyy === 2026 && dObj.getMonth() === 2 && dObj.getDate() > 19) {
                    targetKey = '2026-03-20';
                }

                let targetVal = 0;
                if (monthlyTargets && Object.keys(monthlyTargets).length > 0) {
                    if (monthlyTargets[empId] && monthlyTargets[empId][targetKey]) {
                        targetVal = monthlyTargets[empId][targetKey];
                    }
                } else {
                    if (targets && targets[empId]) targetVal = targets[empId];
                }

                // Calculate Previous Year Date
                let pDate = new Date(date);
                if (isCustomPrevDate) {
                    pDate.setDate(pDate.getDate() - offsetDays);
                } else {
                    pDate.setFullYear(pDate.getFullYear() - 1);
                    if (date.startsWith('2026-02') || date.startsWith('2026-03')) {
                        pDate.setDate(pDate.getDate() + 11);
                    }
                    // To enable April shift (+5 days) for Ramadan/Eid alignment, uncomment below:
                    // else if (date.startsWith('2026-04')) { pDate.setDate(pDate.getDate() + 5); }
                }

                let pyStr = pDate.toLocaleDateString('en-CA');
                let prevSales = empSalesDict[`${pyStr}_${empId}`] || 0;

                rows.push({
                    "التاريخ": date,
                    "المعرض": storeName,
                    "الرقم الوظيفي (قديم)": oldNumber,
                    "الرقم الوظيفي (جديد)": newNumber,
                    "اسم الموظف": name,
                    "المبيعات": sales,
                    "مبيعات السنة السابقة": prevSales,
                    "الهدف (الشهري)": targetVal,
                    "عدد الفواتير": trans
                });
            }
        });
    });

    if (rows.length === 0) {
        alert("لا توجد بيانات موظفين للفترة المحددة");
        return;
    }

    // Sort: Date, Store, Name
    rows.sort((a, b) => {
        if (a["التاريخ"] !== b["التاريخ"]) return a["التاريخ"].localeCompare(b["التاريخ"]);
        if (a["المعرض"] !== b["المعرض"]) return a["المعرض"].localeCompare(b["المعرض"]);
        return a["اسم الموظف"].localeCompare(b["اسم الموظف"]);
    });

    // Create Worksheet
    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto-width columns roughly
    const wscols = [
        { wch: 12 }, // Date
        { wch: 25 }, // Store
        { wch: 15 }, // Old Number
        { wch: 15 }, // New Number
        { wch: 20 }, // Emp Name
        { wch: 10 }, // Sales
        { wch: 20 }, // Prev Sales
        { wch: 12 }, // Target
        { wch: 10 }  // Trans
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employee Sales");

    const commissionRows = buildEmployeeCommissionRows(
        empData,
        targetStoreIds,
        startDate,
        endDate
    );
    const commissionHeaders = [
        "التاريخ",
        "المعرض",
        "الرقم الوظيفي (قديم)",
        "الرقم الوظيفي (جديد)",
        "اسم الموظف",
        "المبيعات",
        "الهدف (الشهري)",
        "العمولة المقترحة"
    ];
    const commissionSheet = XLSX.utils.json_to_sheet(
        commissionRows,
        { header: commissionHeaders }
    );
    commissionSheet['!cols'] = [
        { wch: 12 }, // Date
        { wch: 28 }, // Store
        { wch: 20 }, // Old employee number
        { wch: 20 }, // New employee number
        { wch: 25 }, // Employee name
        { wch: 14 }, // Sales
        { wch: 16 }, // Monthly target
        { wch: 18 }  // Proposed commission
    ];
    if (commissionSheet['!ref']) {
        commissionSheet['!autofilter'] = { ref: commissionSheet['!ref'] };
    }
    for (let rowNumber = 2; rowNumber <= commissionRows.length + 1; rowNumber++) {
        ['C', 'D'].forEach(column => {
            const cell = commissionSheet[`${column}${rowNumber}`];
            if (cell) {
                cell.t = 's';
                cell.v = String(cell.v || '');
            }
        });
        ['F', 'G', 'H'].forEach(column => {
            const cell = commissionSheet[`${column}${rowNumber}`];
            if (cell) cell.z = '#,##0.00';
        });
    }
    XLSX.utils.book_append_sheet(wb, commissionSheet, "العمولات");

    // Export
    XLSX.writeFile(wb, `Employee_Sales_${startDate}_${endDate}.xlsx`);
}
