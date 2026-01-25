/**
 * target_logic.js
 * Logic for Target Setting Page
 */

let rawData = null;

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
        if (!res.ok) throw new Error("Failed to load data");
        rawData = await res.json();
    } catch (e) {
        console.error(e);
        alert("خطأ في تحميل البيانات: " + e.message);
    }
}

function loadData() {
    if (!rawData) return;

    const pickerVal = document.getElementById('targetMonth').value;
    if (!pickerVal) return;

    const [targetYear, targetMonth] = pickerVal.split('-').map(Number); // e.g. 2026, 04

    // Determine Last Year Period
    const lyYear = targetYear - 1;
    const lyMonth = targetMonth; // 1-indexed

    // We need start and end dates for Last Year Month
    // Note: Dates in JSON are Strings "YYYY-MM-DD"
    // We can filter by checking if substring matches "YYYY-MM"
    const lyPrefix = `${lyYear}-${String(lyMonth).padStart(2, '0')}`;

    console.log(`Loading Data for Last Year: ${lyPrefix}`);

    // Aggregate LY Data
    let stats = {}; // StoreId -> { sales, target, visitors }

    // Init Stores
    const storeIds = Object.keys(rawData.stores).filter(id => id !== '0' && id !== '9999');
    storeIds.forEach(id => {
        stats[id] = { sales: 0, target: 0, visitors: 0 };
    });

    // Helper: Is in LY Month?
    const isLY = (dStr) => dStr.startsWith(lyPrefix);

    // Sales
    rawData.sales.forEach(([d, s, v]) => {
        if (isLY(d) && stats[s]) stats[s].sales += v;
    });

    // Targets (Note: 'targets' array in rawData)
    // Structure: [date, storeId, value]
    if (rawData.targets) {
        rawData.targets.forEach(([d, s, v]) => {
            if (isLY(d) && stats[s]) stats[s].target += v;
        });
    }

    // Visitors
    rawData.visitors.forEach(([d, s, v]) => {
        if (isLY(d) && stats[s]) stats[s].visitors += v;
    });

    // Build Table Rows
    const tbody = document.getElementById('targetTableBody');
    tbody.innerHTML = '';

    // Sort by Store Name
    storeIds.sort((a, b) => (rawData.stores[a] || '').localeCompare(rawData.stores[b] || ''));

    let totalSalesLY = 0;
    let totalTargetLY = 0;
    let totalVisitorsLY = 0;

    storeIds.forEach((sid, i) => {
        const d = stats[sid];
        const name = rawData.stores[sid] || sid;

        let custVal = d.visitors > 0 ? d.sales / d.visitors : 0;

        totalSalesLY += d.sales;
        totalTargetLY += d.target;
        totalVisitorsLY += d.visitors;

        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td class="fw-bold text-start">${name}</td>
            <td>${d.sales.toLocaleString()}</td>
            <td class="text-muted small">${d.target.toLocaleString()}</td>
            <td>${d.visitors.toLocaleString()}</td>
            <td class="fw-bold">${custVal.toFixed(0)}</td>
            <td class="bg-orange-light">
                <input type="number" class="input-target form-control form-control-sm mx-auto" 
                       data-sid="${sid}" 
                       data-ly="${d.sales}" 
                       placeholder="0"
                       oninput="calcGrowth(this)">
            </td>
            <td class="growth-cell fw-bold ltr">0%</td>
        `;
        tbody.appendChild(tr);
    });

    // Footer
    const tfoot = document.getElementById('tableFooter');
    tfoot.innerHTML = `
        <td colspan="2">المجموع (Total)</td>
        <td>${totalSalesLY.toLocaleString()}</td>
        <td>${totalTargetLY.toLocaleString()}</td>
        <td>${totalVisitorsLY.toLocaleString()}</td>
        <td>-</td>
        <td id="totalNewTarget">0</td>
        <td>-</td>
    `;
}

function calcGrowth(input) {
    const newVal = parseFloat(input.value) || 0;
    const lyVal = parseFloat(input.dataset.ly) || 0;

    // Find Growth Cell (next sibling)
    const tdGrowth = input.closest('td').nextElementSibling;

    let growth = 0;
    if (lyVal > 0) {
        growth = ((newVal - lyVal) / lyVal) * 100;
    } else if (newVal > 0) {
        growth = 100;
    }

    tdGrowth.textContent = growth.toFixed(1) + '%';
    tdGrowth.className = 'growth-cell fw-bold ltr ' + (growth >= 0 ? 'text-success' : 'text-danger');

    // Recalc Total Target
    updateTotalTarget();
}

function updateTotalTarget() {
    let total = 0;
    document.querySelectorAll('.input-target').forEach(inp => {
        total += parseFloat(inp.value) || 0;
    });
    document.getElementById('totalNewTarget').textContent = total.toLocaleString();
}

// --- Export Logic ---

function saveTargetReport() {
    // Validate: At least one target set?
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

    // Header
    let data = [
        ["Target Setting Report"],
        ["Month:", monthVal],
        [],
        ["Store ID", "Store Name", "LY Sales", "LY Target", "LY Visitors", "LY Cust Val", "NEW TARGET", "Growth %"]
    ];

    document.querySelectorAll('#targetTableBody tr').forEach(tr => {
        const cols = tr.children;
        const sid = tr.querySelector('.input-target').dataset.sid;
        const name = cols[1].textContent;
        const lySales = cols[2].textContent;
        const lyTarget = cols[3].textContent;
        const lyVis = cols[4].textContent;
        const lyCust = cols[5].textContent;
        const newTarget = tr.querySelector('.input-target').value || 0;
        const growth = cols[7].textContent;

        data.push([sid, name, lySales, lyTarget, lyVis, lyCust, newTarget, growth]);
    });

    // Create WB
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Targets");

    return wb;
}
