/**
 * app.js - Collaborative Inventory Assistant (مساعد الجرد الجماعي)
 * Responsive mobile-friendly client-side logic with Supabase, Realtime & html5-qrcode.
 */

// Supabase Configuration
const SUPABASE_URL = "https://sufeqdvooqkolghflhta.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1ZmVxZHZvb3Frb2xnaGZsaHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTY5OTIsImV4cCI6MjA4ODk5Mjk5Mn0.ody4a53OtJqzLIoTvJ3S6Igdue-Sy4HsUQ_Cz7MUSjY";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State Variables
let stockByOutlet = {};
let currentOutlet = "";
let scannedItems = []; // Array of { item_id, name, old_item_id, price, barcode, expected_qty, counted_qty, scanned_by }
let html5Qrcode = null;
let currentCameraId = null;
let camerasList = [];
let isScanning = false;
let scanLock = false;
let lastScannedBarcode = "";
let lastScanTime = 0;

// Collaborative Session State
let employeeName = "";
let activeSessionId = null;
let realtimeChannel = null;
let currentActiveSession = null;

// Audio Feedbacks
function playBeep(type = 'success') {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'success') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch A5
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.1); // Short 100ms beep
        } else if (type === 'error') {
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(220, audioCtx.currentTime); // Low pitch A3
            gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.3); // Longer 300ms buzz
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
    
    // Auto-hide feedback after 2.5 seconds
    setTimeout(() => {
        feedbackEl.style.display = "none";
    }, 2500);
}

