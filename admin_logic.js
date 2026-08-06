/**
 * admin_logic.js
 * Handles UI interactions and API calls for admin_targets.html
 */

// Configuration
// Dynamic Server connection. Automatically detects server IP or falls back to localhost:5000 if opened locally or via GitHub Pages.
let API_BASE = window.location.origin;
if (!API_BASE || API_BASE.startsWith('file://') || API_BASE.includes('github.io')) {
    API_BASE = "http://localhost:5000";
}



let authHeader = null;

// Helper to show/hide admin-only buttons like auditLogsBtn
function checkAdminButtons() {
    const userObj = JSON.parse(localStorage.getItem('currentUser')) || { role: 'guest', name: '' };
    const isAdmin = (userObj.role === 'Admin' || userObj.name === 'Sales Manager');
    const btn = document.getElementById('auditLogsBtn');
    if (btn) {
        btn.style.display = isAdmin ? 'inline-flex' : 'none';
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    // Set Default Month (Next Month)
    const now = new Date();
    // Default to Current Month for editing
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    document.getElementById('targetMonth').value = `${yyyy}-${mm}`;

    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const storedIp = sessionStorage.getItem('serverIp');

    if (currentUser) {
        if (storedIp) API_BASE = storedIp;
        authHeader = '';
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('appContent').style.filter = 'none';
        document.getElementById('appContent').style.pointerEvents = 'all';
        checkAdminButtons();
        fetchData(); // Load data immediately
    }
});

function logout() {
    fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true
    }).catch(() => {});
    localStorage.removeItem('currentUser');
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

    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, pin: p })
        });

        if (!res.ok) {
            if (res.status === 401) {
                document.getElementById('loginError').innerText = "اسم المستخدم أو كلمة المرور غير صحيحة ❌";
            } else {
                document.getElementById('loginError').innerText = "خطأ في الاتصال بالسيرفر: " + res.status;
            }
            document.getElementById('loginError').style.display = 'block';
            return;
        }

        const payload = await res.json();
        authHeader = '';
        localStorage.setItem('currentUser', JSON.stringify(payload.user));
        sessionStorage.removeItem('auth');
        sessionStorage.setItem('serverIp', API_BASE); // Save IP for future loads within session

        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('appContent').style.filter = 'none';
        document.getElementById('appContent').style.pointerEvents = 'all';
        checkAdminButtons();
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

    // Get current logged in user details and role
    const userObj = JSON.parse(localStorage.getItem('currentUser')) || { role: 'guest', name: '' };
    const isAdmin = (userObj.role === 'Admin' || userObj.name === 'Sales Manager');

    data.stores.forEach(store => {
        const card = document.createElement('div');
        card.className = 'store-card';
        card.id = `store-${store.outlet}`;

        const safeName = store.outlet.replace(/\s/g, '-');

        // Formulate control panel based on user permissions
        let controlsHtml = '';
        if (isAdmin) {
            controlsHtml = `
                <button class="refresh-btn" style="padding:5px 10px; font-size:0.8em; background:#007bff;" 
                        onclick="openVisitorModal('${store.id}', '${store.outlet}')">تعديل الزوار</button>
                
                <div>
                    <input type="number" 
                           class="store-target-input" 
                           value="${store.target}" 
                           onchange="saveStoreTarget('${store.outlet}', this.value, this)">
                    <span class="save-indicator">✔</span>
                </div>
            `;
        } else {
            // Read-only for Managers
            controlsHtml = `
                <div style="font-size: 0.95em; font-weight: bold; color: var(--accent); padding: 5px 10px;">
                    الهدف: ${store.target.toLocaleString()} ريال
                </div>
            `;
        }

        card.innerHTML = `
            <div class="store-header" onclick="toggleEmpList('${safeName}', '${store.outlet}')">
                <div class="store-title">${store.outlet}</div>
                
                <div onclick="event.stopPropagation()" style="display:flex; align-items:center; gap:10px;">
                    ${controlsHtml}
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
        // Check global map with multiple ID formats
        // The targets table uses numeric ID (e.g., "4408")
        // But the employee list might have "Name-ID" format (e.g., "Rawabi Hawsawi-4408")
        let targetVal = 0;

        if (window.globalEmpTargets) {
            // Try exact match first
            if (window.globalEmpTargets[emp.id]) {
                targetVal = window.globalEmpTargets[emp.id].amount;
            } else {
                // Try extracting numeric ID from different formats
                const idParts = String(emp.id).split('-');
                // Format could be "Name-ID" or "ID-Name"
                for (const part of idParts) {
                    const numericPart = part.replace(/\D/g, ''); // Extract only digits
                    if (numericPart && window.globalEmpTargets[numericPart]) {
                        targetVal = window.globalEmpTargets[numericPart].amount;
                        break;
                    }
                    // Also try the part as-is
                    if (window.globalEmpTargets[part.trim()]) {
                        targetVal = window.globalEmpTargets[part.trim()].amount;
                        break;
                    }
                }
            }
        }

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
