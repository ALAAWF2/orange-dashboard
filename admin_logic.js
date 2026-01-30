/**
 * admin_logic.js
 * Handles UI interactions and API calls for admin_targets.html
 */

// Configuration
// In production, point to your actual server URL if not relative
// Since we are running on the server, relative path /api works ONLY if served by Flask?
// But user opens the HTML file directly? No, HTML file opened directly cannot use relative URLs to API easily unless API is on same origin.
// IF user opens HTML file via 'http://<server-ip>/admin_targets.html' (served by nginx/apache), then relative '/api' works if proxied.
// Configuration
// If running from file:// or GitHub Pages, point to Localhost Server
let API_BASE = "http://localhost:5000";

let authHeader = null;

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    // Set Default Month (Next Month)
    const now = new Date();
    // Default to Current Month for editing
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    document.getElementById('targetMonth').value = `${yyyy}-${mm}`;

    // Check if logged in (simple session storage)
    const storedAuth = sessionStorage.getItem('auth');
    const storedIp = sessionStorage.getItem('serverIp');

    if (storedAuth) {
        if (storedIp) API_BASE = storedIp;
        authHeader = storedAuth;
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('appContent').style.filter = 'none';
        document.getElementById('appContent').style.pointerEvents = 'all';
        fetchData(); // Load data immediately
    }
});

function logout() {
    sessionStorage.removeItem('auth');
    location.reload();
}

async function login() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const ipInput = document.getElementById('serverIp').value.trim();

    if (ipInput) {
        if (ipInput.startsWith('http')) {
            // Full URL provided (e.g. ngrok)
            API_BASE = ipInput;
            // Remove trailing slash if present
            if (API_BASE.endsWith('/')) API_BASE = API_BASE.slice(0, -1);
        } else {
            // IP provided
            if (ipInput.includes(':')) API_BASE = `http://${ipInput}`;
            else API_BASE = `http://${ipInput}:5000`;
        }
    }

    // Create Basic Auth Header
    const creds = btoa(u + ":" + p);
    const header = "Basic " + creds;

    // Test Auth
    try {
        const res = await fetch(`${API_BASE}/api/targets`, {
            headers: {
                'Authorization': header,
                'ngrok-skip-browser-warning': 'true'
            }
        });

        if (!res.ok) {
            document.getElementById('loginError').innerText = "خطأ في الاتصال: " + res.status;
            document.getElementById('loginError').style.display = 'block';
            return;
        }

        // Success
        authHeader = header;
        sessionStorage.setItem('auth', header);
        sessionStorage.setItem('serverIp', API_BASE); // Save IP for future loads within session

        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('appContent').style.filter = 'none';
        document.getElementById('appContent').style.pointerEvents = 'all';
        fetchData();

    } catch (e) {
        alert("خطأ في الاتصال بالسيرفر: " + e);
    }
}

async function fetchData() {
    const month = document.getElementById('targetMonth').value;
    const container = document.getElementById('storesContainer');
    container.innerHTML = '<div style="text-align:center; color:white;">جاري جلب البيانات...</div>';

    try {
        const res = await fetch(`${API_BASE}/api/targets?month=${month}`, {
            headers: {
                'Authorization': authHeader,
                'ngrok-skip-browser-warning': 'true'
            }
        });

        if (res.status === 401) {
            logout();
            return;
        }

        if (!res.ok) throw new Error("Failed to load");

        const data = await res.json();
        renderStores(data);

    } catch (e) {
        container.innerHTML = `<div style="text-align:center; color:red;">فشل التحميل: ${e.message}</div>`;
    }
}

function renderStores(data) {
    const container = document.getElementById('storesContainer');
    container.innerHTML = '';

    // Raw Employee Targets Map (ID -> {name, amount})
    const empTargetsRaw = data.employee_targets_raw || {};

    data.stores.forEach(store => {
        const card = document.createElement('div');
        card.className = 'store-card';
        card.id = `store-${store.outlet}`;

        const safeName = store.outlet.replace(/\s/g, '-');

        card.innerHTML = `
            <div class="store-header" onclick="toggleEmpList('${safeName}', '${store.outlet}')">
                <div class="store-title">${store.outlet}</div>
                <div onclick="event.stopPropagation()">
                    <input type="number" 
                           class="store-target-input" 
                           value="${store.target}" 
                           onchange="saveStoreTarget('${store.outlet}', this.value, this)">
                    <span class="save-indicator">✔</span>
                </div>
            </div>
            <div id="emp-list-${safeName}" class="emp-list">
                <div style="text-align:center; padding:10px; color:#666;">جاري تحميل الموظفين...</div>
            </div>
        `;

        container.appendChild(card);
    });
}

