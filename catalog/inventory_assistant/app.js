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
let html5QrcodeScanner = null;

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

// Generate Excel file rows representing multiple barcodes
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
        barcodesMap[b.item_id].push(b.barcode);
    });
    
    const rows = [];
    scannedItems.forEach(item => {
        // Find all barcodes for this item
        let barcodes = barcodesMap[item.item_id] || [item.barcode];
        if (barcodes.length === 0) barcodes = [item.barcode];
        
        // Print each barcode on a separate row as requested
        barcodes.forEach(bc => {
            rows.push({
                "رقم المنتج (Item ID)": item.item_id,
                "اسم الصنف (Item Name)": item.name,
                "الكود البديل (Alias)": item.old_item_id,
                "الباركود (Barcode)": bc,
                "الكمية الموجودة بالمعرض (Expected)": item.expected_qty,
                "الكمية الفعلية بالجرد (Counted)": item.counted_qty,
                "الفرق (Difference)": item.counted_qty - item.expected_qty
            });
        });
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
        
        // Initialize HTML5 QR Code scanner
        initScanner();
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

// Initialize Camera Barcode Scanner
function initScanner() {
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { 
        fps: 10, 
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.0,
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
        }
    }, false);
    
    async function onScanSuccess(decodedText, decodedResult) {
        // Pause scanning to process the item and play feedback sound
        html5QrcodeScanner.clear();
        await handleScan(decodedText);
        
        // Restart scanner after 1.5 seconds delay
        setTimeout(() => {
            if (document.getElementById("reader")) {
                initScanner();
            }
        }, 1500);
    }
    
    html5QrcodeScanner.render(onScanSuccess, (err) => {
        // Silence errors to avoid flood in console during active search
    });
}
