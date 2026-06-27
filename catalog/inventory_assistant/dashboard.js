/**
 * dashboard.js - Manager Central Inventory Dashboard (لوحة تحكم الجرد المركزي للمدراء)
 * Real-time monitoring of collaborative inventories, statistics, discrepancy reporting, and Excel export.
 */

// Supabase Configuration
const SUPABASE_URL = "https://sufeqdvooqkolghflhta.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1ZmVxZHZvb3Frb2xnaGZsaHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTY5OTIsImV4cCI6MjA4ODk5Mjk5Mn0.ody4a53OtJqzLIoTvJ3S6Igdue-Sy4HsUQ_Cz7MUSjY";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State Variables
let sessions = [];
let sessionAggregates = {}; // session_id -> { expected, counted, itemsCount }
let selectedSessionId = null;
let selectedSessionItems = [];
let currentFilter = "all";
let searchQuery = "";

let detailRealtimeChannel = null;
let sessionsRealtimeChannel = null;

// On Page Load
window.addEventListener("DOMContentLoaded", async () => {
    // Initial load
    await loadSessionsData();
    
    // Wire main event listeners
    document.getElementById("refresh-sessions-btn").addEventListener("click", loadSessionsData);
    document.getElementById("detail-search-input").addEventListener("input", (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderDetailTable();
    });
    
    // Wire filter buttons
    const filterButtons = document.querySelectorAll("#filter-btn-group button");
    filterButtons.forEach(btn => {
        btn.addEventListener("click", (e) => {
            filterButtons.forEach(b => {
                b.classList.remove("btn-primary");
                b.classList.add("btn-outline-secondary");
                // Restore warning/danger colors if applicable
                if (b.dataset.filter === 'deficit') { b.classList.replace("btn-outline-secondary", "btn-outline-danger"); }
                if (b.dataset.filter === 'surplus') { b.classList.replace("btn-outline-secondary", "btn-outline-success"); }
            });
            
            // Highlight selected
            btn.classList.remove("btn-outline-secondary", "btn-outline-danger", "btn-outline-success");
            btn.classList.add("btn-primary");
            
            currentFilter = btn.dataset.filter;
            renderDetailTable();
        });
    });
    
    // Wire Excel download button
    document.getElementById("detail-download-btn").addEventListener("click", downloadSelectedSessionExcel);

    // Subscribe to sessions table changes
    subscribeToSessionsTable();
});

// Fetch sessions and session items summaries
async function loadSessionsData() {
    try {
        const listContainer = document.getElementById("sessions-list-container");
        listContainer.innerHTML = `<div class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>جاري تحميل الجلسات...</div>`;

        // 1. Fetch sessions list
        const { data: sessionList, error: sessErr } = await supabaseClient
            .from("inventory_sessions")
            .select("*")
            .order("created_at", { ascending: false });
            
        if (sessErr) throw sessErr;
        sessions = sessionList || [];

        // 2. Fetch session items summaries for aggregation
        const { data: itemsSummary, error: itemsErr } = await supabaseClient
            .from("inventory_session_items")
            .select("session_id, expected_qty, counted_qty");
            
        if (itemsErr) throw itemsErr;

        // Reset aggregates
        sessionAggregates = {};
        (itemsSummary || []).forEach(item => {
            if (!sessionAggregates[item.session_id]) {
                sessionAggregates[item.session_id] = { expected: 0, counted: 0, itemsCount: 0 };
            }
            sessionAggregates[item.session_id].expected += item.expected_qty || 0;
            sessionAggregates[item.session_id].counted += item.counted_qty || 0;
            sessionAggregates[item.session_id].itemsCount += 1;
        });

        // Calculate and render KPIs
        calculateKPIs();
        
        // Render sessions list in right panel
        renderSessionsList();

        // If previously selected session is in the list, refresh its details
        if (selectedSessionId) {
            const stillExists = sessions.find(s => s.id === selectedSessionId);
            if (stillExists) {
                await selectSession(selectedSessionId, false); // Don't reset view, just reload data
            } else {
                selectedSessionId = null;
                document.getElementById("detail-card-workspace").style.display = "none";
                document.getElementById("detail-card-empty").style.display = "block";
            }
        }

    } catch (e) {
        console.error("Error loading sessions:", e);
        alert("خطأ أثناء الاتصال بقاعدة البيانات.");
    }
}