async function toggleEmpList(safeName, outletName) {
    const listDiv = document.getElementById(`emp-list-${safeName}`);

    // Toggle
    if (listDiv.style.display === 'block') {
        listDiv.style.display = 'none';
        return;
    }

    listDiv.style.display = 'block';

    // Fetch Employees if not loaded
    if (!listDiv.dataset.loaded) {
        try {
            const res = await fetch(`${API_BASE}/api/employees?store=${encodeURIComponent(outletName)}`, {
                headers: {
                    'Authorization': authHeader,
                    'ngrok-skip-browser-warning': 'true'
                }
            });
            const emps = await res.json();

            if (emps.length === 0) {
                listDiv.innerHTML = '<div style="text-align:center; padding:10px;">لا يوجد موظفين نشطين خلال 60 يوم</div>';
            } else {
                renderEmployees(listDiv, emps, outletName);
            }
            listDiv.dataset.loaded = "true";
        } catch (e) {
            listDiv.innerHTML = '<div style="color:red">فشل جلب الموظفين</div>';
        }
    }
}

async function renderEmployees(container, emps, outletName) {
    // We need to match with current month targets
    // BUT we need the current month value which is stored in "empTargetsRaw" from the first call?
    // Actually, simpler to fetch the target for THIS employee for THIS month individually? No, too many calls.
    // Let's pass the raw targets down implicitly or fetch fresh?
    // Actually, we can just fetch target for each emp from the RAW list we got earlier.
    // BUT `renderStores` scope doesn't have access to `empTargetsRaw` easy unless global.
    // Let's make `currentEmpTargets` global.

    const month = document.getElementById('targetMonth').value;

    let html = '';

    // For each employee, check if we have a target
    // We need to re-fetch the raw targets map? 
    // Or just fetch specific target?
    // Let's just do a quick fetch of ALL targets again? No.
    // Better: Allow UI to query target for specific employee?
    // Optimize: When rendering employees, we should know their current target.
    // Since `api/employees` returns just list of names, we need to Merge with targets.
    // Let's fetch the store targets + employee targets again? Or trust `api/targets` output.

    // Quick Fix: Request Main Data Again to get targets? No.
    // Let's just assume 0 for now and let user edit? NO, must show existing.

    // We need to pass the target list to this function.
    // I will refactor `fetchData` to store `globalEmpTargets`.

    html += '<div style="margin-bottom:10px; font-size:0.8em; color:#888;">أدخل 0 لإزالة الهدف</div>';

    emps.forEach(emp => {
        // Check global map
        const targetVal = (window.globalEmpTargets && window.globalEmpTargets[emp.id]) ? window.globalEmpTargets[emp.id].amount : 0;

        html += `
            <div class="emp-row">
                <div class="emp-name">${emp.name} <small>(${emp.id})</small></div>
                <div>
                    <input type="number" 
                           class="emp-input" 
                           value="${targetVal}"
                           onchange="saveEmpTarget('${emp.id}', '${emp.name}', this.value, this)">
                    <span class="save-indicator">✔</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Global Store for Targets
window.globalEmpTargets = {};

// Override fetchData to save global
const originalFetch = fetchData;
fetchData = async function () {
    const month = document.getElementById('targetMonth').value;
    const container = document.getElementById('storesContainer');
    container.innerHTML = '<div style="text-align:center; color:white;">جاري جلب البيانات...</div>';

    try {
        const res = await fetch(`${API_BASE}/api/targets?month=${month}`, {
            headers: {
                'Authorization': authHeader,
                'ngrok-skip-browser-warning': 'true'
            }
        });
        const data = await res.json();

        window.globalEmpTargets = data.employee_targets_raw || {};
        renderStores(data);

    } catch (e) { console.error(e); }
};

async function saveStoreTarget(outlet, amount, inputEl) {
    const month = document.getElementById('targetMonth').value;
    const indicator = inputEl.nextElementSibling;

    try {
        const res = await fetch(`${API_BASE}/api/save_store_target`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ month, outlet, amount })
        });

        if (res.ok) {
            indicator.classList.add('saved');
            setTimeout(() => indicator.classList.remove('saved'), 2000);
        } else {
            alert("فشل الحفظ");
        }
    } catch (e) { alert(e); }
}

async function saveEmpTarget(empId, empName, amount, inputEl) {
    const month = document.getElementById('targetMonth').value;
    const indicator = inputEl.nextElementSibling;

    try {
        const res = await fetch(`${API_BASE}/api/save_employee_target`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({
                month,
                emp_id: empId,
                emp_name: empName, // Send name to update cache
                amount
            })
        });

        if (res.ok) {
            indicator.classList.add('saved');
            // Update Global Cache manually so if we close/open it persists locally without refresh
            if (!window.globalEmpTargets[empId]) window.globalEmpTargets[empId] = {};
            window.globalEmpTargets[empId].amount = amount;

            setTimeout(() => indicator.classList.remove('saved'), 2000);
        } else {
            alert("فشل الحفظ");
        }
    } catch (e) { alert(e); }
}
