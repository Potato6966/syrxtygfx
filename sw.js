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

// Store last known manifest for comparison
let lastManifestHash = null;
let isDownloading = false;

// Function to preload new images
async function preloadNewImages(newManifest, oldManifest) {
    if (isDownloading) return;
    isDownloading = true;
    
    const newImages = [];
    const folders = ['backround', 'thumbnails', 'logos', 'product-banners', 'product-boxes'];
    
    // Find new images by comparing manifests
    folders.forEach(folder => {
        const oldFiles = oldManifest[folder] || [];
        const newFiles = newManifest[folder] || [];
        const folderPaths = {
            'backround': 'backround/',
            'thumbnails': 'Thumbnails/',
            'logos': 'Logos/',
            'product-banners': 'Product banners/',
            'product-boxes': 'Product boxes/'
        };
        
        newFiles.forEach(file => {
            if (!oldFiles.includes(file)) {
                newImages.push(folderPaths[folder] + file);
            }
        });
    });
    
    if (newImages.length === 0) {
        isDownloading = false;
        return;
    }
    
    console.log(`Preloading ${newImages.length} new images...`);
    
    // Notify clients that download started
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'DOWNLOAD_STARTED',
                count: newImages.length
            });
        });
    });
    
    // Preload all new images
    const downloadPromises = newImages.map(imagePath => {
        return fetch(imagePath, { cache: 'no-store' })
            .then(response => {
                if (response.ok) {
                    return caches.open(CACHE_NAME).then(cache => {
                        return cache.put(imagePath, response.clone());
                    });
                }
            })
            .catch(err => console.log(`Failed to preload ${imagePath}:`, err));
    });
    
    try {
        await Promise.allSettled(downloadPromises);
        console.log('All new images preloaded successfully');
        
        // Notify clients that download finished
        self.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'DOWNLOAD_COMPLETED',
                    count: newImages.length
                });
            });
        });
    } catch (err) {
        console.log('Some images failed to preload:', err);
    }
    
    isDownloading = false;
}

// Periodic manifest check
setInterval(() => {
    fetch(MANIFEST_URL + '?cb=' + Date.now(), { cache: 'no-store' })
        .then(response => response.json())
        .then(data => {
            // Create a simple hash of the manifest content
            const currentHash = JSON.stringify(data);
            
            // Only proceed if manifest actually changed
            if (lastManifestHash && lastManifestHash !== currentHash) {
                console.log('Manifest changed, starting background download...');
                
                // Get old manifest for comparison
                const oldManifest = lastManifestHash ? JSON.parse(lastManifestHash) : {};
                
                // Start background download
                preloadNewImages(data, oldManifest);
            }
            
            lastManifestHash = currentHash;
        })
        .catch(err => console.log('Periodic check failed:', err));
}, 60000); // Check every 60 seconds