// Calculate and render main KPI metrics
function calculateKPIs() {
    // 1. Active sessions count
    const activeCount = sessions.filter(s => s.status === 'active').length;
    document.getElementById("stat-active-sessions").innerText = activeCount;

    // 2. Total counted pieces (this month)
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    let totalScanned = 0;
    let totalExpected = 0;
    let matchingAccuracies = [];

    sessions.forEach(sess => {
        const sessDate = new Date(sess.created_at);
        const agg = sessionAggregates[sess.id] || { expected: 0, counted: 0 };
        
        if (sessDate.getMonth() === currentMonth && sessDate.getFullYear() === currentYear) {
            totalScanned += agg.counted;
        }

        // Only calculate accuracy for sessions that actually have expected items
        if (agg.expected > 0) {
            totalExpected += agg.expected;
            // Accuracy rate = 100 - (discrepancy / expected * 100)
            const discrepancy = Math.abs(agg.counted - agg.expected);
            const accuracy = Math.max(0, 100 - (discrepancy / agg.expected * 100));
            matchingAccuracies.push(accuracy);
        }
    });

    document.getElementById("stat-total-scanned").innerText = totalScanned.toLocaleString();
    
    // Average accuracy
    let avgAccuracy = 100;
    if (matchingAccuracies.length > 0) {
        avgAccuracy = matchingAccuracies.reduce((a, b) => a + b, 0) / matchingAccuracies.length;
    }
    document.getElementById("stat-avg-accuracy").innerText = `${avgAccuracy.toFixed(1)}%`;
}

