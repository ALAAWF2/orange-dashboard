const USERS = {
    "CS": {
        "displayName": "CS",
        "hide_visitors": true,
        "pin": "7531",
        "role": "CRM"
    },
    "Sales Manager": {
        "displayName": "Sales Manager",
        "email": "m.hamadon@orangebedbath.com",
        "hide_visitors": false,
        "password": "Mh@852",
        "pin": "6587",
        "role": "Admin"
    },
    "الغربية 2": {
        "displayName": "المنطقة الغربية 2",
        "email": "supervisor.reader@orangebedbath.com",
        "hide_visitors": false,
        "password": "OrangeReader2026!",
        "pin": "5123",
        "role": "Manager"
    },
    "المالية": {
        "displayName": "المالية",
        "email": "supervisor.reader@orangebedbath.com",
        "hide_visitors": false,
        "password": "OrangeReader2026!",
        "pin": "2026",
        "role": "Finance"
    },
    "المنطقة الشمالية": {
        "displayName": "المنطقة الشمالية",
        "email": "bakr@orangebedbath.com",
        "hide_visitors": false,
        "password": "ZSgy",
        "pin": "6342",
        "role": "Manager"
    },
    "المنطقة الغربية": {
        "displayName": "المنطقة الغربية",
        "email": "mehyar.s@orangebedbath.com",
        "hide_visitors": false,
        "password": "Smdc",
        "pin": "1478",
        "role": "Manager"
    },
    "اماني عسيري": {
        "displayName": "المنطقة الجنوبية",
        "email": "amani.a@orangebedbath.com",
        "hide_visitors": false,
        "password": "qiBK",
        "pin": "3698",
        "role": "Manager"
    },
    "جهاد ايوبي": {
        "displayName": "المنطقة الشرقية",
        "email": "jihad@orangebedbath.com",
        "hide_visitors": false,
        "password": "2yT7",
        "pin": "2587",
        "role": "Manager"
    },
    "رضوان عطيوي": {
        "displayName": "منطقة مكة المكرمة",
        "email": "radwan@orangebedbath.com",
        "hide_visitors": false,
        "password": "TUdJ",
        "pin": "7643",
        "role": "Manager"
    },
    "عبدالله السرداح": {
        "displayName": "المنطقة الوسطى 2",
        "email": "abd.serdah@orangebedbath.com",
        "hide_visitors": false,
        "password": "RvvL",
        "pin": "4618",
        "role": "Manager"
    },
    "عبيدة السباعي": {
        "displayName": "المنطقة الغربية 3",
        "email": "obieda.sebaee@orangebedbath.com",
        "hide_visitors": false,
        "password": "Pvoo",
        "pin": "1647",
        "role": "Manager"
    },
    "علاء": {
        "displayName": "علاء",
        "email": "alaa.wafae@orangebedbath.com",
        "hide_visitors": false,
        "password": "Am@w0531",
        "pin": "9630",
        "role": "Admin"
    },
    "محمدكلو": {
        "displayName": "المنطقة الوسطى",
        "email": "m.kello@orangebedbath.com",
        "hide_visitors": false,
        "password": "c7Yw",
        "pin": "4891",
        "role": "Manager"
    }
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
    const replacements = Object.keys(USERS)
        .map(username => [username, getUserDisplayName(username)])
        .filter(([username, displayName]) => displayName && displayName !== username)
        .sort(([a], [b]) => b.length - a.length);

    const protectedDisplayNames = [];
    [...new Set(replacements.map(([, displayName]) => displayName))]
        .sort((a, b) => b.length - a.length)
        .forEach((displayName, index) => {
            if (!result.includes(displayName)) return;
            const token = `\uE000orange-display-${index}\uE001`;
            result = result.split(displayName).join(token);
            protectedDisplayNames.push([token, displayName]);
        });

    replacements.forEach(([username, displayName]) => {
        if (result.includes(username)) {
            result = result.split(username).join(displayName);
        }
    });

    protectedDisplayNames.forEach(([token, displayName]) => {
        result = result.split(token).join(displayName);
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
