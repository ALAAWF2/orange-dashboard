/**
 * sw.js - Service Worker for Inventory Assistant (مساعد الجرد)
 * Implements robust offline caching (Network First, Cache Fallback) restricted to app assets and CDNs.
 */

const CACHE_NAME = "inventory-assistant-v2";
const ASSETS = [
    "./",
    "./index.html",
    "./app.js",
    "./manifest.json",
    "./data/stock_by_outlet.json",
    "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.rtl.min.css",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0",
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap"
];

// Domains we are allowed to intercept and cache
const ALLOWED_DOMAINS = [
    self.location.origin,
    "cdn.jsdelivr.net",
    "fonts.googleapis.com",
    "fonts.gstatic.com"
];

self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    // Only intercept GET requests
    if (event.request.method !== "GET") return;

    // Only intercept HTTP/HTTPS schemes
    if (!event.request.url.startsWith("http")) return;

    // Exclude Supabase calls completely
    if (event.request.url.includes("supabase.co")) return;

    // Check if the domain is in our allowed list (app files and CDN libraries)
    const isAllowed = ALLOWED_DOMAINS.some(domain => event.request.url.includes(domain));
    if (!isAllowed) return; // Let the browser handle other domains natively (prevents Cloudflare/analytics errors)

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache).catch((err) => {
                            console.warn("ServiceWorker cache put failed:", err);
                        });
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Let it fail naturally if not cached
                    throw new Error("Network request failed and resource is not cached.");
                });
            })
    );
});
