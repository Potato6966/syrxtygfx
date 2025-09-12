const CACHE_NAME = 'syrxtygfx-v1';
const MANIFEST_URL = 'images-manifest.json';

self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    if (event.request.url.includes(MANIFEST_URL)) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' })
                .then(response => {
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
                    return caches.match(event.request);
                })
        );
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

let lastManifestHash = null;
let isDownloading = false;

async function preloadNewImages(newManifest, oldManifest) {
    if (isDownloading) return;
    isDownloading = true;
    
    const newImages = [];
    const folders = ['backround', 'thumbnails', 'logos', 'product-banners', 'product-boxes'];
    
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
    
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'DOWNLOAD_STARTED',
                count: newImages.length
            });
        });
    });
    
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

setInterval(() => {
    fetch(MANIFEST_URL + '?cb=' + Date.now(), { cache: 'no-store' })
        .then(response => response.json())
        .then(data => {
            const currentHash = JSON.stringify(data);
            
            if (lastManifestHash && lastManifestHash !== currentHash) {
                console.log('Manifest changed, starting background download...');
                
                const oldManifest = lastManifestHash ? JSON.parse(lastManifestHash) : {};
                
                preloadNewImages(data, oldManifest);
            }
            
            lastManifestHash = currentHash;
        })
        .catch(err => console.log('Periodic check failed:', err));
}, 60000); // Check every 60 seconds