// Render list of sessions in right column
function renderSessionsList() {
    const container = document.getElementById("sessions-list-container");
    if (!container) return;

    if (sessions.length === 0) {
        container.innerHTML = `<div class="text-center py-4 text-muted">لا توجد جلسات جرد مسجلة حتى الآن.</div>`;
        return;
    }

    let html = "";
    sessions.forEach(sess => {
        const agg = sessionAggregates[sess.id] || { expected: 0, counted: 0, itemsCount: 0 };
        const dateStr = new Date(sess.created_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', year: '2-digit' });
        
        const isSelected = sess.id === selectedSessionId ? "active" : "";
        const badgeClass = sess.status === 'active' ? "badge-active" : "badge-completed";
        const badgeText = sess.status === 'active' ? "نشط ⚡" : "مكتمل ✓";
        
        // Progress percentage
        const progressPercent = agg.expected > 0 ? Math.min(100, Math.round((agg.counted / agg.expected) * 100)) : 0;
        
        html += `
            <div class="session-item ${isSelected}" onclick="selectSession('${sess.id}')">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <strong class="text-orange fs-6">${sess.outlet}</strong>
                    <span class="badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="text-muted small mb-2">
                    👤 البدء بواسطة: ${sess.created_by} | 📅 ${dateStr}
                </div>
                
                <div class="d-flex align-items-center justify-content-between text-muted small mb-1">
                    <span>نسبة التغطية:</span>
                    <strong>${agg.counted} من ${agg.expected} صنف (${progressPercent}%)</strong>
                </div>
                <div class="progress">
                    <div class="progress-bar" role="progressbar" style="width: ${progressPercent}%;" aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Select a session to view details
async function selectSession(sessionId, resetFilters = true) {
    selectedSessionId = sessionId;
    
    // Highlight in the list
    document.querySelectorAll(".session-item").forEach((el, idx) => {
        el.classList.remove("active");
        if (sessions[idx] && sessions[idx].id === sessionId) {
            el.classList.add("active");
        }
    });

    if (resetFilters) {
        currentFilter = "all";
        searchQuery = "";
        const searchInput = document.getElementById("detail-search-input");
        if (searchInput) searchInput.value = "";
        
        // Reset filter button styles
        const filterButtons = document.querySelectorAll("#filter-btn-group button");
        filterButtons.forEach(b => {
            b.classList.remove("btn-primary");
            b.classList.add("btn-outline-secondary");
            if (b.dataset.filter === 'all') { b.classList.add("btn-primary"); b.classList.remove("btn-outline-secondary"); }
            if (b.dataset.filter === 'deficit') { b.classList.replace("btn-outline-secondary", "btn-outline-danger"); }
            if (b.dataset.filter === 'surplus') { b.classList.replace("btn-outline-secondary", "btn-outline-success"); }
        });
    }

    const sess = sessions.find(s => s.id === sessionId);
    if (!sess) return;

    // Show workspace card
    document.getElementById("detail-card-empty").style.display = "none";
    document.getElementById("detail-card-workspace").style.display = "block";

    // Populate header details
    document.getElementById("detail-outlet-name").innerText = sess.outlet;
    document.getElementById("detail-creator").innerText = sess.created_by;
    
    const startDate = new Date(sess.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) + " " + new Date(sess.created_at).toLocaleDateString('ar-EG');
    document.getElementById("detail-start-date").innerText = startDate;
    
    const statusBadge = document.getElementById("detail-status-badge");
    if (sess.status === 'active') {
        statusBadge.className = "badge badge-active ms-2";
        statusBadge.innerText = "نشط ⚡";
    } else {
        statusBadge.className = "badge badge-completed ms-2";
        statusBadge.innerText = "مكتمل ✓";
    }

    // Fetch items in the session
    const { data, error } = await supabaseClient
        .from("inventory_session_items")
        .select("*")
        .eq("session_id", sessionId);
        
    if (error) {
        console.error("Error fetching session items:", error);
        return;
    }
    
    selectedSessionItems = data || [];
    
    // Calculate details and render
    calculateSessionSummary();
    renderDetailTable();

    // Subscribe to real-time updates for this specific session items
    subscribeToSessionItems(sessionId);
}

// Calculate summary numbers for the selected session
function calculateSessionSummary() {
    let totalExpected = 0;
    let totalScanned = 0;
    let deficitCount = 0;
    let surplusCount = 0;

    selectedSessionItems.forEach(item => {
        totalExpected += item.expected_qty || 0;
        totalScanned += item.counted_qty || 0;
        
        const diff = item.counted_qty - item.expected_qty;
        if (diff < 0) {
            deficitCount += Math.abs(diff);
        } else if (diff > 0) {
            surplusCount += diff;
        }
    });

    document.getElementById("metric-expected").innerText = totalExpected.toLocaleString();
    document.getElementById("metric-scanned").innerText = totalScanned.toLocaleString();
    document.getElementById("metric-deficit").innerText = deficitCount.toLocaleString();
    document.getElementById("metric-surplus").innerText = surplusCount.toLocaleString();

    // Accuracy rate calculation
    let accuracyRate = 100;
    if (totalExpected > 0) {
        const totalDiscrepancies = Math.abs(totalScanned - totalExpected);
        accuracyRate = Math.max(0, 100 - (totalDiscrepancies / totalExpected * 100));
    }
    document.getElementById("detail-accuracy-rate").innerText = `${accuracyRate.toFixed(1)}%`;
}

// Render items table in selected session workspace
function renderDetailTable() {
    const tbody = document.getElementById("detail-tbody");
    if (!tbody) return;

    if (selectedSessionItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">لم يتم جرد أي مواد في هذه الجلسة بعد.</td></tr>`;
        return;
    }

    // Filter items based on filters and search queries
    let filtered = selectedSessionItems.filter(item => {
        const itemIdMatch = item.item_id.toLowerCase().includes(searchQuery);
        const nameMatch = (item.name || "").toLowerCase().includes(searchQuery);
        const barcodeMatch = (item.barcode || "").toLowerCase().includes(searchQuery);
        return itemIdMatch || nameMatch || barcodeMatch;
    });

    if (currentFilter === "mismatch") {
        filtered = filtered.filter(item => item.counted_qty !== item.expected_qty);
    } else if (currentFilter === "deficit") {
        filtered = filtered.filter(item => item.counted_qty < item.expected_qty);
    } else if (currentFilter === "surplus") {
        filtered = filtered.filter(item => item.counted_qty > item.expected_qty);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">لا توجد نتائج مطابقة للبحث أو الفلتر المختار.</td></tr>`;
        return;
    }

    // Sort items by update time descending
    filtered.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

    let html = "";
    filtered.forEach(item => {
        const diff = item.counted_qty - item.expected_qty;
        let diffClass = "diff-equal";
        let diffSign = "";
        
        if (diff > 0) {
            diffClass = "diff-surplus";
            diffSign = "+";
        } else if (diff < 0) {
            diffClass = "diff-deficit";
        }
        
        const lastUpdated = item.updated_at ? new Date(item.updated_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : "-";
        const scannerName = item.scanned_by ? ` (بواسطة ${item.scanned_by})` : "";

        html += `
            <tr>
                <td><strong>${item.item_id}</strong></td>
                <td>${item.name}</td>
                <td><code class="text-dark">${item.barcode}</code></td>
                <td class="text-center">${item.price ? parseFloat(item.price).toFixed(2) : "0.00"}</td>
                <td class="text-center fw-bold text-muted">${item.expected_qty}</td>
                <td class="text-center fw-bold">${item.counted_qty}</td>
                <td class="text-center">
                    <span class="badge ${diffClass} py-2 px-3 fs-6">${diffSign}${diff}</span>
                </td>
                <td class="small text-muted">${lastUpdated}${scannerName}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Real-time subscription to inventory items in selected session
function subscribeToSessionItems(sessionId) {
    if (detailRealtimeChannel) {
        supabaseClient.removeChannel(detailRealtimeChannel);
    }

    detailRealtimeChannel = supabaseClient.channel(`detail-session-${sessionId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'inventory_session_items', filter: `session_id=eq.${sessionId}` },
            (payload) => {
                console.log('Realtime Detail Update:', payload);
                const newItem = payload.new;
                const oldItem = payload.old;
                
                if (payload.eventType === 'INSERT') {
                    const idx = selectedSessionItems.findIndex(i => i.item_id === newItem.item_id);
                    if (idx === -1) {
                        selectedSessionItems.push(newItem);
                    } else {
                        selectedSessionItems[idx] = newItem;
                    }
                } else if (payload.eventType === 'UPDATE') {
                    const idx = selectedSessionItems.findIndex(i => i.item_id === newItem.item_id);
                    if (idx !== -1) {
                        selectedSessionItems[idx] = newItem;
                    } else {
                        selectedSessionItems.push(newItem);
                    }
                } else if (payload.eventType === 'DELETE') {
                    selectedSessionItems = selectedSessionItems.filter(i => i.item_id !== oldItem.item_id);
                }

                // Update UI Summary & Table
                calculateSessionSummary();
                renderDetailTable();
                
                // Update aggregate count locally for right panel display
                updateLocalAggregate(sessionId);
            }
        )
        .subscribe();
}

// Update locally cached aggregates for session list rendering
function updateLocalAggregate(sessionId) {
    let expected = 0;
    let counted = 0;
    
    selectedSessionItems.forEach(item => {
        expected += item.expected_qty || 0;
        counted += item.counted_qty || 0;
    });

    if (sessionAggregates[sessionId]) {
        sessionAggregates[sessionId].expected = expected;
        sessionAggregates[sessionId].counted = counted;
        sessionAggregates[sessionId].itemsCount = selectedSessionItems.length;
    }

    calculateKPIs();
    renderSessionsList();
}

// Real-time subscription to sessions table
function subscribeToSessionsTable() {
    if (sessionsRealtimeChannel) {
        supabaseClient.removeChannel(sessionsRealtimeChannel);
    }

    sessionsRealtimeChannel = supabaseClient.channel('sessions-table-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'inventory_sessions' },
            async (payload) => {
                console.log('Sessions Table Change:', payload);
                
                // Reload list to refresh everything nicely
                await loadSessionsData();
            }
        )
        .subscribe();
}

// Download Excel File for Selected Session
async function downloadSelectedSessionExcel() {
    if (!selectedSessionId || selectedSessionItems.length === 0) return;
    
    const sess = sessions.find(s => s.id === selectedSessionId);
    if (!sess) return;
    
    const downloadBtn = document.getElementById("detail-download-btn");
    const originalText = downloadBtn.innerText;
    downloadBtn.disabled = true;
    downloadBtn.innerText = "جاري التحميل... ⏳";
    
    try {
        // Query all barcodes associated with scanned items
        const itemIds = selectedSessionItems.map(item => item.item_id).filter(id => id && !id.includes("⚠️"));
        
        let allBarcodes = [];
        if (itemIds.length > 0) {
            const { data, error } = await supabaseClient
                .from("dynamics_barcodes")
                .select("*")
                .in("item_id", itemIds);
                
            if (!error && data) {
                allBarcodes = data;
            }
        }
        
        const barcodesMap = {};
        allBarcodes.forEach(b => {
            if (!barcodesMap[b.item_id]) {
                barcodesMap[b.item_id] = [];
            }
            if (!barcodesMap[b.item_id].includes(b.barcode)) {
                barcodesMap[b.item_id].push(b.barcode);
            }
        });
        
        let maxBarcodesCount = 1;
        selectedSessionItems.forEach(item => {
            const barcodes = barcodesMap[item.item_id] || [item.barcode];
            if (barcodes.length > maxBarcodesCount) {
                maxBarcodesCount = barcodes.length;
            }
        });
        
        const rows = [];
        selectedSessionItems.forEach(item => {
            let barcodes = barcodesMap[item.item_id] || [item.barcode];
            if (barcodes.length === 0) barcodes = [item.barcode];
            
            const rowObj = {
                "رقم المنتج (Item ID)": item.item_id,
                "اسم الصنف (Item Name)": item.name,
                "الكود البديل (Alias)": item.old_item_id || ""
            };
            
            for (let i = 0; i < maxBarcodesCount; i++) {
                rowObj[`الباركود ${i + 1}`] = barcodes[i] || "";
            }
            
            rowObj["السعر (Price)"] = item.price;
            rowObj["الكمية الموجودة بالمعرض (Expected)"] = item.expected_qty;
            rowObj["الكمية الفعلية بالجرد (Counted)"] = item.counted_qty;
            rowObj["الفرق (Difference)"] = item.counted_qty - item.expected_qty;
            rowObj["آخر مسح بواسطة"] = item.scanned_by || "";
            
            rows.push(rowObj);
        });
        
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!dir'] = 'rtl';
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "تقرير الجرد");
        
        const dateStr = new Date(sess.created_at).toISOString().slice(0, 10);
        XLSX.writeFile(wb, `تقرير_جرد_${sess.outlet.replace(/\s+/g, '_')}_${dateStr}.xlsx`);
        
    } catch (e) {
        console.error("Error generating excel download:", e);
        alert("حدث خطأ أثناء توليد ملف Excel.");
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.innerText = originalText;
    }
}
