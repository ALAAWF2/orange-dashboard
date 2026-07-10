/**
 * app.js - Collaborative Inventory Assistant (مساعد الجرد الجماعي)
 * Offline-first client-side logic with Supabase, Realtime, PWA caching, and Local Barcodes Cache.
 */

// Supabase Configuration
const SUPABASE_URL = "https://sufeqdvooqkolghflhta.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1ZmVxZHZvb3Frb2xnaGZsaHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTY5OTIsImV4cCI6MjA4ODk5Mjk5Mn0.ody4a53OtJqzLIoTvJ3S6Igdue-Sy4HsUQ_Cz7MUSjY";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State Variables
let stockByOutlet = {};
let currentOutlet = "";
let scannedItems = []; // Array of { item_id, name, old_item_id, price, barcode, expected_qty, counted_qty, scanned_by, zone_breakdown, is_pending_sync }
let localBarcodesCache = {};
let offlineQueue = []; // Array of { barcode, amount, zone, timestamp }

// Collaborative Session State
let employeeName = "";
let activeSessionId = null;
let realtimeChannel = null;
let currentActiveSession = null;

// Laptop-specific UX State
let activeZone = "العام";
let activeTableZoneFilter = "all";
let activeTableDiffFilter = "all";
let searchFilterQuery = "";

// IndexedDB Storage
const offlineStore = window.localforage.createInstance({
    name: "orange_inventory_offline"
});

// Audio Feedbacks
function playBeep(type = 'success') {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);

        if (type === 'success') {
            const oscillator = audioCtx.createOscillator();
            oscillator.connect(gainNode);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.1);
        } else if (type === 'surplus') {
            // Two rapid high beeps
            const osc1 = audioCtx.createOscillator();
            osc1.connect(gainNode);
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
            osc1.start();
            osc1.stop(audioCtx.currentTime + 0.08);

            setTimeout(() => {
                const osc2 = audioCtx.createOscillator();
                osc2.connect(gainNode);
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(1000, audioCtx.currentTime);
                osc2.start();
                osc2.stop(audioCtx.currentTime + 0.08);
            }, 120);
        } else if (type === 'error') {
            // Sawtooth low buzz
            const oscillator = audioCtx.createOscillator();
            oscillator.connect(gainNode);
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(220, audioCtx.currentTime); // 220Hz
            gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.35);
        }
    } catch (e) {
        console.error("Audio beep error:", e);
    }
}

// Show/Hide feedback alerts
function showFeedback(message, isError = false) {
    const feedbackEl = document.getElementById("scan-feedback");
    if (!feedbackEl) return;
    feedbackEl.style.display = "block";
    feedbackEl.className = isError ? "mt-2 text-center fw-bold text-danger" : "mt-2 text-center fw-bold text-success";
    feedbackEl.innerText = message;
    
    setTimeout(() => {
        feedbackEl.style.display = "none";
    }, 2500);
}

