/**
 * sw.js - Service Worker for Inventory Assistant (مساعد الجرد)
 * Implements offline caching (Network First, Cache Fallback) for PWA support.
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
    if (event.request.url.includes("supabase.co")) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});
