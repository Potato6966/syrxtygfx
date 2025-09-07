const CACHE_NAME = 'syrxtygfx-v1';
const MANIFEST_URL = 'images-manifest.json';

// Install service worker
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    self.skipWaiting();
});

// Activate service worker
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(self.clients.claim());
});

// Handle fetch requests
self.addEventListener('fetch', (event) => {
    // Let browser handle non-GET requests
    if (event.request.method !== 'GET') return;
    
    // For manifest, always fetch fresh
    if (event.request.url.includes(MANIFEST_URL)) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' })
                .then(response => {
                    // Notify all clients about manifest update
                    self.clients.matchAll().then(clients => {
                        clients.forEach(client => {
                            client.postMessage({
                                type: 'MANIFEST_UPDATED',
                                url: event.request.url
                            });
                        });
                    });
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if network fails
                    return caches.match(event.request);
                })
        );
        return;
    }
    
    // For other requests, try network first, then cache
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Cache successful responses
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache
                return caches.match(event.request);
            })
    );
});

// Periodic manifest check
setInterval(() => {
    fetch(MANIFEST_URL + '?cb=' + Date.now(), { cache: 'no-store' })
        .then(response => response.json())
        .then(data => {
            // Notify all clients about periodic check
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'PERIODIC_CHECK',
                        manifest: data
                    });
                });
            });
        })
        .catch(err => console.log('Periodic check failed:', err));
}, 30000); // Check every 30 seconds