// Render inventory items in table
function renderTable() {
    const tbody = document.getElementById("inventory-tbody");
    const totalQtyEl = document.getElementById("total-scanned-qty");
    
    if (!tbody || !totalQtyEl) return;

    if (scannedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">لم يتم جرد أي مواد بعد. ابدأ بمسح الباركود!</td></tr>`;
        totalQtyEl.innerText = "0";
        return;
    }
    
    let totalQty = 0;
    let html = "";
    
    // Sort items by update time descending
    const sortedItems = [...scannedItems].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

    // Filter items
    let filtered = sortedItems;

    if (activeTableZoneFilter === "current") {
        filtered = filtered.filter(item => item.zone_breakdown && item.zone_breakdown[activeZone] > 0);
    }

    if (activeTableDiffFilter === "mismatch") {
        filtered = filtered.filter(item => (Number(item.counted_qty) || 0) !== (Number(item.expected_qty) || 0));
    } else if (activeTableDiffFilter === "deficit") {
        filtered = filtered.filter(item => (Number(item.counted_qty) || 0) < (Number(item.expected_qty) || 0));
    } else if (activeTableDiffFilter === "surplus") {
        filtered = filtered.filter(item => (Number(item.counted_qty) || 0) > (Number(item.expected_qty) || 0));
    }

    if (searchFilterQuery) {
        filtered = filtered.filter(item => {
            const itemIdMatch = (item.item_id || "").toLowerCase().includes(searchFilterQuery);
            const nameMatch = (item.name || "").toLowerCase().includes(searchFilterQuery);
            const barcodeMatch = (item.barcode || "").toLowerCase().includes(searchFilterQuery);
            return itemIdMatch || nameMatch || barcodeMatch;
        });
    }

    // Calculate total scanned qty
    scannedItems.forEach(item => {
        totalQty += Number(item.counted_qty) || 0;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">لا توجد نتائج مطابقة للبحث أو الفلتر المختار.</td></tr>`;
        totalQtyEl.innerText = totalQty;
        return;
    }

    filtered.forEach((item) => {
        const totalCounted = Number(item.counted_qty) || 0;
        const expected = Number(item.expected_qty) || 0;
        
        let displayQty = totalCounted;
        let isEditable = true;
        let zoneBadgeHtml = "";

        if (activeTableZoneFilter === "current") {
            displayQty = (item.zone_breakdown && item.zone_breakdown[activeZone]) || 0;
        } else {
            isEditable = false; // Disable editing when showing all zones to prevent ambiguity
            
            // Build zone breakdown badges
            if (item.zone_breakdown && Object.keys(item.zone_breakdown).length > 0) {
                const parts = Object.entries(item.zone_breakdown)
                    .map(([z, q]) => `<span class="badge bg-secondary me-1" style="font-size:0.75rem;">${z}: ${q}</span>`)
                    .join("");
                zoneBadgeHtml = `<div class="mt-1 d-flex flex-wrap gap-1">${parts}</div>`;
            }
        }

        const diff = totalCounted - expected;
        let diffClass = "diff-equal";
        let diffSign = "";
        if (diff > 0) {
            diffClass = "diff-surplus";
            diffSign = "+";
        } else if (diff < 0) {
            diffClass = "diff-deficit";
        }
        
        const scannerName = item.scanned_by ? ` (بواسطة ${item.scanned_by})` : "";
        const pendingBadge = item.is_pending_sync ? ' <span class="badge bg-warning text-dark small" style="font-size: 0.65rem;">انتظار المزامنة ⏳</span>' : '';
        
        html += `
            <tr class="scanned-row" id="row-${item.item_id}">
                <td><strong>${item.item_id}</strong></td>
                <td>
                    <div>${item.name}${pendingBadge}</div>
                    ${zoneBadgeHtml}
                    <div class="text-muted small d-block d-md-none" style="font-size: 0.75rem;">${scannerName}</div>
                </td>
                <td><code class="text-light">${item.barcode}</code></td>
                <td class="text-center">${expected}</td>
                <td class="text-center" style="width: 120px;">
                    <input type="number" class="form-control form-control-sm text-center fw-bold" 
                        value="${displayQty}" min="1" 
                        ${!isEditable ? 'readonly disabled title="اختر عرض المنطقة النشطة لتعديل هذا الرف"' : ''}
                        onfocus="this.select()"
                        onchange="updateItemQty('${item.item_id}', this.value)">
                </td>
                <td class="text-center">
                    <span class="badge badge-diff ${diffClass}">${diffSign}${diff}</span>
                </td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" ${!isEditable ? 'disabled' : ''} onclick="adjustQty('${item.item_id}', 1)">+</button>
                        <button class="btn btn-outline-secondary" ${!isEditable ? 'disabled' : ''} onclick="adjustQty('${item.item_id}', -1)">-</button>
                        <button class="btn btn-danger" onclick="removeItem('${item.item_id}')">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    totalQtyEl.innerText = totalQty;
}

// Adjust Item Qty via Buttons (+ / -) in Active Zone
window.adjustQty = async function(itemId, change) {
    const item = scannedItems.find(i => i.item_id === itemId);
    if (item) {
        const currentZoneQty = (item.zone_breakdown && item.zone_breakdown[activeZone]) || 0;
        const newZoneQty = Math.max(0, currentZoneQty + change);
        const diff = newZoneQty - currentZoneQty;
        if (diff === 0) return;
        
        // If local/offline
        if (!navigator.onLine || activeSessionId.toString().startsWith("offline_")) {
            if (!item.zone_breakdown) item.zone_breakdown = {};
            item.zone_breakdown[activeZone] = newZoneQty;
            item.counted_qty = (item.counted_qty || 0) + diff;
            item.scanned_by = employeeName;
            item.updated_at = new Date().toISOString();
            item.is_pending_sync = true;
            
            // Clean up 0 quantity zones
            if (item.zone_breakdown[activeZone] <= 0) {
                delete item.zone_breakdown[activeZone];
            }
            if (item.counted_qty <= 0) {
                scannedItems = scannedItems.filter(i => i.item_id !== itemId);
            }
            
            offlineQueue.push({ barcode: item.barcode, amount: diff, zone: activeZone, timestamp: Date.now() });
            await offlineStore.setItem(`offline_queue_${activeSessionId}`, offlineQueue);
            await offlineStore.setItem(`offline_scanned_items_${activeSessionId}`, scannedItems);
            
            renderTable();
            return;
        }
        
        if (newZoneQty <= 0) {
            // Remove item from this zone
            await removeItem(itemId, true); // true means zone only
            return;
        }
        
        const { error } = await supabaseClient.rpc('increment_session_item', {
            p_session_id: activeSessionId,
            p_item_id: item.item_id,
            p_name: item.name,
            p_barcode: item.barcode,
            p_old_item_id: item.old_item_id || "",
            p_price: parseFloat(item.price) || 0.0,
            p_expected_qty: item.expected_qty,
            p_amount: diff,
            p_scanned_by: employeeName,
            p_zone: activeZone
        });
        
        if (error) {
            console.error("Error adjusting quantity in database:", error);
            showFeedback("خطأ أثناء تحديث الكمية سحابياً!", true);
        }
    }
};

// Update Item Qty via Input Change in Active Zone
window.updateItemQty = async function(itemId, val) {
    const parsed = parseInt(val, 10);
    const item = scannedItems.find(i => i.item_id === itemId);
    if (item && !isNaN(parsed) && parsed >= 0) {
        const currentZoneQty = (item.zone_breakdown && item.zone_breakdown[activeZone]) || 0;
        const diff = parsed - currentZoneQty;
        if (diff === 0) return;
        
        if (!navigator.onLine || activeSessionId.toString().startsWith("offline_")) {
            if (!item.zone_breakdown) item.zone_breakdown = {};
            item.zone_breakdown[activeZone] = parsed;
            item.counted_qty = (item.counted_qty || 0) + diff;
            item.scanned_by = employeeName;
            item.updated_at = new Date().toISOString();
            item.is_pending_sync = true;
            
            if (item.zone_breakdown[activeZone] <= 0) {
                delete item.zone_breakdown[activeZone];
            }
            if (item.counted_qty <= 0) {
                scannedItems = scannedItems.filter(i => i.item_id !== itemId);
            }
            
            offlineQueue.push({ barcode: item.barcode, amount: diff, zone: activeZone, timestamp: Date.now() });
            await offlineStore.setItem(`offline_queue_${activeSessionId}`, offlineQueue);
            await offlineStore.setItem(`offline_scanned_items_${activeSessionId}`, scannedItems);
            renderTable();
            return;
        }
        
        if (parsed === 0) {
            await removeItem(itemId, true);
            return;
        }
        
        const { error } = await supabaseClient.rpc('set_session_item_qty', {
            p_session_id: activeSessionId,
            p_item_id: item.item_id,
            p_zone: activeZone,
            p_qty: parsed,
            p_scanned_by: employeeName
        });
            
        if (error) {
            console.error("Error setting quantity in database:", error);
            showFeedback("خطأ أثناء تحديث الكمية سحابياً!", true);
        }
    }
};

// Remove Item from session/zone in Supabase
window.removeItem = async function(itemId, zoneOnly = false) {
    const promptMsg = zoneOnly 
        ? "هل أنت متأكد من حذف هذا الصنف من المنطقة الحالية فقط؟" 
        : "هل أنت متأكد من حذف هذا الصنف بالكامل من كافة المناطق؟";
        
    if (confirm(promptMsg)) {
        if (!navigator.onLine || activeSessionId.toString().startsWith("offline_")) {
            const item = scannedItems.find(i => i.item_id === itemId);
            if (item) {
                if (zoneOnly) {
                    const zoneQty = (item.zone_breakdown && item.zone_breakdown[activeZone]) || 0;
                    if (item.zone_breakdown) delete item.zone_breakdown[activeZone];
                    item.counted_qty = Math.max(0, item.counted_qty - zoneQty);
                    offlineQueue.push({ barcode: item.barcode, amount: -zoneQty, zone: activeZone, timestamp: Date.now() });
                    await offlineStore.setItem(`offline_queue_${activeSessionId}`, offlineQueue);
                } else {
                    scannedItems = scannedItems.filter(i => i.item_id !== itemId);
                    offlineQueue = offlineQueue.filter(s => s.barcode !== item.barcode);
                    await offlineStore.setItem(`offline_queue_${activeSessionId}`, offlineQueue);
                }
                
                if (item.counted_qty <= 0 || !zoneOnly) {
                    scannedItems = scannedItems.filter(i => i.item_id !== itemId);
                }
                
                await offlineStore.setItem(`offline_scanned_items_${activeSessionId}`, scannedItems);
                renderTable();
            }
            return;
        }
        
        if (zoneOnly) {
            const { error } = await supabaseClient.rpc('remove_session_item_zone', {
                p_session_id: activeSessionId,
                p_item_id: itemId,
                p_zone: activeZone
            });
            if (error) {
                console.error("Error deleting item from zone:", error);
                showFeedback("خطأ أثناء حذف الصنف من المنطقة!", true);
            }
        } else {
            const { error } = await supabaseClient
                .from('inventory_session_items')
                .delete()
                .eq('session_id', activeSessionId)
                .eq('item_id', itemId);
                
            if (error) {
                console.error("Error deleting item from database:", error);
                showFeedback("خطأ أثناء حذف الصنف!", true);
            }
        }
    }
};

// Query Supabase for Barcode or Item ID
async function lookupItem(code) {
    const cleanCode = code.trim();
    if (!cleanCode) return null;
    
    let { data, error } = await supabaseClient
        .from("dynamics_barcodes")
        .select("*")
        .eq("barcode", cleanCode)
        .limit(1);
        
    if (error) {
        console.error("Supabase barcode lookup error:", error);
    }
    
    if (data && data.length > 0) {
        return data[0];
    }
    
    let { data: itemData, error: itemError } = await supabaseClient
        .from("dynamics_barcodes")
        .select("*")
        .eq("item_id", cleanCode)
        .limit(1);
        
    if (itemError) {
        console.error("Supabase item_id lookup error:", itemError);
    }
    
    if (itemData && itemData.length > 0) {
        return itemData[0];
    }
    
    return null;
}

// Handle scanned/typed barcode action
async function handleScan(barcode) {
    const cleanBarcode = barcode.trim();
    if (!cleanBarcode || !activeSessionId) return;

    let scanQty = 1;
    let targetBarcode = cleanBarcode;

    // Parse barcode commands (e.g. BARCODE*QTY)
    if (cleanBarcode.includes('*')) {
        const parts = cleanBarcode.split('*');
        targetBarcode = parts[0].trim();
        const parsedQty = parseInt(parts[1], 10);
        if (!isNaN(parsedQty) && parsedQty > 0) {
            scanQty = parsedQty;
        }
    }
    
    // Check if offline
    if (!navigator.onLine || activeSessionId.toString().startsWith("offline_")) {
        await handleOfflineScan(targetBarcode, scanQty);
        return;
    }
    
    // Online Scan Flow
    showFeedback("جاري البحث... ⏳");
    
    let dbItem = localBarcodesCache[targetBarcode] || await lookupItem(targetBarcode);
    
    let itemId = targetBarcode;
    let name = "صنف غير معرف بالنظام ⚠️";
    let old_item_id = "";
    let price = 0.0;
    let actualBarcode = targetBarcode;
    let expected = 0;
    
    if (dbItem) {
        localBarcodesCache[targetBarcode] = dbItem;
        localBarcodesCache[dbItem.item_id] = dbItem;
        
        itemId = dbItem.item_id;
        name = dbItem.barcode_description || dbItem.search_name || "صنف بدون اسم";
        old_item_id = dbItem.old_item_id || "";
        price = parseFloat(dbItem.price) || 0.0;
        actualBarcode = dbItem.barcode || targetBarcode;
        expected = (stockByOutlet[currentOutlet] && stockByOutlet[currentOutlet][dbItem.item_id]) || 0;
    } else {
        // Unregistered item handling: prompt user to name it
        playBeep('error');
        const customName = prompt(`⚠️ الباركود [${targetBarcode}] غير معرف بالنظام.\nأدخل اسم الصنف لتسجيله مؤقتاً (أو اضغط إلغاء):`);
        if (!customName || !customName.trim()) {
            showFeedback("تم إلغاء تسجيل الصنف غير المعرف.", true);
            return;
        }
        name = customName.trim();
    }
    
    // Determine sound frequency based on quantities
    const existing = scannedItems.find(i => i.item_id === itemId);
    const prevCount = existing ? (Number(existing.counted_qty) || 0) : 0;
    const finalCount = prevCount + scanQty;
    const expectedCount = existing ? (Number(existing.expected_qty) || 0) : expected;

    if (finalCount > expectedCount) {
        playBeep('surplus');
    } else {
        playBeep('success');
    }
    
    const { error } = await supabaseClient.rpc('increment_session_item', {
        p_session_id: activeSessionId,
        p_item_id: itemId,
        p_name: name,
        p_barcode: actualBarcode,
        p_old_item_id: old_item_id,
        p_price: price,
        p_expected_qty: expected,
        p_amount: scanQty,
        p_scanned_by: employeeName,
        p_zone: activeZone
    });
    
    if (error) {
        console.error("Error inserting scanned item:", error);
        playBeep('error');
        showFeedback("خطأ أثناء تسجيل المسح في قاعدة البيانات!", true);
    } else {
        showFeedback(`تم مسح: ${name} (${scanQty} قطع)`);
    }
}

// Handle Offline Scan
async function handleOfflineScan(barcode, scanQty = 1) {
    let dbItem = localBarcodesCache[barcode];
    
    let itemId = barcode;
    let name = "صنف غير معرف مؤقتاً (جاري التحقق عند الاتصال) ⚠️";
    let old_item_id = "";
    let price = 0.0;
    let actualBarcode = barcode;
    let expected = 0;
    
    if (dbItem) {
        itemId = dbItem.item_id;
        name = dbItem.barcode_description || dbItem.search_name || "صنف بدون اسم";
        old_item_id = dbItem.old_item_id || "";
        price = parseFloat(dbItem.price) || 0.0;
        actualBarcode = dbItem.barcode || barcode;
        expected = (stockByOutlet[currentOutlet] && stockByOutlet[currentOutlet][dbItem.item_id]) || 0;
    } else {
        // If offline and not in cache, allow adding temporary name
        playBeep('error');
        const customName = prompt(`⚠️ الباركود [${barcode}] غير متوفر محلياً.\nأدخل اسم الصنف لحفظه مؤقتاً (أو اضغط إلغاء):`);
        if (!customName || !customName.trim()) {
            showFeedback("تم إلغاء الجرد المحلي للصنف غير المعرف.", true);
            return;
        }
        name = customName.trim();
    }
    
    // Check if surplus
    const existingIndex = scannedItems.findIndex(i => i.item_id === itemId);
    let finalCount = scanQty;
    let expectedCount = expected;
    
    if (existingIndex !== -1) {
        const item = scannedItems[existingIndex];
        if (!item.zone_breakdown) item.zone_breakdown = {};
        item.zone_breakdown[activeZone] = (item.zone_breakdown[activeZone] || 0) + scanQty;
        item.counted_qty = (item.counted_qty || 0) + scanQty;
        item.scanned_by = employeeName;
        item.updated_at = new Date().toISOString();
        item.is_pending_sync = true;
        finalCount = item.counted_qty;
        expectedCount = item.expected_qty;
    } else {
        const zone_breakdown = {};
        zone_breakdown[activeZone] = scanQty;
        
        scannedItems.push({
            session_id: activeSessionId,
            item_id: itemId,
            name: name,
            barcode: actualBarcode,
            old_item_id: old_item_id,
            price: price,
            expected_qty: expected,
            counted_qty: scanQty,
            scanned_by: employeeName,
            updated_at: new Date().toISOString(),
            zone_breakdown: zone_breakdown,
            is_pending_sync: true
        });
    }

    if (finalCount > expectedCount) {
        playBeep('surplus');
    } else {
        playBeep('success');
    }
    
    await offlineStore.setItem(`offline_scanned_items_${activeSessionId}`, scannedItems);
    
    offlineQueue.push({ barcode: barcode, amount: scanQty, zone: activeZone, timestamp: Date.now() });
    await offlineStore.setItem(`offline_queue_${activeSessionId}`, offlineQueue);
    
    renderTable();
    showFeedback(`تم الحفظ محلياً: ${name} (${scanQty} قطع)`);
}

// Reload active session data from Supabase
async function reloadSessionData() {
    if (!activeSessionId || activeSessionId.toString().startsWith("offline_")) return;
    try {
        const { data, error } = await supabaseClient
            .from("inventory_session_items")
            .select("*")
            .eq("session_id", activeSessionId);
            
        if (!error && data) {
            scannedItems = data;
            renderTable();
        }
    } catch (e) {
        console.warn("Failed to reload session data:", e);
    }
}

// Pre-fetch all barcodes expected in current outlet
async function populateLocalBarcodesCache() {
    if (!currentOutlet || !stockByOutlet[currentOutlet] || !navigator.onLine) return;
    
    const itemIds = Object.keys(stockByOutlet[currentOutlet]);
    if (itemIds.length === 0) return;
    
    console.log(`Pre-fetching ${itemIds.length} barcodes for offline mode...`);
    
    const batchSize = 1000;
    for (let i = 0; i < itemIds.length; i += batchSize) {
        const batch = itemIds.slice(i, i + batchSize);
        const { data, error } = await supabaseClient
            .from("dynamics_barcodes")
            .select("*")
            .in("item_id", batch);
            
        if (!error && data) {
            data.forEach(item => {
                localBarcodesCache[item.barcode] = item;
                localBarcodesCache[item.item_id] = item;
            });
        }
    }
    
    await offlineStore.setItem(`barcodes_cache_${currentOutlet}`, localBarcodesCache);
    console.log("Offline barcodes cache updated in IndexedDB:", Object.keys(localBarcodesCache).length);
}

// Sync Offline Scan Queue to Supabase
async function syncOfflineQueue() {
    if (offlineQueue.length === 0 || !navigator.onLine) return;
    
    console.log(`Syncing ${offlineQueue.length} offline scans...`);
    const banner = document.getElementById("connection-status-banner");
    if (banner) {
        banner.className = "alert alert-warning text-center mb-0 py-2 fw-bold";
        banner.innerHTML = `⏳ جاري مزامنة ${offlineQueue.length} عمليات مسح مع السحابة...`;
        banner.style.display = "block";
    }
    
    const toProcess = [...offlineQueue];
    
    for (const scan of toProcess) {
        try {
            let dbItem = localBarcodesCache[scan.barcode];
            let itemId = scan.barcode;
            let name = "صنف غير معرف بالنظام ⚠️";
            let old_item_id = "";
            let price = 0.0;
            let actualBarcode = scan.barcode;
            let expected = 0;
            
            if (dbItem) {
                itemId = dbItem.item_id;
                name = dbItem.barcode_description || dbItem.search_name || "صنف بدون اسم";
                old_item_id = dbItem.old_item_id || "";
                price = parseFloat(dbItem.price) || 0.0;
                actualBarcode = dbItem.barcode || scan.barcode;
                expected = (stockByOutlet[currentOutlet] && stockByOutlet[currentOutlet][dbItem.item_id]) || 0;
            } else {
                const onlineDbItem = await lookupItem(scan.barcode);
                if (onlineDbItem) {
                    localBarcodesCache[scan.barcode] = onlineDbItem;
                    localBarcodesCache[onlineDbItem.item_id] = onlineDbItem;
                    
                    itemId = onlineDbItem.item_id;
                    name = onlineDbItem.barcode_description || onlineDbItem.search_name || "صنف بدون اسم";
                    old_item_id = onlineDbItem.old_item_id || "";
                    price = parseFloat(onlineDbItem.price) || 0.0;
                    actualBarcode = onlineDbItem.barcode || scan.barcode;
                    expected = (stockByOutlet[currentOutlet] && stockByOutlet[currentOutlet][onlineDbItem.item_id]) || 0;
                }
            }
            
            const { error } = await supabaseClient.rpc('increment_session_item', {
                p_session_id: activeSessionId,
                p_item_id: itemId,
                p_name: name,
                p_barcode: actualBarcode,
                p_old_item_id: old_item_id,
                p_price: price,
                p_expected_qty: expected,
                p_amount: scan.amount,
                p_scanned_by: employeeName,
                p_zone: scan.zone || 'العام'
            });
            
            if (!error) {
                offlineQueue = offlineQueue.filter(s => s.timestamp !== scan.timestamp);
                await offlineStore.setItem(`offline_queue_${activeSessionId}`, offlineQueue);
            }
        } catch (e) {
            console.error("Failed to sync scan event:", e);
        }
    }
    
    await reloadSessionData();
    
    if (offlineQueue.length === 0) {
        if (banner) {
            banner.className = "alert alert-success text-center mb-0 py-2 fw-bold";
            banner.innerHTML = "🟢 تم مزامنة جميع عمليات المسح المحلية بنجاح!";
            setTimeout(() => {
                banner.style.display = "none";
            }, 3000);
        }
    } else {
        if (banner) {
            banner.className = "alert alert-danger text-center mb-0 py-2 fw-bold";
            banner.innerHTML = `⚠️ فشل مزامنة بعض القطع (${offlineQueue.length} متبقية). يرجى التحقق من الاتصال.`;
        }
    }
}

// Sync temporary Offline Session to Supabase Cloud
window.syncOfflineSessionToCloud = async function() {
    if (!navigator.onLine || !activeSessionId || !activeSessionId.toString().startsWith("offline_")) return;
    
    const banner = document.getElementById("connection-status-banner");
    if (banner) {
        banner.className = "alert alert-warning text-center mb-0 py-2 fw-bold";
        banner.innerHTML = "⏳ جاري تهيئة الجلسة السحابية ورفع البينات... يرجى الانتظار.";
    }
    
    try {
        const { data, error } = await supabaseClient
            .from("inventory_sessions")
            .insert({
                outlet: currentOutlet,
                created_by: employeeName,
                status: "active"
            })
            .select();
            
        if (error) {
            alert("حدث خطأ أثناء إنشاء الجلسة السحابية: " + error.message);
            updateOnlineStatus();
            return;
        }
        
        const realSessionId = data[0].id;
        
        if (scannedItems.length > 0) {
            if (banner) {
                banner.innerHTML = `⏳ جاري رفع ${scannedItems.length} صنف إلى الجلسة السحابية...`;
            }
            
            for (const item of scannedItems) {
                const breakdown = item.zone_breakdown || { "العام": item.counted_qty };
                for (const [zoneName, qty] of Object.entries(breakdown)) {
                    const { error: itemErr } = await supabaseClient.rpc('increment_session_item', {
                        p_session_id: realSessionId,
                        p_item_id: item.item_id,
                        p_name: item.name,
                        p_barcode: item.barcode,
                        p_old_item_id: item.old_item_id || "",
                        p_price: parseFloat(item.price) || 0.0,
                        p_expected_qty: item.expected_qty,
                        p_amount: Number(qty) || 0,
                        p_scanned_by: item.scanned_by || employeeName,
                        p_zone: zoneName
                    });
                    
                    if (itemErr) {
                        console.error("Error syncing offline session item:", itemErr);
                    }
                }
            }
        }
        
        await offlineStore.removeItem(`offline_scanned_items_${activeSessionId}`);
        await offlineStore.removeItem(`offline_queue_${activeSessionId}`);
        
        activeSessionId = realSessionId;
        offlineQueue = [];
        
        await reloadSessionData();
        subscribeToSession(activeSessionId);
        await populateLocalBarcodesCache();
        
        if (banner) {
            banner.className = "alert alert-success text-center mb-0 py-2 fw-bold";
            banner.innerHTML = "🟢 تم مزامنة ورفع الجلسة المحلية إلى السحاب بنجاح!";
            setTimeout(() => {
                banner.style.display = "none";
            }, 3000);
        }
    } catch (e) {
        console.error("Offline session sync failed:", e);
        alert("فشل مزامنة الجلسة: " + e.message);
        updateOnlineStatus();
    }
};

// Monitor Online/Offline Connection Status
function updateOnlineStatus() {
    const banner = document.getElementById("connection-status-banner");
    if (!banner) return;
    
    if (navigator.onLine) {
        if (activeSessionId && !activeSessionId.toString().startsWith("offline_")) {
            if (offlineQueue.length > 0) {
                syncOfflineQueue();
            } else {
                banner.className = "alert alert-success text-center mb-0 py-2 fw-bold";
                banner.innerHTML = "🟢 تم استعادة الاتصال بالإنترنت بنجاح!";
                setTimeout(() => {
                    banner.style.display = "none";
                }, 3000);
            }
        } else if (activeSessionId && activeSessionId.toString().startsWith("offline_")) {
            banner.className = "alert alert-warning text-center mb-0 py-2 fw-bold";
            banner.innerHTML = '🟢 تم اكتشاف اتصال بالإنترنت! <button class="btn btn-sm btn-success ms-2 fw-bold" onclick="syncOfflineSessionToCloud()">مزامنة ورفع الجلسة إلى السحاب ☁️</button>';
            banner.style.display = "block";
        } else {
            checkActiveSession();
        }
    } else {
        banner.className = "alert alert-danger text-center mb-0 py-2 fw-bold";
        banner.innerHTML = "⚠️ انقطع الاتصال بالإنترنت! يرجى التوقف عن المسح أو بدء جرد أوفلاين لتجنب فقدان البيانات.";
        banner.style.display = "block";
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// Subscribe to Supabase Realtime changes for the current session
function subscribeToSession(sessionId) {
    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
    }
    
    console.log("Subscribing to realtime updates for session:", sessionId);
    
    realtimeChannel = supabaseClient.channel(`session-${sessionId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'inventory_session_items', filter: `session_id=eq.${sessionId}` },
            (payload) => {
                console.log('Realtime change received:', payload);
                const newItem = payload.new;
                const oldItem = payload.old;
                
                if (payload.eventType === 'INSERT') {
                    const idx = scannedItems.findIndex(i => i.item_id === newItem.item_id);
                    if (idx === -1) {
                        scannedItems.push(newItem);
                    } else {
                        scannedItems[idx] = newItem;
                    }
                    
                    if (newItem.scanned_by !== employeeName) {
                        playBeep('success');
                        showFeedback(`قام الزميل ${newItem.scanned_by} بمسح: ${newItem.name}`);
                    }
                } else if (payload.eventType === 'UPDATE') {
                    const idx = scannedItems.findIndex(i => i.item_id === newItem.item_id);
                    if (idx !== -1) {
                        const oldQty = scannedItems[idx].counted_qty;
                        scannedItems[idx] = newItem;
                        
                        if (newItem.counted_qty > oldQty && newItem.scanned_by !== employeeName) {
                            playBeep('success');
                            showFeedback(`تحديث كمية من ${newItem.scanned_by}: ${newItem.name} (${newItem.counted_qty})`);
                        }
                    } else {
                        scannedItems.push(newItem);
                    }
                } else if (payload.eventType === 'DELETE') {
                    scannedItems = scannedItems.filter(i => i.item_id !== oldItem.item_id);
                }
                
                renderTable();
            }
        )
        .subscribe();
}

// Generate Excel file rows representing multiple barcodes in columns (with explicit numbers casting)
async function generateExcelRows() {
    if (scannedItems.length === 0) return [];
    
    const itemIds = scannedItems.map(item => item.item_id).filter(id => id && !id.includes("⚠️"));
    
    let allBarcodes = [];
    if (itemIds.length > 0 && navigator.onLine) {
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
    scannedItems.forEach(item => {
        const barcodes = barcodesMap[item.item_id] || [item.barcode];
        if (barcodes.length > maxBarcodesCount) {
            maxBarcodesCount = barcodes.length;
        }
    });
    
    const rows = [];
    scannedItems.forEach(item => {
        let barcodes = barcodesMap[item.item_id] || [item.barcode];
        if (barcodes.length === 0) barcodes = [item.barcode];
        
        const rowObj = {
            "رقم المنتج (Item ID)": item.item_id,
            "اسم الصنف (Item Name)": item.name,
            "الكود البديل (Alias)": item.old_item_id
        };
        
        for (let i = 0; i < maxBarcodesCount; i++) {
            rowObj[`الباركود ${i + 1}`] = barcodes[i] || "";
        }
        
        rowObj["السعر (Price)"] = Number(item.price) || 0;
        rowObj["الكمية الموجودة بالمعرض (Expected)"] = Number(item.expected_qty) || 0;
        rowObj["الكمية الفعلية بالجرد (Counted)"] = Number(item.counted_qty) || 0;
        rowObj["الفرق (Difference)"] = (Number(item.counted_qty) || 0) - (Number(item.expected_qty) || 0);
        
        rows.push(rowObj);
    });
    
    return rows;
}

// Generate Excel file buffer
async function getExcelBlob(rows) {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!dir'] = 'rtl';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير الجرد");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return {
        blob: new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        workbook: wb
    };
}

// Active session status check
async function checkActiveSession() {
    const select = document.getElementById("showroom-select");
    const nameInput = document.getElementById("employee-name-input");
    if (!select || !nameInput) return;
    currentOutlet = select.value;
    employeeName = nameInput.value.trim();
    
    if (!currentOutlet) {
        hideSessionButtons();
        return;
    }
    
    const offlineBtn = document.getElementById("start-offline-session-btn");
    
    if (!navigator.onLine) {
        hideSessionButtons();
        if (offlineBtn) offlineBtn.style.display = "block";
        
        const cached = await offlineStore.getItem(`barcodes_cache_${currentOutlet}`);
        if (cached) {
            localBarcodesCache = cached;
        }
        
        const statusArea = document.getElementById("session-status-area");
        const statusMsg = document.getElementById("session-status-message");
        if (statusMsg) {
            statusMsg.innerHTML = "🔌 أنت غير متصل بالإنترنت حالياً. يمكنك بدء جلسة جرد محلية وسيتم حفظ البيانات على هذا الجهاز ومزامنتها فور عودة الشبكة.";
        }
        if (statusArea) statusArea.style.display = "block";
        return;
    } else {
        if (offlineBtn) offlineBtn.style.display = "none";
    }
    
    try {
        const { data, error } = await supabaseClient
            .from("inventory_sessions")
            .select("*")
            .eq("outlet", currentOutlet)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1);
            
        if (error) {
            console.error("Error checking active session:", error);
            return;
        }
        
        const statusArea = document.getElementById("session-status-area");
        const statusMsg = document.getElementById("session-status-message");
        const startBtn = document.getElementById("start-session-btn");
        const joinBtn = document.getElementById("join-session-btn");
        const overrideBtn = document.getElementById("override-session-btn");
        
        if (data && data.length > 0) {
            currentActiveSession = data[0];
            const startDate = new Date(currentActiveSession.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) + " " + new Date(currentActiveSession.created_at).toLocaleDateString('ar-EG');
            
            if (statusMsg) {
                statusMsg.innerHTML = `⚠️ تنبيه: يوجد جرد نشط حالياً لهذا المعرض بدأه الزميل <strong>${currentActiveSession.created_by}</strong> بتاريخ <strong>${startDate}</strong>.`;
            }
            if (statusArea) statusArea.style.display = "block";
            
            if (startBtn) startBtn.style.display = "none";
            if (joinBtn) joinBtn.style.display = "block";
            if (overrideBtn) overrideBtn.style.display = "block";
        } else {
            currentActiveSession = null;
            if (statusArea) statusArea.style.display = "none";
            
            if (startBtn) startBtn.style.display = "block";
            if (joinBtn) joinBtn.style.display = "none";
            if (overrideBtn) overrideBtn.style.display = "none";
        }
    } catch (e) {
        console.error("Failed to query active session:", e);
    }
}

function hideSessionButtons() {
    if (document.getElementById("session-status-area")) document.getElementById("session-status-area").style.display = "none";
    if (document.getElementById("start-session-btn")) document.getElementById("start-session-btn").style.display = "none";
    if (document.getElementById("join-session-btn")) document.getElementById("join-session-btn").style.display = "none";
    if (document.getElementById("override-session-btn")) document.getElementById("override-session-btn").style.display = "none";
    if (document.getElementById("start-offline-session-btn")) document.getElementById("start-offline-session-btn").style.display = "none";
}

function validateSelection() {
    const select = document.getElementById("showroom-select");
    const nameInput = document.getElementById("employee-name-input");
    employeeName = nameInput.value.trim();
    currentOutlet = select.value;
    
    if (!employeeName) {
        alert("يرجى إدخال اسم الموظف المسؤول أولاً!");
        nameInput.focus();
        return false;
    }
    if (!currentOutlet) {
        alert("يرجى اختيار المعرض أولاً!");
        select.focus();
        return false;
    }
    return true;
}

// Strict Focus Lock & Keyboard Shortcuts Setup
let focusLockInterval = null;
function initLaptopUX() {
    // Focus lock interval
    if (focusLockInterval) clearInterval(focusLockInterval);
    focusLockInterval = setInterval(() => {
        if (!activeSessionId) return;
        const barcodeInput = document.getElementById("manual-barcode-input");
        const activeEl = document.activeElement;
        
        // If focus is not on input/select, bring it back to scanner
        const isInteractive = activeEl && (
            activeEl.tagName === "INPUT" || 
            activeEl.tagName === "SELECT" || 
            activeEl.tagName === "BUTTON" ||
            activeEl.isContentEditable
        );
        
        if (barcodeInput && !isInteractive) {
            barcodeInput.focus();
        }
    }, 1500);

    // Keyboard Shortcuts Listener
    window.addEventListener("keydown", (e) => {
        if (!activeSessionId) return;
        
        if (e.key === "F9") {
            e.preventDefault();
            const input = document.getElementById("manual-barcode-input");
            if (input) {
                input.focus();
                input.select();
                showFeedback("تم إعادة توجيه المؤشر لحقل المسح 🔍");
            }
        } else if (e.key === "F2") {
            e.preventDefault();
            const select = document.getElementById("zone-select");
            if (select) {
                select.focus();
                showFeedback("تم توجيه المؤشر لاختيار المنطقة 📍");
            }
        } else if (e.key === "F8") {
            e.preventDefault();
            const btn = document.getElementById("download-excel-btn");
            if (btn && !btn.disabled) {
                btn.click();
            }
        }
    });
}

// Excel Import Handler
async function handleExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            
            if (jsonData.length === 0) {
                alert("الملف المرفوع فارغ!");
                return;
            }
            
            let importCount = 0;
            for (const row of jsonData) {
                const itemId = row["رقم المنتج (Item ID)"] || row["رقم المنتج"] || row["Item ID"];
                const counted = parseInt(row["الكمية الفعلية بالجرد (Counted)"] || row["الكمية الفعلية"] || row["الكمية"] || row["Counted"], 10);
                const name = row["اسم الصنف (Item Name)"] || row["اسم الصنف"] || row["Item Name"] || "صنف مستورد";
                const barcode = row["الباركود 1"] || row["الباركود"] || row["Barcode"] || itemId;
                
                if (itemId && !isNaN(counted) && counted > 0) {
                    importCount++;
                    
                    if (!navigator.onLine || activeSessionId.toString().startsWith("offline_")) {
                        let existing = scannedItems.find(i => i.item_id === itemId);
                        if (existing) {
                            if (!existing.zone_breakdown) existing.zone_breakdown = {};
                            existing.zone_breakdown[activeZone] = (existing.zone_breakdown[activeZone] || 0) + counted;
                            existing.counted_qty = (existing.counted_qty || 0) + counted;
                            existing.updated_at = new Date().toISOString();
                        } else {
                            const zone_breakdown = {};
                            zone_breakdown[activeZone] = counted;
                            scannedItems.push({
                                session_id: activeSessionId,
                                item_id: itemId,
                                name: name,
                                barcode: barcode,
                                old_item_id: "",
                                price: 0.0,
                                expected_qty: (stockByOutlet[currentOutlet] && stockByOutlet[currentOutlet][itemId]) || 0,
                                counted_qty: counted,
                                scanned_by: employeeName,
                                updated_at: new Date().toISOString(),
                                zone_breakdown: zone_breakdown,
                                is_pending_sync: true
                            });
                        }
                        offlineQueue.push({ barcode: barcode, amount: counted, zone: activeZone, timestamp: Date.now() });
                    } else {
                        await supabaseClient.rpc('increment_session_item', {
                            p_session_id: activeSessionId,
                            p_item_id: itemId,
                            p_name: name,
                            p_barcode: barcode,
                            p_old_item_id: "",
                            p_price: 0.0,
                            p_expected_qty: (stockByOutlet[currentOutlet] && stockByOutlet[currentOutlet][itemId]) || 0,
                            p_amount: counted,
                            p_scanned_by: employeeName,
                            p_zone: activeZone
                        });
                    }
                }
            }
            
            if (!navigator.onLine || activeSessionId.toString().startsWith("offline_")) {
                await offlineStore.setItem(`offline_scanned_items_${activeSessionId}`, scannedItems);
                await offlineStore.setItem(`offline_queue_${activeSessionId}`, offlineQueue);
            }
            
            playBeep('success');
            alert(`تم استيراد ودمج ${importCount} صنف بنجاح!`);
            
            if (navigator.onLine && !activeSessionId.toString().startsWith("offline_")) {
                await reloadSessionData();
            } else {
                renderTable();
            }
            
        } catch (err) {
            console.error("Excel import error:", err);
            alert("حدث خطأ أثناء قراءة ملف Excel. يرجى التحقق من صياغة الملف والأعمدة.");
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; // Reset
}

