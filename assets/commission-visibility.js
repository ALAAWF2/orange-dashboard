(() => {
    'use strict';

    const root = document.documentElement;
    const DEFAULT_STATE = Object.freeze({ visible: false });
    let state = { ...DEFAULT_STATE };
    let pendingLoad = null;
    let loadedBase = '';

    root.dataset.expectedCommissionVisible = 'false';

    const visibilityStyle = document.createElement('style');
    visibilityStyle.textContent = `
        html[data-expected-commission-visible="false"] [data-expected-commission] {
            display: none !important;
        }
    `;
    document.head.appendChild(visibilityStyle);

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

    function applyState(rawState) {
        state = { visible: rawState?.visible === true };
        root.dataset.expectedCommissionVisible = state.visible ? 'true' : 'false';
        document.querySelectorAll('option[data-expected-commission]').forEach(option => {
            option.disabled = !state.visible;
            option.hidden = !state.visible;
        });
        window.dispatchEvent(new CustomEvent('expectedcommissionvisibilitychange', {
            detail: { ...state }
        }));
        return { ...state };
    }

    async function load(explicitBase, options = {}) {
        const apiBase = normalizeBase(explicitBase);
        if (pendingLoad && loadedBase === apiBase && !options.force) return pendingLoad;

        loadedBase = apiBase;
        pendingLoad = fetch(`${apiBase}/api/settings/commission-visibility`, {
            headers: { 'ngrok-skip-browser-warning': 'true' },
            cache: 'no-store'
        })
            .then(response => {
                if (!response.ok) throw new Error(`Commission visibility request failed (${response.status}).`);
                return response.json();
            })
            .then(applyState)
            .catch(error => {
                console.warn('Commission visibility unavailable; keeping commissions hidden.', error);
                return applyState(DEFAULT_STATE);
            });

        return pendingLoad;
    }

    window.ExpectedCommissionVisibility = {
        load,
        getState: () => ({ ...state })
    };
})();
