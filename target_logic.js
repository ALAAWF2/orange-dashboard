/**
 * target_logic.js
 * Logic for Target Setting Page
 */

let rawData = null;
let employeesData = null;
let storeEmployees = {};

// Initialize
window.addEventListener('DOMContentLoaded', async () => {
    // Set Default Month to Next Month
    const now = new Date();
    let nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const yyyy = nextMonth.getFullYear();
    const mm = String(nextMonth.getMonth() + 1).padStart(2, '0');
    document.getElementById('targetMonth').value = `${yyyy}-${mm}`;

    await fetchData();
    loadData();
});

async function fetchData() {
    try {
        const res = await fetch('management_data.json?t=' + Date.now());
        if (!res.ok) throw new Error("Failed to load management data");
        rawData = await res.json();

        const empRes = await fetch('employees_data.json?t=' + Date.now());
        if (empRes.ok) {
            employeesData = await empRes.json();
            calculateCurrentEmployees();
        }
    } catch (e) {
        console.error(e);
        alert("خطأ في تحميل البيانات: " + e.message);
    }
}

function calculateCurrentEmployees() {
    storeEmployees = {};
    if (!employeesData || !employeesData.history) return;
    
    for (const empId in employeesData.history) {
        const records = employeesData.history[empId];
        if (!records || records.length === 0) continue;
        
        let latestDate = "";
        let latestStore = "";
        for (const rec of records) {
            const date = rec[0];
            const store = String(rec[1]);
            if (date > latestDate) {
                latestDate = date;
                latestStore = store;
            }
        }
        
        if (latestStore) {
            if (!storeEmployees[latestStore]) {
                storeEmployees[latestStore] = [];
            }
            const empName = employeesData.employee_names ? (employeesData.employee_names[empId] || empId) : empId;
            storeEmployees[latestStore].push({ id: empId, name: empName });
        }
    }
}

function getMonthName(m) {
    const names = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    return names[m - 1] || m;
}

