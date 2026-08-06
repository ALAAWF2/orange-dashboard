const USERS = {};

const USERS_READY = fetch('/api/auth/users', {
    credentials: 'same-origin',
    cache: 'no-store'
})
    .then(response => {
        if (!response.ok) throw new Error('Unable to load dashboard users');
        return response.json();
    })
    .then(users => {
        Object.assign(USERS, users || {});
        initializeUserDisplayNames();
        return USERS;
    })
    .catch(error => {
        console.error('Dashboard users could not be loaded:', error.message);
        return USERS;
    });

function getUserDisplayName(username) {
    const user = USERS[String(username || '').trim()];
    return user?.displayName || String(username || '').trim();
}

function getCurrentDashboardUser() {
    try {
        return JSON.parse(localStorage.getItem('currentUser') || 'null');
    } catch (_error) {
        return null;
    }
}

async function dashboardAuthFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers: {
            ...(options.headers || {})
        }
    });
    if (response.status === 401) {
        localStorage.removeItem('currentUser');
    }
    return response;
}

async function ensureDashboardSupabaseSession(supabaseClient) {
    if (!supabaseClient?.auth) {
        throw new Error('Supabase client is unavailable');
    }
    const response = await dashboardAuthFetch('/api/auth/supabase-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
        throw new Error('Unable to establish the checklist session');
    }
    const session = await response.json();
    if (!session.access_token || !session.refresh_token) {
        throw new Error('The checklist session response is incomplete');
    }
    const { data, error } = await supabaseClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
    });
    if (error) throw error;
    return data.session;
}

function applyUserDisplayNames(root = document) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('[data-username]').forEach(element => {
        const username = element.getAttribute('data-username');
        if (username) element.textContent = getUserDisplayName(username);
    });
}

function initializeUserDisplayNames() {
    if (!document.body) return;
    applyUserDisplayNames(document);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUserDisplayNames, { once: true });
} else {
    initializeUserDisplayNames();
}
