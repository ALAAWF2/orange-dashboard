/**
 * sw.js - Service Worker for Inventory Assistant (مساعد الجرد)
 * Allows PWA installation on mobile Chrome/Safari.
 */

self.addEventListener('install', (e) => {
    // Perform installation
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Pass-through fetch (avoid caching dynamic stock JSON and database queries)
    event.respondWith(fetch(event.request));
});