async function enterWorkspace() {
    document.getElementById("showroom-selection-card").style.display = "none";
    document.getElementById("inventory-workspace").style.display = "block";
    document.getElementById("active-outlet-name").innerText = currentOutlet;
    
    renderTable();
    
    if (activeSessionId && !activeSessionId.toString().startsWith("offline_")) {
        subscribeToSession(activeSessionId);
        await populateLocalBarcodesCache();
    }
    
    const input = document.getElementById("manual-barcode-input");
    if (input) {
        input.focus();
    }
    
    initLaptopUX();
    updateOnlineStatus();
}

// Generate Excel file rows representing multiple barcodes in columns (with explicit numbers casting)
async function generateExcelRows() {
    if (scannedItems.length === 0) return [];
    
    const itemIds = scannedItems.map(item => item.item_id).filter(id => id && !id.includes("⚠️"));
    
    let allBarcodes = [];
    if (itemIds.length > 0 && navigator.onLine) {
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
    scannedItems.forEach(item => {
        const barcodes = barcodesMap[item.item_id] || [item.barcode];
        if (barcodes.length > maxBarcodesCount) {
            maxBarcodesCount = barcodes.length;
        }
    });

    // Find all unique zones in scanned items
    const zonesInSession = new Set();
    scannedItems.forEach(item => {
        if (item.zone_breakdown) {
            Object.keys(item.zone_breakdown).forEach(z => zonesInSession.add(z));
        }
    });
    const sortedZones = Array.from(zonesInSession).sort();
    
    const rows = [];
    scannedItems.forEach(item => {
        let barcodes = barcodesMap[item.item_id] || [item.barcode];
        if (barcodes.length === 0) barcodes = [item.barcode];
        
        const rowObj = {
            "رقم المنتج (Item ID)": item.item_id,
            "اسم الصنف (Item Name)": item.name,
            "الكود البديل (Alias)": item.old_item_id
        };
        
        for (let i = 0; i < maxBarcodesCount; i++) {
            rowObj[`الباركود ${i + 1}`] = barcodes[i] || "";
        }
        
        rowObj["السعر (Price)"] = Number(item.price) || 0;
        rowObj["الكمية الموجودة بالمعرض (Expected)"] = Number(item.expected_qty) || 0;
        
        // Add zone columns
        sortedZones.forEach(z => {
            rowObj[`الكمية في (${z})`] = (item.zone_breakdown && item.zone_breakdown[z]) || 0;
        });

        rowObj["إجمالي الكمية الفعلية (Counted)"] = Number(item.counted_qty) || 0;
        rowObj["الفرق (Difference)"] = (Number(item.counted_qty) || 0) - (Number(item.expected_qty) || 0);
        
        rows.push(rowObj);
    });
    
    return rows;
}

// Generate Excel file buffer
async function getExcelBlob(rows) {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!dir'] = 'rtl';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير الجرد");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return {
        blob: new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        workbook: wb
    };
}

