/**
 * app.js - Inventory Assistant (مساعد الجرد)
 * Responsive mobile-friendly client-side logic with Supabase & html5-qrcode.
 */

// Supabase Configuration
const SUPABASE_URL = "https://sufeqdvooqkolghflhta.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1ZmVxZHZvb3Frb2xnaGZsaHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTY5OTIsImV4cCI6MjA4ODk5Mjk5Mn0.ody4a53OtJqzLIoTvJ3S6Igdue-Sy4HsUQ_Cz7MUSjY";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State Variables
let stockByOutlet = {};
let currentOutlet = "";
let scannedItems = []; // Array of { item_id, name, old_item_id, price, barcode, expected_qty, counted_qty }
let html5Qrcode = null;
let currentCameraId = null;
let camerasList = [];
let isScanning = false;
let scanLock = false;
let lastScannedBarcode = "";
let lastScanTime = 0;

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
    
    if (scannedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">لم يتم جرد أي مواد بعد. ابدأ بمسح الباركود!</td></tr>`;
        totalQtyEl.innerText = "0";
        return;
    }
    
    let totalQty = 0;
    let html = "";
    
    scannedItems.forEach((item, index) => {
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
        
        html += `
            <tr class="scanned-row" id="row-${item.item_id}">
                <td><strong>${item.item_id}</strong></td>
                <td>${item.name}</td>
                <td><code class="text-dark">${item.barcode}</code></td>
                <td class="text-center">${item.expected_qty}</td>
                <td class="text-center" style="width: 120px;">
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

// Save current session state to localStorage
function saveSession() {
    if (currentOutlet) {
        localStorage.setItem(`inventory_${currentOutlet}`, JSON.stringify(scannedItems));
    }
}

// Load session state from localStorage
function loadSession() {
    if (currentOutlet) {
        const stored = localStorage.getItem(`inventory_${currentOutlet}`);
        if (stored) {
            try {
                scannedItems = JSON.parse(stored);
            } catch (e) {
                console.error("Error loading session:", e);
                scannedItems = [];
            }
        } else {
            scannedItems = [];
        }
    }
}

// Adjust Item Qty via Buttons (+ / -)
window.adjustQty = function(itemId, change) {
    const item = scannedItems.find(i => i.item_id === itemId);
    if (item) {
        item.counted_qty = Math.max(1, item.counted_qty + change);
        saveSession();
        renderTable();
    }
};

// Update Item Qty via Input Change
window.updateItemQty = function(itemId, val) {
    const parsed = parseInt(val, 10);
    const item = scannedItems.find(i => i.item_id === itemId);
    if (item && !isNaN(parsed) && parsed >= 1) {
        item.counted_qty = parsed;
        saveSession();
        renderTable();
    }
};

// Remove Item from session
window.removeItem = function(itemId) {
    if (confirm("هل أنت متأكد من حذف هذا الصنف من الجرد؟")) {
        scannedItems = scannedItems.filter(i => i.item_id !== itemId);
        saveSession();
        renderTable();
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
    if (!cleanBarcode) return;
    
    // Check if already in scanned list to prevent unnecessary queries
    const existingIndex = scannedItems.findIndex(item => item.barcode === cleanBarcode || item.item_id === cleanBarcode);
    
    if (existingIndex !== -1) {
        // Just increment quantity and play sound
        scannedItems[existingIndex].counted_qty += 1;
        playBeep('success');
        showFeedback(`تم تحديث كمية الصنف: ${scannedItems[existingIndex].name} لـ (${scannedItems[existingIndex].counted_qty})`);
        triggerFlashFeedback(`${scannedItems[existingIndex].name} (${scannedItems[existingIndex].counted_qty})`);
        saveSession();
        renderTable();
        
        // Highlight row
        const row = document.getElementById(`row-${scannedItems[existingIndex].item_id}`);
        if (row) {
            row.classList.add("just-added");
            setTimeout(() => row.classList.remove("just-added"), 1000);
        }
        return;
    }
    
    // Lookup item in database
    const dbItem = await lookupItem(cleanBarcode);
    
    if (dbItem) {
        // Find expected quantity from local cached stock
        const expected = (stockByOutlet[currentOutlet] && stockByOutlet[currentOutlet][dbItem.item_id]) || 0;
        
        const newItem = {
            item_id: dbItem.item_id,
            name: dbItem.barcode_description || dbItem.search_name || "صنف بدون اسم",
            old_item_id: dbItem.old_item_id || "",
            price: parseFloat(dbItem.price) || 0.0,
            barcode: dbItem.barcode || cleanBarcode,
            expected_qty: expected,
            counted_qty: 1
        };
        
        scannedItems.push(newItem);
        playBeep('success');
        showFeedback(`تمت إضافة الصنف: ${newItem.name}`);
        triggerFlashFeedback(newItem.name);
        saveSession();
        renderTable();
        
        // Highlight row
        setTimeout(() => {
            const row = document.getElementById(`row-${newItem.item_id}`);
            if (row) {
                row.classList.add("just-added");
                setTimeout(() => row.classList.remove("just-added"), 1000);
            }
        }, 100);
    } else {
        // Not found, play error sound
        playBeep('error');
        showFeedback(`تنبيه: الباركود/الصنف ${cleanBarcode} غير مسجل بالنظام!`, true);
        triggerFlashFeedback("باركود غير مسجل ⚠️", true);
        
        // Add as an unknown item so they can still count it
        const newItem = {
            item_id: cleanBarcode,
            name: "صنف غير معرف بالنظام ⚠️",
            old_item_id: "",
            price: 0.0,
            barcode: cleanBarcode,
            expected_qty: 0,
            counted_qty: 1
        };
        
        scannedItems.push(newItem);
        saveSession();
        renderTable();
    }
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
    
    // 1. Fetch expected showroom stock mapping
    try {
        const response = await fetch("data/stock_by_outlet.json");
        if (response.ok) {
            stockByOutlet = await response.json();
            
            // Populate select dropdown with showroom/outlet names
            const select = document.getElementById("showroom-select");
            select.innerHTML = '<option value="" disabled selected>-- اختر معرض الجرد --</option>';
            
            Object.keys(stockByOutlet).sort().forEach(outlet => {
                const option = document.createElement("option");
                option.value = outlet;
                option.textContent = outlet;
                select.appendChild(option);
            });
            
            // Enable start button
            document.getElementById("start-inventory-btn").disabled = false;
        } else {
            console.error("Failed to load showroom stock.");
            alert("خطأ: لم يتم العثور على ملف مخزون المعارض. يرجى تشغيل سكربت المزامنة أولاً.");
        }
    } catch (e) {
        console.error("Error fetching stock map:", e);
        alert("خطأ أثناء تحميل بيانات المخزون.");
    }
    
    // 2. Start Inventory click event
    document.getElementById("start-inventory-btn").addEventListener("click", () => {
        const select = document.getElementById("showroom-select");
        currentOutlet = select.value;
        
        if (!currentOutlet) {
            alert("يرجى اختيار المعرض أولاً!");
            return;
        }
        
        // Hide selection card, show workspace
        document.getElementById("showroom-selection-card").style.display = "none";
        document.getElementById("inventory-workspace").style.display = "block";
        document.getElementById("active-outlet-name").innerText = currentOutlet;
        
        // Load stored items
        loadSession();
        renderTable();
        
        // Auto-initialize camera search
        initCamerasAndStart();
    });
    
    // Toggle Camera click event
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

    // Switch Camera click event
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
    
    // 3. Manual entry form submission
    document.getElementById("manual-barcode-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("manual-barcode-input");
        const val = input.value.trim();
        if (val) {
            input.value = "";
            input.focus();
            await handleScan(val);
        }
    });
    
    // 4. Clear inventory session
    document.getElementById("clear-current-inventory").addEventListener("click", () => {
        if (confirm("هل أنت متأكد من مسح جميع الأصناف المجرودة الحالية؟ لا يمكن التراجع عن هذا الإجراء.")) {
            scannedItems = [];
            saveSession();
            renderTable();
        }
    });
    
    // 5. Download Excel locally
    document.getElementById("download-excel-btn").addEventListener("click", async () => {
        if (scannedItems.length === 0) {
            alert("لا توجد أصناف مجرودة لتحميلها!");
            return;
        }
        
        const rows = await generateExcelRows();
        const { workbook } = await getExcelBlob(rows);
        
        const dateStr = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `جرد_${currentOutlet}_${dateStr}.xlsx`);
    });
    
    // 6. Finish and Share on WhatsApp
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
            
            // Upload to Supabase Storage bucket 'inventory-reports'
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
            
            // Generate public URL
            const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/inventory-reports/${fileName}`;
            
            // Construct text message
            const totalQty = scannedItems.reduce((acc, item) => acc + item.counted_qty, 0);
            const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
            
            const textMsg = `📋 *محضر جرد معرض أورانج*\n` +
                            `📍 *المعرض:* ${currentOutlet}\n` +
                            `📅 *التاريخ:* ${today}\n` +
                            `📦 *عدد الأصناف المجرودة:* ${scannedItems.length}\n` +
                            `🔢 *إجمالي القطع الممسوحة:* ${totalQty}\n\n` +
                            `🔗 *رابط تحميل تقرير الجرد (Excel):*\n${publicUrl}`;
            
            // Open WhatsApp Web/App
            const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(textMsg)}`;
            window.open(waUrl, "_blank");
            
            // Download backup file locally as well
            XLSX.writeFile(workbook, `جرد_${currentOutlet}_${dateStr}.xlsx`);
            
        } catch (e) {
            console.error("Error sharing report:", e);
            alert("حدث خطأ أثناء رفع التقرير. سيتم تحميل التقرير محلياً على جهازك بدلاً من ذلك.");
            
            // Fallback: download locally
            const rows = await generateExcelRows();
            const { workbook } = await getExcelBlob(rows);
            XLSX.writeFile(workbook, `جرد_${currentOutlet}.xlsx`);
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    });

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
            
            // Show switch camera button if there are multiple cameras
            if (devices.length > 1) {
                document.getElementById("switch-camera-btn").style.display = "inline-block";
            }
            
            // Auto start the scanner
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
        
        // Stop current scanning session if running
        if (isScanning) {
            await html5Qrcode.stop();
        }
        
        const config = {
            fps: 20, // Faster scan rate for smoother performance
            qrbox: function(width, height) {
                // Focus area: 75% width, 60% height
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
        document.querySelector(".scanner-laser").style.display = "block";
        document.getElementById("toggle-camera-btn").innerText = "🛑 إيقاف الكاميرا";
        document.getElementById("toggle-camera-btn").className = "btn btn-danger btn-lg flex-fill";
        
    } catch (err) {
        console.error("Failed to start camera:", err);
        // Fallback: Try launching using environment camera config
        try {
            await html5Qrcode.start(
                { facingMode: "environment" },
                { fps: 20, qrbox: { width: 280, height: 180 }, aspectRatio: 1.2 },
                onScanSuccess
            );
            isScanning = true;
            scanLock = false;
            document.querySelector(".scanner-laser").style.display = "block";
            document.getElementById("toggle-camera-btn").innerText = "🛑 إيقاف الكاميرا";
            document.getElementById("toggle-camera-btn").className = "btn btn-danger btn-lg flex-fill";
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
            document.querySelector(".scanner-laser").style.display = "none";
            document.getElementById("toggle-camera-btn").innerText = "📷 تشغيل الكاميرا";
            document.getElementById("toggle-camera-btn").className = "btn btn-primary btn-lg flex-fill";
        } catch (err) {
            console.error("Error stopping camera:", err);
        }
    }
}

// Scan Success Handler with Smart Debounce Lock
async function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const cleanBarcode = decodedText.trim();
    
    // If it's the SAME barcode scanned within 1.5 seconds, ignore it to prevent double scans
    if (cleanBarcode === lastScannedBarcode && (now - lastScanTime) < 1500) {
        return; 
    }
    
    // Update scan state immediately
    lastScannedBarcode = cleanBarcode;
    lastScanTime = now;
    
    // Process the scanned item
    await handleScan(cleanBarcode);
}
