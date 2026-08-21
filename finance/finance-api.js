(() => {
    'use strict';

    function apiBase() {
        const stored = sessionStorage.getItem('serverIp');
        if (stored) return stored.replace(/\/$/, '');
        const origin = window.location.origin;
        if (!origin || origin.startsWith('file://') || origin.includes('github.io')) {
            return 'http://localhost:5000';
        }
        return origin.replace(/\/$/, '');
    }

    function queryString(params) {
        const query = new URLSearchParams();
        Object.entries(params || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                query.set(key, String(value));
            }
        });
        const encoded = query.toString();
        return encoded ? `?${encoded}` : '';
    }

    async function request(path, params = {}) {
        const url = `${apiBase()}${path}${queryString(params)}`;
        const fetcher = typeof fetchWithSessionAuth === 'function'
            ? fetchWithSessionAuth
            : fetch;
        const response = await fetcher(url, {
            headers: { 'ngrok-skip-browser-warning': 'true' },
            credentials: 'include',
            cache: 'no-store'
        });
        let payload = null;
        try {
            payload = await response.json();
        } catch (_error) {
            payload = null;
        }
        if (!response.ok) {
            const error = new Error(payload?.message || 'تعذر تحميل بيانات المنصة المالية.');
            error.status = response.status;
            error.code = payload?.error || 'finance_request_failed';
            throw error;
        }
        return payload;
    }

    window.FinancePlatformApi = Object.freeze({
        overview: params => request('/api/finance/overview', params),
        showrooms: params => request('/api/finance/showrooms', params),
        showroomDetail: (number, params) => request(
            `/api/finance/showrooms/${encodeURIComponent(number)}`,
            params
        ),
        vendorInvoices: params => request('/api/finance/vendor-invoices', params),
        vendorInvoiceLines: (sourceKey, params) => request(
            `/api/finance/vendor-invoices/${encodeURIComponent(sourceKey)}/lines`,
            params
        ),
        vendorPayments: (vendorAccount, params) => request(
            `/api/finance/vendors/${encodeURIComponent(vendorAccount)}/payments`,
            params
        ),
        fixedAssets: params => request('/api/finance/fixed-assets', params),
        employeeAdvances: params => request('/api/finance/employee-advances', params),
        employeeAdvanceDetails: (workerId, params) => request(
            `/api/finance/employee-advances/${encodeURIComponent(workerId)}`,
            params
        ),
        purchaseOrders: params => request('/api/finance/purchase-orders', params),
        purchaseOrderLines: (poNumber, params) => request(
            `/api/finance/purchase-orders/${encodeURIComponent(poNumber)}/lines`,
            params
        ),
        inventoryValuation: params => request('/api/finance/inventory-valuation', params),
        cashAndGateways: params => request('/api/finance/cash-and-gateways', params),
        vatHub: params => request('/api/finance/vat-hub', params),
        leases: params => request('/api/finance/leases', params),
        leaseSchedule: (leaseId, params) => request(
            `/api/finance/leases/${encodeURIComponent(leaseId)}/schedule`,
            params
        ),
        leaseInsights: params => request('/api/finance/lease-insights', params),
        apAging: params => request('/api/finance/ap-aging', params),
        vendorAnalytics: params => request('/api/finance/vendor-analytics', params),
        additionalAnalytics: params => request('/api/finance/additional-analytics', params),
        trialBalanceTrend: params => request('/api/finance/trial-balance-trend', params),
        showroomPnl: (number, params) => request(
            `/api/finance/showrooms/${encodeURIComponent(number)}/pnl`,
            params
        ),
        maintenanceAnalytics: params => request('/api/finance/maintenance-analytics', params),
        cashDropsReconciliation: params => request('/api/finance/reconciliation/cash-drops', params),
        gatewaysReconciliation: params => request('/api/finance/reconciliation/gateways', params),
        reconciliationSummary: params => request('/api/finance/reconciliation/summary', params)
    });
})();
