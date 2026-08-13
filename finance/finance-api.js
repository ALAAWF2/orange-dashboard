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
        vendorInvoices: params => request('/api/finance/vendor-invoices', params),
        leases: params => request('/api/finance/leases', params)
    });
})();
