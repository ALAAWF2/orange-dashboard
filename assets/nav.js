/** assets/nav.js - Unified Sidebar/Navbar and Polling Heartbeat */

window.navbarCurrentVersion = null;

window.addEventListener('DOMContentLoaded', () => {
    initNavbar();
});

async function initNavbar() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser && !window.location.pathname.endsWith('login.html')) {
        window.location.href = 'login.html';
        return;
    }

    if (currentUser && typeof getUserDisplayName === 'function') {
        const resolvedDisplayName = getUserDisplayName(currentUser.name);
        if (resolvedDisplayName && currentUser.displayName !== resolvedDisplayName) {
            currentUser.displayName = resolvedDisplayName;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        }
    }

    // Determine current page and page title
    const path = window.location.pathname;
    let pageTitle = "DASHBOARD";
    if (path.includes('employees.html')) pageTitle = "EMPLOYEES";
    else if (path.includes('product_analysis.html')) pageTitle = "PRODUCT ANALYSIS";
    else if (path.includes('rep.html')) pageTitle = "REPORTS";
    else if (path.includes('widget.html')) pageTitle = "WIDGET";
    else if (path.includes('stagnant_products.html')) pageTitle = "STAGNANT";
    else if (path.includes('offers_analysis.html')) pageTitle = "OFFERS";
    else if (path.includes('yoy_report.html')) pageTitle = "YoY REPORT";
    else if (path.includes('booff_report.html')) pageTitle = "YEARS REPORT";
    else if (path.includes('a3_comparison.html')) pageTitle = "A3 REPORT";
    else if (path.includes('sales_comparison.html')) pageTitle = "SALES COMPARISON";
    else if (path.includes('crm.html')) pageTitle = "CRM";

    // 1. Create Stall Warning Bar (prepended to body)
    const warningBar = document.createElement('div');
    warningBar.id = 'stall-warning-bar';
    warningBar.className = 'stall-warning-bar';
    warningBar.style.display = 'none';
    warningBar.innerHTML = `
        <span class="warning-icon">⚠️</span>
        <span class="warning-text">تنبيه: البيانات المعروضة لم تتحدث منذ أكثر من 45 دقيقة. قد تكون هناك مشكلة في المزامنة بالخلفية.</span>
    `;
    document.body.prepend(warningBar);

    // 2. Locate or create navbar element
    let navbarEl = document.querySelector('nav.navbar');
    if (!navbarEl) {
        navbarEl = document.createElement('nav');
        navbarEl.className = 'navbar mb-4 sticky-top';
        document.body.prepend(navbarEl);
    } else {
        // Clean existing navbar classes and keep it responsive
        navbarEl.className = 'navbar mb-4 sticky-top py-2';
    }

    // 3. Check roles & permissions
    const rawName = currentUser ? (currentUser.name || '') : '';
    const rawRole = currentUser ? (currentUser.role || 'guest') : 'guest';
    const name = rawName;
    const role = rawRole;
    const nameLower = rawName.trim().toLowerCase();
    const roleLower = rawRole.trim().toLowerCase();

    const isAlaa = (rawName.includes('علاء') || nameLower.includes('alaa'));
    const isSalesManager = (nameLower.includes('sales') || roleLower.includes('sales') || roleLower === 'admin' || rawRole === 'Admin');
    const isSalesComparisonUser = (isAlaa || isSalesManager);
    const isFinanceUser = (isAlaa || isSalesManager);
    const isCrmOnly = (role === 'CRM');
    const isManager = (role === 'Manager' || role === 'Admin' || isSalesManager || isAlaa);
    const isCrmUser = (isCrmOnly || isSalesManager || isAlaa);

    if (isCrmOnly && !path.includes('crm.html')) {
        window.location.replace('crm.html');
        return;
    }

    // 4. Read page-specific local actions if present
    const localActionsEl = navbarEl.querySelector('#nav-local-actions');
    const localActionsHTML = localActionsEl ? localActionsEl.innerHTML : '';

    // 5. Render Navbar Content
    const isIndexPage = path.endsWith('index.html') || path.endsWith('/') || path === '';
    
    let centerContent = '';
    if (isIndexPage) {
        centerContent = `
            <div class="d-none d-md-block flex-grow-1 text-center">
                <button onclick="typeof filterToday === 'function' ? filterToday() : null"
                    class="btn btn-white border shadow-sm d-inline-flex align-items-center gap-2 px-3 py-2"
                    title="اضغط لعرض مبيعات اليوم" style="border-radius: 50px;">
                    <span class="fw-bold text-dark" style="font-size: 0.95rem;">
                        🛒 مبيعات اليوم: <span class="text-primary today-sales-val">0</span>
                    </span>
                    <span class="text-muted border-start ps-2" style="font-size: 0.85rem;" id="lastUpdate">...</span>
                </button>
            </div>
        `;
    } else {
        centerContent = `
            <div class="d-none d-md-block flex-grow-1 text-center">
                <span class="badge bg-light text-dark border py-2 px-3 fw-bold tabular-nums" id="lastUpdate" style="font-size: 0.9rem; border-radius: 50px;">
                    🕒 آخر تحديث: ...
                </span>
            </div>
        `;
    }

    navbarEl.innerHTML = `
        <div class="container-fluid d-flex flex-wrap align-items-center justify-content-between gap-2">
            <!-- Left: Brand Title -->
            <span class="navbar-brand mb-0"><span class="brand-orange">ORANGE</span> ${pageTitle}</span>

            <!-- Center Content (Sales/Heartbeat) -->
            ${centerContent}

            <!-- Right: Action Links -->
            <div class="d-flex gap-2 flex-wrap justify-content-end align-items-center" data-nav-actions>
                <!-- Mobile Today's Sales Badge (Hidden on Desktop) -->
                ${isIndexPage ? `
                <button onclick="typeof filterToday === 'function' ? filterToday() : null"
                    class="btn btn-light border btn-sm d-md-none fw-bold text-primary d-flex align-items-center gap-1">
                    🛒 <span class="today-sales-val">0</span>
                </button>
                ` : ''}

                <!-- New Version Indicator Badge (Hidden by default) -->
                <button id="new-version-btn" class="new-version-badge" style="display: none;" onclick="triggerPageRefresh()">
                    <span>✨ بيانات أحدث متوفرة! تحديث</span>
                </button>

                <!-- Navigation Dropdowns & Links -->
                <a href="index.html" class="btn btn-outline-secondary btn-sm fw-bold">🏠 الرئيسية</a>

                ${isFinanceUser ? `
                <a href="finance_dashboard.html" class="btn btn-sm fw-bold d-inline-flex align-items-center gap-1 text-white shadow-sm" style="background: linear-gradient(135deg, #fe7900 0%, #d86600 100%); border: 1px solid #c25900;" title="لوحة التحكم والتحليلات المالية للمعارض">
                    💼 <span>داشبورد المالية</span>
                </a>
                ` : ''}

                ${isCrmUser ? `
                <a href="crm.html" class="btn btn-outline-primary btn-sm fw-bold">◎ CRM العملاء</a>
                ` : ''}

                <!-- Dropdown: Sales & Reports -->
                <div class="dropdown">
                    <button class="btn btn-outline-primary btn-sm fw-bold dropdown-toggle" type="button">
                        📈 المبيعات والتقارير
                    </button>
                    <ul class="dropdown-menu">
                        <li><a class="dropdown-item" href="widget.html">📱 شاشة متابعة مبيعات اليوم</a></li>
                        ${isSalesComparisonUser ? `
                        <li><a class="dropdown-item fw-bold text-primary" href="sales_comparison.html">📊 مقارنة أداء المبيعات (Power BI)</a></li>
                        ` : ''}
                        <li><a class="dropdown-item" href="a3_comparison.html">🖨️ تقرير مقارنة A3</a></li>
                        ${isFinanceUser ? `
                        <li><a class="dropdown-item fw-bold text-primary" href="finance_dashboard.html">💼 لوحة التحكم والتحليلات المالية</a></li>
                        ` : ''}
                        ${isManager ? `
                        <li><a class="dropdown-item" href="yoy_report.html">📊 مقارنة السنوات والزوار (YoY)</a></li>
                        <li><a class="dropdown-item" href="booff_report.html">📈 مقارنة الأعوام والنسب (BooFF)</a></li>
                        <li data-average-bill-prize><a class="dropdown-item" href="average_bill_dashboard.html">🎯 مستهدفات وجوائز متوسط الفاتورة</a></li>
                        <li><a class="dropdown-item" href="catalog/checklist-status.html">✅ تقرير التفقد اليومي</a></li>
                        ` : ''}
                    </ul>
                </div>

                <!-- Dropdown: Products & Inventory -->
                <div class="dropdown">
                    <button class="btn btn-outline-primary btn-sm fw-bold dropdown-toggle" type="button">
                        📦 المنتجات والمخزون
                    </button>
                    <ul class="dropdown-menu">
                        <li><a class="dropdown-item" href="product_analysis.html">📦 تحليل مبيعات المنتجات</a></li>
                        <li><a class="dropdown-item" href="stagnant_products.html">📉 المنتجات الراكدة والمخزون</a></li>
                        <li><a class="dropdown-item" href="offers_analysis.html">🏷️ تحليل مبيعات العروض</a></li>
                        <li><a class="dropdown-item" href="rep.html">📊 تقارير مبيعات الفروع الموسعة</a></li>
                    </ul>
                </div>

                <!-- Dropdown: Employees -->
                <div class="dropdown">
                    <button class="btn btn-outline-primary btn-sm fw-bold dropdown-toggle" type="button">
                        👥 الموظفون
                    </button>
                    <ul class="dropdown-menu">
                        <li><a class="dropdown-item" href="employees.html">👥 أداء الموظفين والعمولات</a></li>
                        ${isManager ? `
                        <li><a class="dropdown-item" href="edit_employee_targets.html">🎯 تعديل تارجت الموظفين</a></li>
                        <li><a class="dropdown-item" href="employee_portal.html">⚙️ إدارة وهيكلة الموظفين</a></li>
                        ` : ''}
                    </ul>
                </div>

                <!-- Admin Section (Only for Alaa) -->
                ${isAlaa ? `
                <a href="admin_panel.html" class="btn btn-outline-danger btn-sm fw-bold">⚙️ لوحة الأدمن</a>
                ` : ''}

                <!-- Page-Specific Local Actions -->
                ${localActionsHTML}

                <!-- Logout -->
                <button onclick="logout()" class="btn btn-danger btn-sm fw-bold">خروج</button>
            </div>
        </div>
    `;

    if (isCrmOnly) {
        navbarEl.querySelector('[data-nav-actions]').innerHTML = `
            <a href="crm.html" class="btn btn-outline-primary btn-sm fw-bold">◎ CRM العملاء</a>
            <button onclick="logout()" class="btn btn-danger btn-sm fw-bold">خروج</button>
        `;
    }

    // 5. Initialize custom click handler for dropdown toggles (ensures robust functionality)
    setupDropdownToggles();

    // 6. First Version check & heartbeat loop
    await checkVersionAndHeartbeat(true);
    
    // Poll data_version.json every 5 minutes
    setInterval(async () => {
        await checkVersionAndHeartbeat(false);
    }, 5 * 60 * 1000);
}