function loadData() {
    if (!rawData) return;

    const pickerVal = document.getElementById('targetMonth').value;
    if (!pickerVal) return;

    const [targetYear, targetMonth] = pickerVal.split('-').map(Number); // e.g. 2026, 04

    const prevMonthTY = targetMonth === 1 ? 12 : targetMonth - 1;
    const prevYearTY = targetMonth === 1 ? targetYear - 1 : targetYear;
    const tyM1Prefix = `${prevYearTY}-${String(prevMonthTY).padStart(2, '0')}`;
    
    const prevYearLY = targetMonth === 1 ? targetYear - 2 : targetYear - 1;
    const lyM1Prefix = `${prevYearLY}-${String(prevMonthTY).padStart(2, '0')}`;
    
    const lyMPrefix = `${targetYear - 1}-${String(targetMonth).padStart(2, '0')}`;

    console.log(`Loading Data for LY_M: ${lyMPrefix}, TY_M1: ${tyM1Prefix}, LY_M1: ${lyM1Prefix}`);

    // Update Header
    const thead = document.getElementById('targetTableHeader');
    if (thead) {
        const mName = getMonthName(targetMonth);
        const prevMName = getMonthName(prevMonthTY);
        thead.innerHTML = `
            <tr>
                <th rowspan="2" class="align-middle">#</th>
                <th rowspan="2" class="align-middle" style="min-width: 150px;">المعرض (Store)</th>
                <th colspan="3" class="bg-secondary text-white">مبيعات ${prevMName}</th>
                <th colspan="3" class="bg-primary text-white">تارجت ${mName}</th>
                <th colspan="4" class="bg-secondary text-white">الزوار</th>
                <th colspan="4" class="bg-info text-dark">قيمة العميل</th>
            </tr>
            <tr class="text-nowrap">
                <th class="table-light text-dark">${prevYearLY}</th>
                <th class="table-light text-dark">${prevYearTY}</th>
                <th class="table-light text-dark">نمو %</th>
                
                <th class="table-light text-dark">مبيعات ${targetYear-1}</th>
                <th class="bg-orange text-white">الهدف ${targetYear}</th>
                <th class="table-light text-dark">نمو %</th>
                
                <th class="table-light text-dark">${prevMName} ${prevYearLY}</th>
                <th class="table-light text-dark">${prevMName} ${prevYearTY}</th>
                <th class="table-light text-dark">${mName} ${targetYear-1}</th>
                <th class="table-light text-dark">نمو (${prevMName}) %</th>
                
                <th class="table-light text-dark">${prevMName} ${prevYearLY}</th>
                <th class="table-light text-dark">${prevMName} ${prevYearTY}</th>
                <th class="table-light text-dark">${mName} ${targetYear-1}</th>
                <th class="bg-orange text-white">توقع ${targetYear}</th>
            </tr>
        `;
    }

    let stats = {};
    const storeIds = Object.keys(rawData.stores).filter(id => id !== '0' && id !== '9999');
    storeIds.forEach(id => {
        stats[id] = { 
            sales_lyM1: 0, sales_tyM1: 0, sales_lyM: 0,
            vis_lyM1: 0, vis_tyM1: 0, vis_lyM: 0
        };
    });

    const is_lyM = (d) => d.startsWith(lyMPrefix);
    const is_tyM1 = (d) => d.startsWith(tyM1Prefix);
    const is_lyM1 = (d) => d.startsWith(lyM1Prefix);

    rawData.sales.forEach(([d, s, v]) => {
        if (!stats[s]) return;
        if (is_lyM(d)) stats[s].sales_lyM += v;
        else if (is_tyM1(d)) stats[s].sales_tyM1 += v;
        else if (is_lyM1(d)) stats[s].sales_lyM1 += v;
    });

    rawData.visitors.forEach(([d, s, v]) => {
        if (!stats[s]) return;
        if (is_lyM(d)) stats[s].vis_lyM += v;
        else if (is_tyM1(d)) stats[s].vis_tyM1 += v;
        else if (is_lyM1(d)) stats[s].vis_lyM1 += v;
    });

    const tbody = document.getElementById('targetTableBody');
    tbody.innerHTML = '';

    storeIds.sort((a, b) => (rawData.stores[a] || '').localeCompare(rawData.stores[b] || ''));

    let totals = {
        sales_lyM1: 0, sales_tyM1: 0, sales_lyM: 0,
        vis_lyM1: 0, vis_tyM1: 0, vis_lyM: 0
    };

    storeIds.forEach((sid, i) => {
        const d = stats[sid];
        const name = rawData.stores[sid] || sid;

        totals.sales_lyM1 += d.sales_lyM1;
        totals.sales_tyM1 += d.sales_tyM1;
        totals.sales_lyM += d.sales_lyM;
        totals.vis_lyM1 += d.vis_lyM1;
        totals.vis_tyM1 += d.vis_tyM1;
        totals.vis_lyM += d.vis_lyM;

        let salesM1Growth = d.sales_lyM1 > 0 ? ((d.sales_tyM1 - d.sales_lyM1) / d.sales_lyM1) * 100 : (d.sales_tyM1 > 0 ? 100 : 0);
        let visM1Growth = d.vis_lyM1 > 0 ? ((d.vis_tyM1 - d.vis_lyM1) / d.vis_lyM1) * 100 : (d.vis_tyM1 > 0 ? 100 : 0);
        
        let cv_lyM1 = d.vis_lyM1 > 0 ? d.sales_lyM1 / d.vis_lyM1 : 0;
        let cv_tyM1 = d.vis_tyM1 > 0 ? d.sales_tyM1 / d.vis_tyM1 : 0;
        let cv_lyM = d.vis_lyM > 0 ? d.sales_lyM / d.vis_lyM : 0;

        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td class="fw-bold text-start text-nowrap" style="cursor:pointer;" onclick="toggleEmployees('${sid}')" title="اضغط لعرض الموظفين">
                <i class="fas fa-chevron-down me-1 toggle-icon-${sid} text-muted"></i> ${name}
            </td>
            
            <td>${d.sales_lyM1.toLocaleString()}</td>
            <td>${d.sales_tyM1.toLocaleString()}</td>
            <td class="ltr ${salesM1Growth >= 0 ? 'text-success' : 'text-danger'}">${salesM1Growth.toFixed(1)}%</td>
            
            <td>${d.sales_lyM.toLocaleString()}</td>
            <td class="bg-orange-light">
                <input type="number" class="input-target form-control form-control-sm mx-auto" 
                       data-sid="${sid}" 
                       data-ly="${d.sales_lyM}" 
                       data-vis-ly="${d.vis_lyM}"
                       placeholder="0"
                       oninput="calcTargetGrowth(this)">
            </td>
            <td class="target-growth-cell fw-bold ltr">0%</td>
            
            <td>${d.vis_lyM1.toLocaleString()}</td>
            <td>${d.vis_tyM1.toLocaleString()}</td>
            <td>${d.vis_lyM.toLocaleString()}</td>
            <td class="ltr ${visM1Growth >= 0 ? 'text-success' : 'text-danger'}">${visM1Growth.toFixed(1)}%</td>
            
            <td>${cv_lyM1.toFixed(0)}</td>
            <td>${cv_tyM1.toFixed(0)}</td>
            <td>${cv_lyM.toFixed(0)}</td>
            <td class="expected-cv-cell fw-bold bg-orange-light">0</td>
        `;
        tbody.appendChild(tr);

        // Employee Rows
        const emps = storeEmployees[sid] || [];
        if (emps.length > 0) {
            const pickerVal = document.getElementById('targetMonth').value;
            const [targetYear, targetMonth] = pickerVal.split('-').map(Number);
            const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();

            emps.forEach(emp => {
                let empTr = document.createElement('tr');
                empTr.className = `employee-row emp-of-${sid}`;
                empTr.style.display = 'none';
                empTr.style.backgroundColor = '#fafafa';
                empTr.innerHTML = `
                    <td></td>
                    <td class="text-start ps-4 text-muted"><i class="fas fa-user me-1"></i> ${emp.name}</td>
                    <td colspan="4"></td>
                    <td class="bg-light">
                        <div class="d-flex flex-column gap-1 align-items-center">
                            <div class="input-group input-group-sm" style="width: 140px;" title="أيام الدوام">
                                <span class="input-group-text">أيام</span>
                                <input type="number" class="form-control emp-days-${sid}" value="${daysInMonth}" oninput="recalcFromDays('${sid}')">
                            </div>
                            <div class="input-group input-group-sm" style="width: 140px;" title="الهدف للموظف">
                                <span class="input-group-text">هدف</span>
                                <input type="number" class="form-control emp-target-${sid}" value="0" data-empid="${emp.id}" data-empname="${emp.name}" oninput="recalcFromEmpTarget('${sid}')">
                            </div>
                        </div>
                    </td>
                    <td colspan="9"></td>
                `;
                tbody.appendChild(empTr);
            });
        }
    });

    let totalSalesM1Growth = totals.sales_lyM1 > 0 ? ((totals.sales_tyM1 - totals.sales_lyM1) / totals.sales_lyM1) * 100 : (totals.sales_tyM1 > 0 ? 100 : 0);
    let totalVisM1Growth = totals.vis_lyM1 > 0 ? ((totals.vis_tyM1 - totals.vis_lyM1) / totals.vis_lyM1) * 100 : (totals.vis_tyM1 > 0 ? 100 : 0);

    let total_cv_lyM1 = totals.vis_lyM1 > 0 ? totals.sales_lyM1 / totals.vis_lyM1 : 0;
    let total_cv_tyM1 = totals.vis_tyM1 > 0 ? totals.sales_tyM1 / totals.vis_tyM1 : 0;
    let total_cv_lyM = totals.vis_lyM > 0 ? totals.sales_lyM / totals.vis_lyM : 0;

    const tfoot = document.getElementById('tableFooter');
    tfoot.dataset.salesLyM = totals.sales_lyM;
    tfoot.dataset.visLyM = totals.vis_lyM;
    
    tfoot.innerHTML = `
        <td colspan="2">المجموع (Total)</td>
        <td>${totals.sales_lyM1.toLocaleString()}</td>
        <td>${totals.sales_tyM1.toLocaleString()}</td>
        <td class="ltr ${totalSalesM1Growth >= 0 ? 'text-success' : 'text-danger'}">${totalSalesM1Growth.toFixed(1)}%</td>
        
        <td>${totals.sales_lyM.toLocaleString()}</td>
        <td id="totalNewTarget" class="bg-orange-light text-dark">0</td>
        <td id="totalTargetGrowth" class="ltr">0%</td>
        
        <td>${totals.vis_lyM1.toLocaleString()}</td>
        <td>${totals.vis_tyM1.toLocaleString()}</td>
        <td>${totals.vis_lyM.toLocaleString()}</td>
        <td class="ltr ${totalVisM1Growth >= 0 ? 'text-success' : 'text-danger'}">${totalVisM1Growth.toFixed(1)}%</td>
        
        <td>${total_cv_lyM1.toFixed(0)}</td>
        <td>${total_cv_tyM1.toFixed(0)}</td>
        <td>${total_cv_lyM.toFixed(0)}</td>
        <td id="totalExpectedCV" class="bg-orange-light text-dark">0</td>
    `;
}

function calcTargetGrowth(input, distribute = true) {
    const newVal = parseFloat(input.value) || 0;
    const lyVal = parseFloat(input.dataset.ly) || 0;
    const visLyVal = parseFloat(input.dataset.visLy) || 0;

    const tr = input.closest('tr');
    const tdGrowth = input.parentElement.nextElementSibling;
    
    let growth = 0;
    if (lyVal > 0) {
        growth = ((newVal - lyVal) / lyVal) * 100;
    } else if (newVal > 0) {
        growth = 100;
    }

    tdGrowth.textContent = growth.toFixed(1) + '%';
    tdGrowth.className = 'target-growth-cell fw-bold ltr ' + (growth >= 0 ? 'text-success' : 'text-danger');

    const tdExpectedCV = tr.querySelector('.expected-cv-cell');
    let expCV = visLyVal > 0 ? newVal / visLyVal : 0;
    tdExpectedCV.textContent = expCV.toFixed(0);

    if (distribute) {
        const sid = input.dataset.sid;
        distributeToEmployees(sid, newVal);
    }

    updateTotalTarget();
}

function toggleEmployees(sid) {
    const rows = document.querySelectorAll(`.emp-of-${sid}`);
    const icon = document.querySelector(`.toggle-icon-${sid}`);
    let isHidden = true;
    rows.forEach(r => {
        if (r.style.display === 'none') {
            r.style.display = 'table-row';
            isHidden = false;
        } else {
            r.style.display = 'none';
            isHidden = true;
        }
    });
    if (icon) {
        icon.className = isHidden ? `fas fa-chevron-down me-1 toggle-icon-${sid} text-muted` : `fas fa-chevron-up me-1 toggle-icon-${sid} text-muted`;
    }
}

function distributeToEmployees(sid, storeTarget) {
    const daysInputs = document.querySelectorAll(`.emp-days-${sid}`);
    const targetInputs = document.querySelectorAll(`.emp-target-${sid}`);
    if (daysInputs.length === 0) return;

    let totalDays = 0;
    daysInputs.forEach(inp => totalDays += (parseFloat(inp.value) || 0));

    targetInputs.forEach((inp, idx) => {
        const days = parseFloat(daysInputs[idx].value) || 0;
        if (totalDays > 0) {
            inp.value = Math.round(storeTarget * (days / totalDays));
        } else {
            inp.value = 0;
        }
    });
}

function recalcFromDays(sid) {
    const storeInput = document.querySelector(`.input-target[data-sid="${sid}"]`);
    if (storeInput) {
        const storeTarget = parseFloat(storeInput.value) || 0;
        distributeToEmployees(sid, storeTarget);
    }
}

function recalcFromEmpTarget(sid) {
    const targetInputs = document.querySelectorAll(`.emp-target-${sid}`);
    let sum = 0;
    targetInputs.forEach(inp => sum += (parseFloat(inp.value) || 0));
    
    const storeInput = document.querySelector(`.input-target[data-sid="${sid}"]`);
    if (storeInput) {
        storeInput.value = sum;
        calcTargetGrowth(storeInput, false);
    }
}

function updateTotalTarget() {
    let total = 0;
    document.querySelectorAll('.input-target').forEach(inp => {
        total += parseFloat(inp.value) || 0;
    });
    document.getElementById('totalNewTarget').textContent = total.toLocaleString();

    const tfoot = document.getElementById('tableFooter');
    const totalSalesLyM = parseFloat(tfoot.dataset.salesLyM) || 0;
    const totalVisLyM = parseFloat(tfoot.dataset.visLyM) || 0;

    let totalGrowth = 0;
    if (totalSalesLyM > 0) {
        totalGrowth = ((total - totalSalesLyM) / totalSalesLyM) * 100;
    } else if (total > 0) {
        totalGrowth = 100;
    }

    const tdGrowth = document.getElementById('totalTargetGrowth');
    if(tdGrowth) {
        tdGrowth.textContent = totalGrowth.toFixed(1) + '%';
        tdGrowth.className = 'ltr ' + (totalGrowth >= 0 ? 'text-success' : 'text-danger');
    }

    const tdExpectedCV = document.getElementById('totalExpectedCV');
    if(tdExpectedCV) {
        let totalExpCV = totalVisLyM > 0 ? total / totalVisLyM : 0;
        tdExpectedCV.textContent = totalExpCV.toFixed(0);
    }
}

// --- Export Logic ---

function saveTargetReport() {
    let hasVal = false;
    document.querySelectorAll('.input-target').forEach(inp => {
        if (inp.value && inp.value > 0) hasVal = true;
    });

    if (!hasVal) {
        if (!confirm("لم تقم بإدخال أي أهداف جديدة. هل تريد المتابعة بملف فارغ؟")) return;
    }

    const wb = generateExcelWorkbook();
    const monthVal = document.getElementById('targetMonth').value;
    XLSX.writeFile(wb, `Targets_${monthVal}.xlsx`);
}

function generateExcelWorkbook() {
    const monthVal = document.getElementById('targetMonth').value; // YYYY-MM
    const [targetYear, targetMonth] = monthVal.split('-').map(Number);
    
    const prevMonthTY = targetMonth === 1 ? 12 : targetMonth - 1;
    const prevYearTY = targetMonth === 1 ? targetYear - 1 : targetYear;
    const prevYearLY = targetMonth === 1 ? targetYear - 2 : targetYear - 1;

    const mName = getMonthName(targetMonth);
    const prevMName = getMonthName(prevMonthTY);

    let data = [
        ["Target Setting Report"],
        ["Month:", monthVal],
        [],
        [
            "Store ID", "Store Name", 
            `Sales ${prevMName} ${prevYearLY}`, `Sales ${prevMName} ${prevYearTY}`, `Sales Growth %`,
            `Sales ${mName} ${targetYear-1}`, `Target ${mName} ${targetYear}`, `Target Growth %`,
            `Visitors ${prevMName} ${prevYearLY}`, `Visitors ${prevMName} ${prevYearTY}`, `Visitors ${mName} ${targetYear-1}`, `Vis Growth %`,
            `CV ${prevMName} ${prevYearLY}`, `CV ${prevMName} ${prevYearTY}`, `CV ${mName} ${targetYear-1}`, `Expected CV ${mName} ${targetYear}`
        ]
    ];

    document.querySelectorAll('#targetTableBody tr').forEach(tr => {
        const cols = tr.children;
        const sid = tr.querySelector('.input-target').dataset.sid;
        const name = cols[1].textContent;
        const sales_lyM1 = cols[2].textContent.replace(/,/g, '');
        const sales_tyM1 = cols[3].textContent.replace(/,/g, '');
        const sales_growth = cols[4].textContent;
        const sales_lyM = cols[5].textContent.replace(/,/g, '');
        const target = tr.querySelector('.input-target').value || 0;
        const target_growth = cols[7].textContent;
        const vis_lyM1 = cols[8].textContent.replace(/,/g, '');
        const vis_tyM1 = cols[9].textContent.replace(/,/g, '');
        const vis_lyM = cols[10].textContent.replace(/,/g, '');
        const vis_growth = cols[11].textContent;
        const cv_lyM1 = cols[12].textContent;
        const cv_tyM1 = cols[13].textContent;
        const cv_lyM = cols[14].textContent;
        const exp_cv = cols[15].textContent;

        data.push([
            sid, name, 
            parseFloat(sales_lyM1)||0, parseFloat(sales_tyM1)||0, sales_growth,
            parseFloat(sales_lyM)||0, parseFloat(target)||0, target_growth,
            parseFloat(vis_lyM1)||0, parseFloat(vis_tyM1)||0, parseFloat(vis_lyM)||0, vis_growth,
            parseFloat(cv_lyM1)||0, parseFloat(cv_tyM1)||0, parseFloat(cv_lyM)||0, parseFloat(exp_cv)||0
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Targets");

    // Employee Targets Sheet
    let empData = [
        ["Employee Targets Report"],
        ["Month:", monthVal],
        [],
        ["Store ID", "Store Name", "Employee ID", "Employee Name", "Working Days", "Target"]
    ];

    document.querySelectorAll('#targetTableBody tr.employee-row').forEach(tr => {
        const classList = Array.from(tr.classList);
        const sidClass = classList.find(c => c.startsWith('emp-of-'));
        if (sidClass) {
            const sid = sidClass.replace('emp-of-', '');
            const storeName = rawData.stores[sid] || sid;
            
            const daysInp = tr.querySelector(`.emp-days-${sid}`);
            const targetInp = tr.querySelector(`.emp-target-${sid}`);
            
            if (daysInp && targetInp) {
                const days = parseFloat(daysInp.value) || 0;
                const target = parseFloat(targetInp.value) || 0;
                const empId = targetInp.dataset.empid;
                const empName = targetInp.dataset.empname;
                
                if (target > 0) {
                    empData.push([sid, storeName, empId, empName, days, target]);
                }
            }
        }
    });

    if (empData.length > 4) {
        const wsEmp = XLSX.utils.aoa_to_sheet(empData);
        XLSX.utils.book_append_sheet(wb, wsEmp, "Employee Targets");
    }

    return wb;
}
