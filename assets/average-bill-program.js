(() => {
    'use strict';

    const DEFAULT_STATE = Object.freeze({
        enabled: false,
        disabled_at: '2026-08-02T00:00:00+03:00',
        enabled_at: null,
        active_periods: [{ start: '2026-07-11', end: '2026-08-01' }]
    });

    const root = document.documentElement;
    root.dataset.averageBillEnabled = 'false';

    const visibilityStyle = document.createElement('style');
    visibilityStyle.textContent = `
        html[data-average-bill-enabled="false"] [data-average-bill-prize] {
            display: none !important;
        }
        html[data-average-bill-enabled="true"] [data-average-bill-stopped] {
            display: none !important;
        }
    `;
    document.head.appendChild(visibilityStyle);

    let state = { ...DEFAULT_STATE, active_periods: [...DEFAULT_STATE.active_periods] };
    let pendingLoad = null;
    let loadedBase = '';

    function normalizeBase(explicitBase) {
        if (explicitBase) return String(explicitBase).replace(/\/$/, '');
        const storedBase = sessionStorage.getItem('serverIp');
        if (storedBase) return storedBase.replace(/\/$/, '');
        const origin = window.location.origin;
        if (!origin || origin.startsWith('file://') || origin.includes('github.io')) {
            return 'http://localhost:5000';
        }
        return origin.replace(/\/$/, '');
    }

    function normalizeState(rawState) {
        const periods = Array.isArray(rawState?.active_periods)
            ? rawState.active_periods
                .filter(period => period && period.start)
                .map(period => ({
                    start: String(period.start).slice(0, 10),
                    end: period.end ? String(period.end).slice(0, 10) : null
                }))
            : [...DEFAULT_STATE.active_periods];

        return {
            enabled: rawState?.enabled === true,
            disabled_at: rawState?.disabled_at || DEFAULT_STATE.disabled_at,
            enabled_at: rawState?.enabled_at || null,
            active_periods: periods.length ? periods : [...DEFAULT_STATE.active_periods]
        };
    }

    function formatRiyadhTimestamp(value) {
        if (!value) return 'غير مسجل';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return String(value);
        return new Intl.DateTimeFormat('ar-SA', {
            timeZone: 'Asia/Riyadh',
            calendar: 'gregory',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(parsed);
    }

    function applyState(nextState) {
        state = normalizeState(nextState);
        root.dataset.averageBillEnabled = state.enabled ? 'true' : 'false';
        document.querySelectorAll('[data-average-bill-disabled-date]').forEach(element => {
            element.textContent = formatRiyadhTimestamp(state.disabled_at);
        });
        window.dispatchEvent(new CustomEvent('averagebillprogramchange', { detail: state }));
        return state;
    }

    async function load(explicitBase, options = {}) {
        const apiBase = normalizeBase(explicitBase);
        if (pendingLoad && loadedBase === apiBase && !options.force) return pendingLoad;

        loadedBase = apiBase;
        pendingLoad = fetch(`${apiBase}/api/average-bill/program-status`, {
            headers: { 'ngrok-skip-browser-warning': 'true' },
            cache: 'no-store'
        })
            .then(response => {
                if (!response.ok) throw new Error(`Program status request failed (${response.status}).`);
                return response.json();
            })
            .then(applyState)
            .catch(error => {
                console.warn('Average bill program status unavailable; keeping the safe disabled state.', error);
                return applyState(DEFAULT_STATE);
            });

        return pendingLoad;
    }

    function isDateActive(value) {
        const dateValue = String(value || '').slice(0, 10);
        if (!dateValue) return false;
        return state.active_periods.some(period => (
            dateValue >= period.start && (!period.end || dateValue <= period.end)
        ));
    }

    function filterIncentivesPayload(payload) {
        if (!payload?.incentives) return payload;
        const filteredIncentives = {};

        Object.entries(payload.incentives).forEach(([storeCode, months]) => {
            const filteredMonths = {};
            Object.entries(months || {}).forEach(([month, records]) => {
                filteredMonths[month] = Array.isArray(records)
                    ? records.filter(record => isDateActive(record?.date))
                    : records;
            });
            filteredIncentives[storeCode] = filteredMonths;
        });

        return { ...payload, incentives: filteredIncentives };
    }

    window.AverageBillProgram = {
        load,
        isDateActive,
        filterIncentivesPayload,
        formatRiyadhTimestamp,
        getState: () => ({ ...state, active_periods: state.active_periods.map(period => ({ ...period })) })
    };
})();