function setupDropdownToggles() {
    document.querySelectorAll('.navbar .dropdown-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const menu = btn.nextElementSibling;
            const isShown = menu.classList.contains('show');
            document.querySelectorAll('.navbar .dropdown-menu').forEach(m => m.classList.remove('show'));
            if (!isShown) {
                menu.classList.add('show');
            }
        });
    });
    document.addEventListener('click', () => {
        document.querySelectorAll('.navbar .dropdown-menu').forEach(m => m.classList.remove('show'));
    });
}

async function checkVersionAndHeartbeat(isInitialLoad) {
    try {
        // Fetch data_version.json (Flask handles Cache-Control: no-cache, browser revalidates via ETag/304)
        const res = await fetch('data_version.json');
        if (!res.ok) return;
        
        const data = await res.json();
        const serverVersion = data.cycle_completed_at;
        if (!serverVersion) return;

        if (isInitialLoad) {
            window.navbarCurrentVersion = serverVersion;
            updateHeartbeatDisplay(serverVersion);
        } else {
            // If server has a newer version, show version notification badge
            if (serverVersion !== window.navbarCurrentVersion) {
                const newVersionBtn = document.getElementById('new-version-btn');
                if (newVersionBtn) {
                    newVersionBtn.style.display = 'inline-flex';
                }
            }
        }

        // Perform stall check
        performStallCheck(serverVersion);

    } catch (e) {
        console.warn("[Navbar] Failed to check data_version.json:", e);
    }
}

