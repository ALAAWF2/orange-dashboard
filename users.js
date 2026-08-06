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

function getCurrentUserDisplayName(user) {
    const sessionUser = user || getCurrentDashboardUser();
    if (!sessionUser) return '';
    const sessionDisplayName = typeof sessionUser.displayName === 'string'
        ? sessionUser.displayName.trim()
        : '';
    const configuredDisplayName = sessionUser.name
        ? getUserDisplayName(sessionUser.name)
        : '';
    return configuredDisplayName || sessionDisplayName || sessionUser.name || '';
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

function logoutDashboardSession(redirectUrl = 'login.html') {
    fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true
    }).catch(() => {});
    localStorage.removeItem('currentUser');
    localStorage.removeItem('auth');
    sessionStorage.removeItem('auth');
    window.location.href = redirectUrl;
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

function replaceUserDisplayNames(value) {
    let result = String(value ?? '');
    const replacements = Object.keys(USERS)
        .map(username => [username, getUserDisplayName(username)])
        .filter(([username, displayName]) => displayName && displayName !== username)
        .sort(([left], [right]) => right.length - left.length);

    const protectedDisplayNames = [];
    [...new Set(replacements.map(([, displayName]) => displayName))]
        .sort((left, right) => right.length - left.length)
        .forEach((displayName, index) => {
            if (!result.includes(displayName)) return;
            const token = `\uE000orange-display-${index}\uE001`;
            result = result.split(displayName).join(token);
            protectedDisplayNames.push([token, displayName]);
        });

    replacements.forEach(([username, displayName]) => {
        result = result.split(username).join(displayName);
    });
    protectedDisplayNames.forEach(([token, displayName]) => {
        result = result.split(token).join(displayName);
    });
    return result;
}

function refreshCurrentUserDisplayName() {
    const currentUser = getCurrentDashboardUser();
    if (!currentUser?.name) return;
    const displayName = getCurrentUserDisplayName(currentUser);
    if (displayName && currentUser.displayName !== displayName) {
        currentUser.displayName = displayName;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
    }
}

function applyUserDisplayNames(root = document.body) {
    if (!root) return;
    const ignoredTags = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);
    const processTextNode = node => {
        const parentTag = node.parentElement?.tagName || '';
        if (ignoredTags.has(parentTag)) return;
        const updatedText = replaceUserDisplayNames(node.nodeValue);
        if (updatedText !== node.nodeValue) node.nodeValue = updatedText;
    };

    if (root.nodeType === Node.TEXT_NODE) {
        processTextNode(root);
    } else {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
            processTextNode(textNode);
            textNode = walker.nextNode();
        }
    }

    const queryRoot = root.querySelectorAll ? root : document;
    queryRoot.querySelectorAll('[data-username]').forEach(element => {
        const username = element.getAttribute('data-username');
        if (username) element.textContent = getUserDisplayName(username);
    });
}

function initializeUserDisplayNames() {
    if (!document.body) return;
    refreshCurrentUserDisplayName();
    applyUserDisplayNames(document.body);
    if (window.__orangeDisplayNamesObserver) return;
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'characterData') {
                applyUserDisplayNames(mutation.target);
                return;
            }
            mutation.addedNodes.forEach(node => applyUserDisplayNames(node));
        });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__orangeDisplayNamesObserver = observer;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUserDisplayNames, { once: true });
} else {
    initializeUserDisplayNames();
}
