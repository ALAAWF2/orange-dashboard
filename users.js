const USERS = {
    "CS": { "pin": "7531", "role": "CRM", "hide_visitors": true },
    "Sales Manager": { "pin": "6587", "role": "Admin", "hide_visitors": false, "email": "m.hamadon@orangebedbath.com", "password": "Mh@852" },
    "المالية": { "pin": "2026", "role": "Finance", "hide_visitors": false, "email": "supervisor.reader@orangebedbath.com", "password": "OrangeReader2026!" },
    "المنطقة الشمالية": { "pin": "6342", "role": "Manager", "hide_visitors": false, "email": "bakr@orangebedbath.com", "password": "ZSgy" },
    "المنطقة الغربية": { "pin": "1478", "role": "Manager", "hide_visitors": false, "email": "mehyar.s@orangebedbath.com", "password": "Smdc" },
    "اماني عسيري": { "pin": "3698", "role": "Manager", "hide_visitors": false, "email": "amani.a@orangebedbath.com", "password": "qiBK" },
    "جهاد ايوبي": { "pin": "2587", "role": "Manager", "hide_visitors": false, "email": "jihad@orangebedbath.com", "password": "2yT7" },
    "رضوان عطيوي": { "pin": "7643", "role": "Manager", "hide_visitors": false, "email": "radwan@orangebedbath.com", "password": "TUdJ" },
    "عبدالله السرداح": { "pin": "4618", "role": "Manager", "hide_visitors": false, "email": "abd.serdah@orangebedbath.com", "password": "RvvL" },
    "عبيدة السباعي": { "pin": "1647", "role": "Manager", "hide_visitors": false, "email": "obieda.sebaee@orangebedbath.com", "password": "Pvoo" },
    "علاء": { "pin": "9630", "role": "Admin", "hide_visitors": false, "email": "alaa.wafae@orangebedbath.com", "password": "Am@w0531" },
    "محمدكلو": { "pin": "4891", "role": "Manager", "hide_visitors": false, "email": "m.kello@orangebedbath.com", "password": "c7Yw" },
    "الغربية 2": { "pin": "5123", "role": "Manager", "hide_visitors": false, "email": "supervisor.reader@orangebedbath.com", "password": "OrangeReader2026!" }
};

function getUserDisplayName(username) {
    const internalName = typeof username === 'string' ? username.trim() : '';
    const user = internalName && USERS[internalName] ? USERS[internalName] : null;
    const displayName = user && typeof user.displayName === 'string'
        ? user.displayName.trim()
        : '';
    return displayName || internalName;
}

function getCurrentUserDisplayName(user) {
    const sessionUser = user || JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!sessionUser) return '';
    const sessionDisplayName = typeof sessionUser.displayName === 'string'
        ? sessionUser.displayName.trim()
        : '';
    const userRecord = sessionUser.name && USERS[sessionUser.name] ? USERS[sessionUser.name] : null;
    const configuredDisplayName = userRecord && typeof userRecord.displayName === 'string'
        ? userRecord.displayName.trim()
        : '';
    return configuredDisplayName || sessionDisplayName || sessionUser.name || '';
}

function replaceUserDisplayNames(value) {
    let result = String(value ?? '');
    Object.keys(USERS)
        .sort((a, b) => b.length - a.length)
        .forEach(username => {
            const displayName = getUserDisplayName(username);
            if (displayName && displayName !== username && result.includes(username)) {
                result = result.split(username).join(displayName);
            }
        });
    return result;
}

function refreshCurrentUserDisplayName() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser || !currentUser.name) return;
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
        const parentTag = node.parentElement ? node.parentElement.tagName : '';
        if (ignoredTags.has(parentTag)) return;
        const updatedText = replaceUserDisplayNames(node.nodeValue);
        if (updatedText !== node.nodeValue) node.nodeValue = updatedText;
    };

    if (root.nodeType === Node.TEXT_NODE) {
        processTextNode(root);
        return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
        processTextNode(textNode);
        textNode = walker.nextNode();
    }
}

function initializeUserDisplayNames() {
    if (window.__orangeDisplayNamesInitialized) return;
    window.__orangeDisplayNamesInitialized = true;
    refreshCurrentUserDisplayName();
    applyUserDisplayNames(document.body);

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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUserDisplayNames, { once: true });
} else {
    initializeUserDisplayNames();
}