// Visual flash overlay directly on camera viewfinder
function triggerFlashFeedback(itemName, isError = false) {
    const flashEl = document.getElementById("scanner-flash");
    const textEl = document.getElementById("scanner-flash-text");
    if (!flashEl || !textEl) return;
    
    flashEl.style.backgroundColor = isError ? "rgba(220, 53, 69, 0.35)" : "rgba(25, 135, 84, 0.35)";
    textEl.style.display = "block";
    textEl.className = isError ? "text-white fw-bold px-3 py-2 rounded-pill bg-danger" : "text-white fw-bold px-3 py-2 rounded-pill bg-success";
    textEl.innerText = itemName;
    
    setTimeout(() => {
        flashEl.style.backgroundColor = "rgba(0, 0, 0, 0)";
        textEl.style.display = "none";
    }, 800);
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
    
    // Sort items by update date descending so newly scanned items appear at the top
    const sortedItems = [...scannedItems].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

    sortedItems.forEach((item) => {
        totalQty += item.counted_qty;
        const diff = item.counted_qty - item.expected_qty;
        
        let diffClass = "diff-equal";
        let diffSign = "";
        if (diff > 0) {
            diffClass = "diff-surplus";
            diffSign = "+";
        } else if (diff < 0) {
            diffClass = "diff-deficit";
        }
        
        // Display who last scanned this item
        const scannerName = item.scanned_by ? ` (بواسطة ${item.scanned_by})` : "";
        
        html += `
            <tr class="scanned-row" id="row-${item.item_id}">
                <td><strong>${item.item_id}</strong></td>
                <td>
                    ${item.name}
                    <div class="text-muted small d-block d-md-none" style="font-size: 0.75rem;">${scannerName}</div>
                </td>
                <td><code class="text-dark">${item.barcode}</code></td>
                <td class="text-center">${item.expected_qty}</td>
                <td class="text-center" style="width: 110px;">
                    <input type="number" class="form-control form-control-sm text-center fw-bold" 
                        value="${item.counted_qty}" min="1" 
                        onfocus="this.select()"
                        onchange="updateItemQty('${item.item_id}', this.value)">
                </td>
                <td class="text-center">
                    <span class="badge badge-diff ${diffClass}">${diffSign}${diff}</span>
                </td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" onclick="adjustQty('${item.item_id}', 1)">+</button>
                        <button class="btn btn-outline-secondary" onclick="adjustQty('${item.item_id}', -1)">-</button>
                        <button class="btn btn-danger" onclick="removeItem('${item.item_id}')">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    totalQtyEl.innerText = totalQty;
}

// Adjust Item Qty via Buttons (+ / -)
window.adjustQty = async function(itemId, change) {
    const item = scannedItems.find(i => i.item_id === itemId);
    if (item) {
        const newQty = Math.max(1, item.counted_qty + change);
        const diff = newQty - item.counted_qty;
        if (diff === 0) return;
        
        const { error } = await supabaseClient.rpc('increment_session_item', {
            p_session_id: activeSessionId,
            p_item_id: item.item_id,
            p_name: item.name,
            p_barcode: item.barcode,
            p_old_item_id: item.old_item_id || "",
            p_price: parseFloat(item.price) || 0.0,
            p_expected_qty: item.expected_qty,
            p_amount: diff,
            p_scanned_by: employeeName
        });
        
        if (error) {
            console.error("Error adjusting quantity in database:", error);
            showFeedback("خطأ أثناء تحديث الكمية سحابياً!", true);
        }
    }
};

// Update Item Qty via Input Change
window.updateItemQty = async function(itemId, val) {
    const parsed = parseInt(val, 10);
    const item = scannedItems.find(i => i.item_id === itemId);
    if (item && !isNaN(parsed) && parsed >= 1) {
        const { error } = await supabaseClient
            .from('inventory_session_items')
            .update({ 
                counted_qty: parsed, 
                scanned_by: employeeName, 
                updated_at: new Date().toISOString() 
            })
            .eq('session_id', activeSessionId)
            .eq('item_id', itemId);
            
        if (error) {
            console.error("Error setting quantity in database:", error);
            showFeedback("خطأ أثناء تحديث الكمية سحابياً!", true);
        }
    }
};

// Remove Item from session in Supabase
window.removeItem = async function(itemId) {
    if (confirm("هل أنت متأكد من حذف هذا الصنف من الجرد؟")) {
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
};

// Query Supabase for Barcode or Item ID
async function lookupItem(code) {
    const cleanCode = code.trim();
    if (!cleanCode) return null;
    
    // First, lookup by barcode
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
    
    // Second, lookup by item_id (ProductNumber) directly
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
    
    // Play success beep immediately to feel responsive
    playBeep('success');
    triggerFlashFeedback("جاري البحث... ⏳");
    
    // Find expected quantity from local cached stock
    let dbItem = null;
    let expected = 0;
    
    // Lookup item in database
    dbItem = await lookupItem(cleanBarcode);
    
    let itemId = cleanBarcode;
    let name = "صنف غير معرف بالنظام ⚠️";
    let old_item_id = "";
    let price = 0.0;
    let actualBarcode = cleanBarcode;
    
    if (dbItem) {
        itemId = dbItem.item_id;
        name = dbItem.barcode_description || dbItem.search_name || "صنف بدون اسم";
        old_item_id = dbItem.old_item_id || "";
        price = parseFloat(dbItem.price) || 0.0;
        actualBarcode = dbItem.barcode || cleanBarcode;
        expected = (stockByOutlet[currentOutlet] && stockByOutlet[currentOutlet][dbItem.item_id]) || 0;
    }
    
    // Perform safe concurrent increment via RPC stored procedure
    const { error } = await supabaseClient.rpc('increment_session_item', {
        p_session_id: activeSessionId,
        p_item_id: itemId,
        p_name: name,
        p_barcode: actualBarcode,
        p_old_item_id: old_item_id,
        p_price: price,
        p_expected_qty: expected,
        p_amount: 1,
        p_scanned_by: employeeName
    });
    
    if (error) {
        console.error("Error inserting scanned item:", error);
        playBeep('error');
        showFeedback("خطأ أثناء تسجيل المسح في قاعدة البيانات!", true);
        triggerFlashFeedback("خطأ في التسجيل ❌", true);
    } else {
        showFeedback(`تم مسح: ${name}`);
        triggerFlashFeedback(name);
    }
}

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
                    
                    // Audio and flash feedback ONLY if the scan was performed by someone else!
                    if (newItem.scanned_by !== employeeName) {
                        playBeep('success');
                        showFeedback(`قام الزميل ${newItem.scanned_by} بمسح: ${newItem.name}`);
                    }
                } else if (payload.eventType === 'UPDATE') {
                    const idx = scannedItems.findIndex(i => i.item_id === newItem.item_id);
                    if (idx !== -1) {
                        const oldQty = scannedItems[idx].counted_qty;
                        scannedItems[idx] = newItem;
                        
                        // Audio feedback if quantity was increased by someone else!
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
        .subscribe((status) => {
            console.log(`Subscription status for session ${sessionId}:`, status);
        });
}

// Generate Excel file rows representing multiple barcodes in columns
async function generateExcelRows() {
    if (scannedItems.length === 0) return [];
    
    // Get unique list of scanned item IDs
    const itemIds = scannedItems.map(item => item.item_id).filter(id => id && !id.includes("⚠️"));
    
    let allBarcodes = [];
    if (itemIds.length > 0) {
        // Query Supabase for all barcodes associated with these item IDs
        const { data, error } = await supabaseClient
            .from("dynamics_barcodes")
            .select("*")
            .in("item_id", itemIds);
            
        if (!error && data) {
            allBarcodes = data;
        }
    }
    
    // Create lookup map of barcodes by item_id
    const barcodesMap = {};
    allBarcodes.forEach(b => {
        if (!barcodesMap[b.item_id]) {
            barcodesMap[b.item_id] = [];
        }
        if (!barcodesMap[b.item_id].includes(b.barcode)) {
            barcodesMap[b.item_id].push(b.barcode);
        }
    });
    
    // Find maximum number of barcodes for any scanned item
    let maxBarcodesCount = 1;
    scannedItems.forEach(item => {
        const barcodes = barcodesMap[item.item_id] || [item.barcode];
        if (barcodes.length > maxBarcodesCount) {
            maxBarcodesCount = barcodes.length;
        }
    });
    
    const rows = [];
    scannedItems.forEach(item => {
        // Find all barcodes for this item
        let barcodes = barcodesMap[item.item_id] || [item.barcode];
        if (barcodes.length === 0) barcodes = [item.barcode];
        
        // Build base row object
        const rowObj = {
            "رقم المنتج (Item ID)": item.item_id,
            "اسم الصنف (Item Name)": item.name,
            "الكود البديل (Alias)": item.old_item_id
        };
        
        // Add barcode columns dynamically (الباركود 1، الباركود 2، إلخ)
        for (let i = 0; i < maxBarcodesCount; i++) {
            rowObj[`الباركود ${i + 1}`] = barcodes[i] || "";
        }
        
        // Add stock and difference columns
        rowObj["السعر (Price)"] = item.price;
        rowObj["الكمية الموجودة بالمعرض (Expected)"] = item.expected_qty;
        rowObj["الكمية الفعلية بالجرد (Counted)"] = item.counted_qty;
        rowObj["الفرق (Difference)"] = item.counted_qty - item.expected_qty;
        
        rows.push(rowObj);
    });
    
    return rows;
}

// Generate Excel file buffer
async function getExcelBlob(rows) {
    const ws = XLSX.utils.json_to_sheet(rows);
    
    // Set Sheet Direction to RTL
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
    
    // Load stored employee name if exists
    const storedName = localStorage.getItem("inventory_employee_name");
    if (storedName && nameInput) {
        nameInput.value = storedName;
    }

    // 1. Fetch expected showroom stock mapping
    try {
        const response = await fetch("data/stock_by_outlet.json");
        if (response.ok) {
            stockByOutlet = await response.json();
            
            // Populate select dropdown with showroom/outlet names
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
        alert("خطأ أثناء تحميل بيانات المخزون: " + e.message);
    }
    
    // Active session status check
    async function checkActiveSession() {
        if (!select || !nameInput) return;
        currentOutlet = select.value;
        employeeName = nameInput.value.trim();
        
        if (!currentOutlet) {
            hideSessionButtons();
            return;
        }
        
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
    }
    
    function hideSessionButtons() {
        if (document.getElementById("session-status-area")) document.getElementById("session-status-area").style.display = "none";
        if (document.getElementById("start-session-btn")) document.getElementById("start-session-btn").style.display = "none";
        if (document.getElementById("join-session-btn")) document.getElementById("join-session-btn").style.display = "none";
        if (document.getElementById("override-session-btn")) document.getElementById("override-session-btn").style.display = "none";
    }
    
    function validateSelection() {
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
    
    async function enterWorkspace() {
        document.getElementById("showroom-selection-card").style.display = "none";
        document.getElementById("inventory-workspace").style.display = "block";
        document.getElementById("active-outlet-name").innerText = currentOutlet;
        
        renderTable();
        subscribeToSession(activeSessionId);
        initCamerasAndStart();
    }
    
    if (select) select.addEventListener("change", checkActiveSession);
    if (nameInput) nameInput.addEventListener("input", checkActiveSession);
    
    // 2. Start Session click event
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
            await enterWorkspace();
        });
    }
    
    // 3. Join Session click event
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
            await enterWorkspace();
        });
    }
    
    // 4. Override Session click event
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
            await enterWorkspace();
        });
    }
    
    // Toggle Camera click event
    if (document.getElementById("toggle-camera-btn")) {
        document.getElementById("toggle-camera-btn").addEventListener("click", async () => {
            if (isScanning) {
                await stopScanning();
            } else {
                if (currentCameraId) {
                    await startScanning(currentCameraId);
                } else {
                    alert("لم يتم العثور على كاميرات نشطة.");
                }
            }
        });
    }

    // Switch Camera click event
    if (document.getElementById("switch-camera-btn")) {
        document.getElementById("switch-camera-btn").addEventListener("click", async () => {
            if (camerasList.length <= 1) return;
            
            const currentIndex = camerasList.findIndex(c => c.id === currentCameraId);
            const nextIndex = (currentIndex + 1) % camerasList.length;
            currentCameraId = camerasList[nextIndex].id;
            
            if (isScanning) {
                await startScanning(currentCameraId);
            } else {
                showFeedback(`تم التبديل إلى الكاميرا: ${camerasList[nextIndex].label || nextIndex + 1}`);
            }
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
                    
                if (error) {
                    throw error;
                }
                
                const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/inventory-reports/${fileName}`;
                const totalQty = scannedItems.reduce((acc, item) => acc + item.counted_qty, 0);
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
            if (!confirm("⚠️ هل أنت متأكد من إغلاق جلسة الجرد نهائياً لجميع الموظفين؟ لا يمكن مسح أصناف إضافية بعد الإغلاق.")) {
                return;
            }
            
            const btn = document.getElementById("complete-session-btn");
            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = "جاري إغلاق الجلسة ورفع التقرير النهائي... ⏳";
            
            try {
                // 1. Mark session as completed
                const { error: sessionErr } = await supabaseClient
                    .from("inventory_sessions")
                    .update({ status: "completed" })
                    .eq("id", activeSessionId);
                    
                if (sessionErr) throw sessionErr;
                
                // 2. Generate and Upload Excel Report
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
                const totalQty = scannedItems.reduce((acc, item) => acc + item.counted_qty, 0);
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

});

// Initialize Camera Devices
function initCamerasAndStart() {
    Html5Qrcode.getCameras().then(async (devices) => {
        if (devices && devices.length > 0) {
            camerasList = devices;
            currentCameraId = devices[0].id;
            
            // Try to find the back camera automatically
            const backCamera = devices.find(d => 
                d.label.toLowerCase().includes("back") || 
                d.label.toLowerCase().includes("rear") || 
                d.label.toLowerCase().includes("environment") ||
                d.label.toLowerCase().includes("خلفية")
            );
            
            if (backCamera) {
                currentCameraId = backCamera.id;
            }
            
            if (devices.length > 1) {
                const switchBtn = document.getElementById("switch-camera-btn");
                if (switchBtn) switchBtn.style.display = "inline-block";
            }
            
            await startScanning(currentCameraId);
        } else {
            console.warn("No cameras found.");
            alert("تنبيه: لم نتمكن من العثور على أي كاميرا متصلة.");
        }
    }).catch(err => {
        console.error("Error listing cameras:", err);
    });
}

// Start Camera Scanning
async function startScanning(cameraId) {
    try {
        if (!html5Qrcode) {
            html5Qrcode = new Html5Qrcode("reader");
        }
        
        if (isScanning) {
            await html5Qrcode.stop();
        }
        
        const config = {
            fps: 20,
            qrbox: function(width, height) {
                return { width: width * 0.75, height: height * 0.60 };
            },
            aspectRatio: 1.2
        };
        
        await html5Qrcode.start(
            { deviceId: { exact: cameraId } },
            config,
            onScanSuccess
        );
        
        isScanning = true;
        scanLock = false;
        if (document.querySelector(".scanner-laser")) document.querySelector(".scanner-laser").style.display = "block";
        const toggleBtn = document.getElementById("toggle-camera-btn");
        if (toggleBtn) {
            toggleBtn.innerText = "🛑 إيقاف الكاميرا";
            toggleBtn.className = "btn btn-danger btn-lg flex-fill";
        }
        
    } catch (err) {
        console.error("Failed to start camera:", err);
        try {
            await html5Qrcode.start(
                { facingMode: "environment" },
                { fps: 20, qrbox: { width: 280, height: 180 }, aspectRatio: 1.2 },
                onScanSuccess
            );
            isScanning = true;
            scanLock = false;
            if (document.querySelector(".scanner-laser")) document.querySelector(".scanner-laser").style.display = "block";
            const toggleBtn = document.getElementById("toggle-camera-btn");
            if (toggleBtn) {
                toggleBtn.innerText = "🛑 إيقاف الكاميرا";
                toggleBtn.className = "btn btn-danger btn-lg flex-fill";
            }
        } catch (fallbackErr) {
            console.error("Fallback start failed:", fallbackErr);
        }
    }
}

// Stop Camera Scanning
async function stopScanning() {
    if (html5Qrcode && isScanning) {
        try {
            await html5Qrcode.stop();
            isScanning = false;
            if (document.querySelector(".scanner-laser")) document.querySelector(".scanner-laser").style.display = "none";
            const toggleBtn = document.getElementById("toggle-camera-btn");
            if (toggleBtn) {
                toggleBtn.innerText = "📷 تشغيل الكاميرا";
                toggleBtn.className = "btn btn-primary btn-lg flex-fill";
            }
        } catch (err) {
            console.error("Error stopping camera:", err);
        }
    }
}

// Scan Success Handler with Smart Debounce Lock
async function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const cleanBarcode = decodedText.trim();
    
    if (cleanBarcode === lastScannedBarcode && (now - lastScanTime) < 1500) {
        return; 
    }
    
    lastScannedBarcode = cleanBarcode;
    lastScanTime = now;
    
    await handleScan(cleanBarcode);
}

// Register Service Worker for PWA installation support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(reg => {
            console.log('Service Worker registered successfully!', reg.scope);
        }).catch(err => {
            console.warn('Service Worker registration failed:', err);
        });
    });
}
