// Web Worker for offloading 28MB employee_products_data.json parsing
// Runs in background thread, zero impact on main UI thread / 60fps animations.

let productsData = null;
let isFetching = false;
let pendingRequests = [];

self.onmessage = async function(e) {
    const msg = e.data || {};
    const action = msg.action;

    if (action === 'getEmployeeProducts') {
        const { empId, period, requestId, jsonUrl } = msg;

        if (productsData) {
            sendEmployeeData(empId, period, requestId);
            return;
        }

        pendingRequests.push({ empId, period, requestId });

        if (!isFetching) {
            isFetching = true;
            try {
                const targetUrl = jsonUrl || '../data/products/employee_products_data.json';
                const response = await fetch(targetUrl);
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                const parsed = await response.json();
                productsData = parsed.periods || {};
                
                // Flush all pending requests
                for (const req of pendingRequests) {
                    sendEmployeeData(req.empId, req.period, req.requestId);
                }
                pendingRequests = [];
                
                self.postMessage({ action: 'allProductsLoaded' });
            } catch (err) {
                for (const req of pendingRequests) {
                    self.postMessage({
                        action: 'employeeProductsError',
                        empId: req.empId,
                        requestId: req.requestId,
                        error: err.message
                    });
                }
                pendingRequests = [];
            } finally {
                isFetching = false;
            }
        }
    }
};

function sendEmployeeData(empId, period, requestId) {
    if (!productsData) return;

    const pKey = period || 'mtd';
    const periodData = productsData[pKey] || productsData['mtd'] || {};

    const cleanId = String(empId).replace(/unknown/gi, '').replace(/unkown/gi, '').trim();
    const paddedId = cleanId.padStart(4, '0');

    const empData = periodData[empId] || periodData[cleanId] || periodData[paddedId] || null;

    self.postMessage({
        action: 'employeeProductsLoaded',
        empId: empId,
        requestId: requestId,
        data: empData
    });
}