// On Page Load
window.addEventListener("DOMContentLoaded", async () => {
    const select = document.getElementById("showroom-select");
    const nameInput = document.getElementById("employee-name-input");
    
    const storedName = localStorage.getItem("inventory_employee_name");
    if (storedName && nameInput) {
        nameInput.value = storedName;
    }

    try {
        const response = await fetch("data/stock_by_outlet.json");
        if (response.ok) {
            stockByOutlet = await response.json();
            
            if (select) {
                select.innerHTML = '<option value="" disabled selected>-- اختر معرض الجرد --</option>';
                
                Object.keys(stockByOutlet).sort().forEach(outlet => {
                    const option = document.createElement("option");
                    option.value = outlet;
                    option.textContent = outlet;
                    select.appendChild(option);
                });
            }
        } else {
            console.error("Failed to load showroom stock.");
            alert("خطأ: لم يتم العثور على ملف مخزون المعارض. يرجى تشغيل سكربت المزامنة أولاً.");
        }
    } catch (e) {
        console.error("Error fetching stock map:", e);
    }
    
    if (select) select.addEventListener("change", checkActiveSession);
    if (nameInput) nameInput.addEventListener("input", checkActiveSession);
    
    // Start Session click event
    const startSessionBtn = document.getElementById("start-session-btn");
    if (startSessionBtn) {
        startSessionBtn.addEventListener("click", async () => {
            if (!validateSelection()) return;
            localStorage.setItem("inventory_employee_name", employeeName);
            
            const { data, error } = await supabaseClient
                .from("inventory_sessions")
                .insert({
                    outlet: currentOutlet,
                    created_by: employeeName,
                    status: "active"
                })
                .select();
                
            if (error) {
                alert("حدث خطأ أثناء بدء الجلسة: " + error.message);
                return;
            }
            
            activeSessionId = data[0].id;
            scannedItems = [];
            offlineQueue = [];
            await enterWorkspace();
        });
    }
    
    // Join Session click event
    const joinSessionBtn = document.getElementById("join-session-btn");
    if (joinSessionBtn) {
        joinSessionBtn.addEventListener("click", async () => {
            if (!validateSelection()) return;
            localStorage.setItem("inventory_employee_name", employeeName);
            
            activeSessionId = currentActiveSession.id;
            
            const { data, error } = await supabaseClient
                .from("inventory_session_items")
                .select("*")
                .eq("session_id", activeSessionId);
                
            if (error) {
                alert("حدث خطأ أثناء تحميل الأصناف: " + error.message);
                return;
            }
            
            scannedItems = data || [];
            offlineQueue = [];
            await enterWorkspace();
        });
    }
    
    // Override Session click event
    const overrideSessionBtn = document.getElementById("override-session-btn");
    if (overrideSessionBtn) {
        overrideSessionBtn.addEventListener("click", async () => {
            if (!currentActiveSession) return;
            if (!confirm("⚠️ هل أنت متأكد من إلغاء جلسة الجرد النشطة الحالية والبدء من الصفر؟ سيتم أرشفة الجلسة الحالية كجلسة منتهية.")) return;
            if (!validateSelection()) return;
            
            await supabaseClient
                .from("inventory_sessions")
                .update({ status: "completed" })
                .eq("id", currentActiveSession.id);
                
            const { data, error } = await supabaseClient
                .from("inventory_sessions")
                .insert({
                    outlet: currentOutlet,
                    created_by: employeeName,
                    status: "active"
                })
                .select();
                
            if (error) {
                alert("حدث خطأ أثناء بدء الجلسة الجديدة: " + error.message);
                return;
            }
            
            activeSessionId = data[0].id;
            scannedItems = [];
            offlineQueue = [];
            await enterWorkspace();
        });
    }
    
    // Start Offline Session click event
    const startOfflineBtn = document.getElementById("start-offline-session-btn");
    if (startOfflineBtn) {
        startOfflineBtn.addEventListener("click", async () => {
            if (!validateSelection()) return;
            localStorage.setItem("inventory_employee_name", employeeName);
            
            const outletClean = currentOutlet.replace(/\s+/g, '_');
            activeSessionId = "offline_" + outletClean + "_" + Date.now();
            
            scannedItems = (await offlineStore.getItem(`offline_scanned_items_${activeSessionId}`)) || [];
            offlineQueue = (await offlineStore.getItem(`offline_queue_${activeSessionId}`)) || [];
            
            await enterWorkspace();
        });
    }
    
    // Manual entry form submission
    if (document.getElementById("manual-barcode-form")) {
        document.getElementById("manual-barcode-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const input = document.getElementById("manual-barcode-input");
            const val = input ? input.value.trim() : "";
            if (val) {
                input.value = "";
                input.focus();
                await handleScan(val);
            }
        });
    }
    
    // Clear inventory session items
    if (document.getElementById("clear-current-inventory")) {
        document.getElementById("clear-current-inventory").addEventListener("click", async () => {
            if (confirm("هل أنت متأكد من مسح جميع الأصناف المجرودة الحالية في هذه الجلسة؟ لا يمكن التراجع.")) {
                if (!navigator.onLine || activeSessionId.toString().startsWith("offline_")) {
                    scannedItems = [];
                    offlineQueue = [];
                    await offlineStore.setItem(`offline_scanned_items_${activeSessionId}`, []);
                    await offlineStore.setItem(`offline_queue_${activeSessionId}`, []);
                    renderTable();
                    return;
                }
                const { error } = await supabaseClient
                    .from("inventory_session_items")
                    .delete()
                    .eq("session_id", activeSessionId);
                if (error) {
                    console.error("Error clearing session:", error);
                    alert("حدث خطأ أثناء مسح الأصناف.");
                }
            }
        });
    }
    
    // Download Excel locally (Draft/Preview)
    if (document.getElementById("download-excel-btn")) {
        document.getElementById("download-excel-btn").addEventListener("click", async () => {
            if (scannedItems.length === 0) {
                alert("لا توجد أصناف مجرودة لتحميلها!");
                return;
            }
            
            const rows = await generateExcelRows();
            const { workbook } = await getExcelBlob(rows);
            
            const dateStr = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(workbook, `جرد_مؤقت_${currentOutlet}_${dateStr}.xlsx`);
        });
    }
    
    // Finish and Share on WhatsApp
    if (document.getElementById("whatsapp-share-btn")) {
        document.getElementById("whatsapp-share-btn").addEventListener("click", async () => {
            if (scannedItems.length === 0) {
                alert("لا توجد أصناف مجرودة لمشاركتها!");
                return;
            }
            
            if (!navigator.onLine) {
                alert("أنت غير متصل بالإنترنت حالياً! يرجى تحميل ملف Excel يدوياً ومشاركته.");
                return;
            }
            
            const btn = document.getElementById("whatsapp-share-btn");
            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = "جاري رفع الملف ومشاركة الرابط... ⏳";
            
            try {
                const rows = await generateExcelRows();
                const { blob, workbook } = await getExcelBlob(rows);
                
                const dateStr = new Date().toISOString().slice(0, 10);
                const fileName = `inventory_${currentOutlet.replace(/\s+/g, '_')}_${dateStr}_${Date.now()}.xlsx`;
                
                const { data, error } = await supabaseClient.storage
                    .from("inventory-reports")
                    .upload(fileName, blob, {
                        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        cacheControl: "3600",
                        upsert: false
                    });
                    
                if (error) throw error;
                
                const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/inventory-reports/${fileName}`;
                const totalQty = scannedItems.reduce((acc, item) => acc + (Number(item.counted_qty) || 0), 0);
                const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
                
                const textMsg = `📋 *محضر جرد مشترك (مسودة) - معرض أورانج*\n` +
                                `📍 *المعرض:* ${currentOutlet}\n` +
                                `📅 *التاريخ:* ${today}\n` +
                                `📦 *عدد الأصناف المجرودة:* ${scannedItems.length}\n` +
                                `🔢 *إجمالي القطع الممسوحة:* ${totalQty}\n\n` +
                                `🔗 *رابط تحميل تقرير الجرد (Excel):*\n${publicUrl}`;
                
                const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(textMsg)}`;
                window.open(waUrl, "_blank");
                
                XLSX.writeFile(workbook, `جرد_مؤقت_${currentOutlet}_${dateStr}.xlsx`);
                
            } catch (e) {
                console.error("Error sharing report:", e);
                alert("حدث خطأ أثناء رفع التقرير. سيتم تحميل التقرير محلياً على جهازك.");
                const rows = await generateExcelRows();
                const { workbook } = await getExcelBlob(rows);
                XLSX.writeFile(workbook, `جرد_${currentOutlet}.xlsx`);
            } finally {
                btn.disabled = false;
                btn.innerText = originalText;
            }
        });
    }

    // Complete Session Lock button
    const completeSessionBtn = document.getElementById("complete-session-btn");
    if (completeSessionBtn) {
        completeSessionBtn.addEventListener("click", async () => {
            if (activeSessionId && activeSessionId.toString().startsWith("offline_")) {
                alert("يرجى مزامنة الجلسة السحابية أولاً عند عودة الإنترنت لإغلاقها بشكل نهائي سحابياً.");
                return;
            }
            
            if (!confirm("⚠️ هل أنت متأكد من إغلاق جلسة الجرد نهائياً لجميع الموظفين؟ لا يمكن مسح أصناف إضافية بعد الإغلاق.")) {
                return;
            }
            
            if (!navigator.onLine) {
                alert("يتطلب إغلاق الجلسة وجود اتصال بالإنترنت للرفع النهائي.");
                return;
            }
            
            const btn = document.getElementById("complete-session-btn");
            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = "جاري إغلاق الجلسة ورفع التقرير النهائي... ⏳";
            
            try {
                const { error: sessionErr } = await supabaseClient
                    .from("inventory_sessions")
                    .update({ status: "completed" })
                    .eq("id", activeSessionId);
                    
                if (sessionErr) throw sessionErr;
                
                const rows = await generateExcelRows();
                const { blob, workbook } = await getExcelBlob(rows);
                
                const dateStr = new Date().toISOString().slice(0, 10);
                const fileName = `inventory_final_${currentOutlet.replace(/\s+/g, '_')}_${dateStr}_${Date.now()}.xlsx`;
                
                const { data, error: uploadErr } = await supabaseClient.storage
                    .from("inventory-reports")
                    .upload(fileName, blob, {
                        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        cacheControl: "3600",
                        upsert: false
                    });
                    
                if (uploadErr) throw uploadErr;
                
                const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/inventory-reports/${fileName}`;
                const totalQty = scannedItems.reduce((acc, item) => acc + (Number(item.counted_qty) || 0), 0);
                const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
                
                const textMsg = `🔒 *تقرير جرد نهائي مغلق لمعرض أورانج*\n` +
                                `📍 *المعرض:* ${currentOutlet}\n` +
                                `📅 *التاريخ:* ${today}\n` +
                                `📦 *عدد الأصناف المجرودة:* ${scannedItems.length}\n` +
                                `🔢 *إجمالي القطع الممسوحة:* ${totalQty}\n\n` +
                                `🔗 *رابط تحميل تقرير الجرد النهائي (Excel):*\n${publicUrl}`;
                
                const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(textMsg)}`;
                window.open(waUrl, "_blank");
                
                XLSX.writeFile(workbook, `جرد_نهائي_${currentOutlet}_${dateStr}.xlsx`);
                
                if (realtimeChannel) {
                    supabaseClient.removeChannel(realtimeChannel);
                    realtimeChannel = null;
                }
                
                await offlineStore.removeItem(`offline_scanned_items_${activeSessionId}`);
                await offlineStore.removeItem(`offline_queue_${activeSessionId}`);
                
                alert("تم إغلاق الجلسة بنجاح ورفع التقرير النهائي!");
                
                document.getElementById("inventory-workspace").style.display = "none";
                document.getElementById("showroom-selection-card").style.display = "block";
                
                activeSessionId = null;
                scannedItems = [];
                currentActiveSession = null;
                hideSessionButtons();
                checkActiveSession();
                
            } catch (e) {
                console.error("Error closing session:", e);
                alert("حدث خطأ أثناء إغلاق الجلسة: " + e.message);
            } finally {
                btn.disabled = false;
                btn.innerText = originalText;
            }
        });
    }

    // Active zone dropdown listener
    const zoneSelect = document.getElementById("zone-select");
    if (zoneSelect) {
        zoneSelect.addEventListener("change", (e) => {
            activeZone = e.target.value;
            renderTable();
            const input = document.getElementById("manual-barcode-input");
            if (input) input.focus();
        });
    }

    // Add zone button listener
    const addZoneBtn = document.getElementById("add-zone-btn");
    if (addZoneBtn) {
        addZoneBtn.addEventListener("click", () => {
            const newZone = prompt("أدخل اسم المنطقة / الرف الجديد:");
            if (newZone && newZone.trim()) {
                const cleanZone = newZone.trim();
                const select = document.getElementById("zone-select");
                
                let exists = false;
                for (let i = 0; i < select.options.length; i++) {
                    if (select.options[i].value === cleanZone) {
                        exists = true;
                        break;
                    }
                }
                
                if (!exists) {
                    const option = document.createElement("option");
                    option.value = cleanZone;
                    option.textContent = cleanZone;
                    select.appendChild(option);
                }
                
                select.value = cleanZone;
                activeZone = cleanZone;
                renderTable();
                showFeedback(`تم إضافة وتفعيل المنطقة: ${cleanZone}`);
            }
            const input = document.getElementById("manual-barcode-input");
            if (input) input.focus();
        });
    }

    // Table filters listeners
    const tableZoneFilter = document.getElementById("table-zone-filter");
    if (tableZoneFilter) {
        tableZoneFilter.addEventListener("change", (e) => {
            activeTableZoneFilter = e.target.value;
            renderTable();
        });
    }

    const tableDiffFilter = document.getElementById("table-diff-filter");
    if (tableDiffFilter) {
        tableDiffFilter.addEventListener("change", (e) => {
            activeTableDiffFilter = e.target.value;
            renderTable();
        });
    }

    // Excel import file input listener
    const excelImportInput = document.getElementById("excel-import-input");
    if (excelImportInput) {
        excelImportInput.addEventListener("change", handleExcelImport);
    }
});
