/**
 * excel_export.js
 * Handles Excel export for both Store Sales and Employee Sales (Sales Manager only).
 */

let excelModal = null;

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
    } else if (dStr.startsWith('2026-04')) {
        pDate.setDate(pDate.getDate() + 5);
    }
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

    // Aggregation Map: "Date_StoreId" -> { date, storeId, sales, trans, visitors }
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
                visitors: 0
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
            if (inRange(d) && passFilter(s)) {
                let entry = ensureEntry(d, s);
                entry.trans += v;
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
            } else if (r.date.startsWith('2026-04')) {
                pDate.setDate(pDate.getDate() + 5);
            }
        }

        let pyy = pDate.getFullYear();
        let pmm = String(pDate.getMonth() + 1).padStart(2, '0');
        let pdd = String(pDate.getDate()).padStart(2, '0');
        let pyStr = `${pyy}-${pmm}-${pdd}`;

        let prevSales = salesDict[`${pyStr}_${r.storeId}`] || 0;
        let prevVisitors = visitorsDict[`${pyStr}_${r.storeId}`] || 0;

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
            "الزوار": r.visitors,
            "زوار السنة السابقة": prevVisitors,
            "متوسط الفاتورة": r.trans > 0 ? (r.sales / r.trans).toFixed(0) : 0,
            "نسبة التحويل": r.visitors > 0 ? ((r.trans / r.visitors) * 100).toFixed(1) + '%' : '0%'
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
        { wch: 10 }, // Achievement
        { wch: 10 }, // Trans
        { wch: 10 }, // Visitors
        { wch: 20 }, // Prev Visitors
        { wch: 10 }, // Avg
        { wch: 10 }  // Conv
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Store Sales");

    // Export
    XLSX.writeFile(wb, `Store_Sales_${startDate}_${endDate}.xlsx`);
}

// --- OPTION 2: Employee Sales Export (Sales Manager Only) ---
async function exportEmployeeSales(startDate, endDate) {
    // 1. Fetch employees_data.json with cache busting
    const res = await fetch(`employees_data.json?v=${new Date().getTime()}`);
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
                    } else if (date.startsWith('2026-04')) {
                        pDate.setDate(pDate.getDate() + 5);
                    }
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

    // Export
    XLSX.writeFile(wb, `Employee_Sales_${startDate}_${endDate}.xlsx`);
}