function updateHeartbeatDisplay(versionStr) {
    // Parse time from versionStr "YYYY-MM-DD HH:MM:SS" -> "HH:MM"
    try {
        const parts = versionStr.split(' ');
        if (parts.length === 2) {
            const timeParts = parts[1].split(':');
            const formattedTime = timeParts[0] + ':' + timeParts[1];
            
            // Try updating standard index.html elements and navbar display
            const updateEls = document.querySelectorAll('#lastUpdate');
            updateEls.forEach(el => {
                if (el.tagName === 'SPAN' && el.innerHTML.includes('آخر تحديث')) {
                    el.innerHTML = `🕒 آخر تحديث: ${formattedTime}`;
                } else if (el.innerHTML.includes('...')) {
                    el.innerHTML = `آخر تحديث: ${formattedTime}`;
                } else if (el.tagName === 'SPAN') {
                    el.innerHTML = `🕒 آخر تحديث: ${formattedTime}`;
                } else {
                    el.innerHTML = formattedTime;
                }
            });
        }
    } catch (e) {
        console.error("[Navbar] Error parsing heartbeat time:", e);
    }
}

function performStallCheck(versionStr) {
    try {
        const warningBar = document.getElementById('stall-warning-bar');
        if (!warningBar) return;

        // Parse cycle completed time
        const completedTime = new Date(versionStr.replace(/-/g, '/')); // safe cross-browser replace
        const now = new Date();

        // Calculate difference in minutes
        const diffMs = now - completedTime;
        const diffMin = Math.floor(diffMs / (1000 * 60));

        // Check if inside business hours (10:00 to 23:00)
        const currentHour = now.getHours();
        const isBusinessHours = (currentHour >= 10 && currentHour < 23);

        if (diffMin > 45 && isBusinessHours) {
            warningBar.style.display = 'flex';
        } else {
            warningBar.style.display = 'none';
        }
    } catch (e) {
        console.warn("[Navbar] Stall check error:", e);
    }
}

function triggerPageRefresh() {
    // Refresh page to load new data
    window.location.reload();
}

function logout() {
    if (typeof logoutDashboardSession === 'function') {
        logoutDashboardSession('login.html');
        return;
    }
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}
