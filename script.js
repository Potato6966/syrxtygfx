document.addEventListener('DOMContentLoaded', function() {
    const body = document.body;
    const addColorBtn = document.querySelector('.add-color-btn');
    const splashTitle = document.querySelector('.splash-title');
    const splashContent = document.querySelector('.splash-content');
    const overlay = document.querySelector('.color-splash-overlay');
    const navbar = document.querySelector('.navbar');
    const heroContent = document.querySelector('.hero-content');
    const achievements = document.querySelector('.achievements');
    const pricing = document.querySelector('.pricing');
    const processSection = document.querySelector('.process-section');
    const contact = document.querySelector('.contact');
    const portfolio = document.querySelector('.portfolio');
    const about = document.querySelector('.about');
    const reviewsSection = document.querySelector('.reviews-section');
    
    let buildUpActive = true;

    let backgroundImages = [];

    let selectedBackgroundImage = null;

    class ImageCacheManager {
        constructor() {
            this.dbName = 'SYRXTY_ImageCache';
            this.dbVersion = 1;
            this.db = null;
            this.cacheVersion = 'v1.0';
            this.maxCacheSize = 100 * 1024 * 1024; // 100MB
            this.cacheStatus = {
                totalImages: 0,
                cachedImages: 0,
                downloading: false,
                lastUpdate: null
            };
        }

        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.db = request.result;
                    console.log('✅ Image cache database initialized');
                    this.updateCacheStatus();
                    resolve();
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    const categories = ['thumbnails', 'logos', 'product-banners', 'product-boxes', 'backround'];
                    
                    categories.forEach(category => {
                        if (!db.objectStoreNames.contains(category)) {
                            const store = db.createObjectStore(category, { keyPath: 'path' });
                            store.createIndex('timestamp', 'timestamp', { unique: false });
                            store.createIndex('size', 'size', { unique: false });
                        }
                    });
                    
                    if (!db.objectStoreNames.contains('metadata')) {
                        const metadataStore = db.createObjectStore('metadata', { keyPath: 'key' });
                    }
                };
            });
        }

        async getCachedImage(path) {
            if (!this.db) return null;
            
            const category = this.getCategoryFromPath(path);
            if (!category) return null;
            
            return new Promise((resolve) => {
                const transaction = this.db.transaction([category], 'readonly');
                const store = transaction.objectStore(category);
                const request = store.get(path);
                
                request.onsuccess = () => {
                    const result = request.result;
                    if (result && result.blob) {
                        const url = URL.createObjectURL(result.blob);
                        resolve({ url, cached: true, timestamp: result.timestamp });
                    } else {
                        resolve(null);
                    }
                };
                
                request.onerror = () => resolve(null);
            });
        }

        async cacheImage(path, blob) {
            if (!this.db) return false;
            
            const category = this.getCategoryFromPath(path);
            if (!category) return false;
            
            return new Promise((resolve) => {
                const transaction = this.db.transaction([category], 'readwrite');
                const store = transaction.objectStore(category);
                
                const imageData = {
                    path: path,
                    blob: blob,
                    timestamp: Date.now(),
                    size: blob.size
                };
                
                const request = store.put(imageData);
                
                request.onsuccess = () => {
                    console.log(`💾 Cached: ${path}`);
                    resolve(true);
                };
                
                request.onerror = () => {
                    console.warn(`❌ Failed to cache: ${path}`);
                    resolve(false);
                };
            });
        }

        async downloadAndCacheImage(path) {
            try {
                const response = await fetch(path);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const blob = await response.blob();
                await this.cacheImage(path, blob);
                return blob;
            } catch (error) {
                console.warn(`❌ Failed to download: ${path}`, error);
                return null;
            }
        }

        async preloadCategoryImages(category, imagePaths) {
            console.log(`🚀 Preloading ${imagePaths.length} images for ${category}...`);
            
            const results = {
                cached: 0,
                downloaded: 0,
                failed: 0
            };

            const cacheChecks = await Promise.all(
                imagePaths.map(async (path) => {
                    const cached = await this.getCachedImage(path);
                    return { path, cached: !!cached };
                })
            );

            const uncachedPaths = cacheChecks
                .filter(item => !item.cached)
                .map(item => item.path);

            results.cached = cacheChecks.length - uncachedPaths.length;

            const batchSize = 3;
            for (let i = 0; i < uncachedPaths.length; i += batchSize) {
                const batch = uncachedPaths.slice(i, i + batchSize);
                const batchPromises = batch.map(async (path) => {
                    const blob = await this.downloadAndCacheImage(path);
                    if (blob) {
                        results.downloaded++;
                        return { path, success: true };
                    } else {
                        results.failed++;
                        return { path, success: false };
                    }
                });

                await Promise.allSettled(batchPromises);
                
                const progress = Math.round(((i + batch.length) / uncachedPaths.length) * 100);
                this.updatePreloadProgress(category, progress, results);
                
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log(`✅ ${category} preload complete:`, results);
            return results;
        }

        async getCachedImageUrl(path) {
            const cached = await this.getCachedImage(path);
            if (cached) {
                return cached.url;
            }
            return null;
        }

        async syncWithManifest() {
            try {
                const manifest = await getImagesManifest();
                if (!manifest) return { updated: false, message: 'No manifest available' };

                const allPaths = [];
                Object.keys(manifest).forEach(category => {
                    if (Array.isArray(manifest[category])) {
                        const categoryInfo = portfolioCategories[category];
                        if (categoryInfo) {
                            manifest[category].forEach(filename => {
                                allPaths.push(`${categoryInfo.folder}${filename}`);
                            });
                        }
                    }
                });

                const currentCached = await this.getAllCachedPaths();
                const newPaths = allPaths.filter(path => !currentCached.includes(path));
                const removedPaths = currentCached.filter(path => !allPaths.includes(path));

                if (newPaths.length > 0 || removedPaths.length > 0) {
                    console.log(`🔄 Cache sync: +${newPaths.length} new, -${removedPaths.length} removed`);
                    
                    for (const path of removedPaths) {
                        await this.removeCachedImage(path);
                    }
                    
                    if (newPaths.length > 0) {
                        this.cacheStatus.downloading = true;
                        this.showCacheNotification(`Downloading ${newPaths.length} new images...`);
                        
                        const batchSize = 2;
                        for (let i = 0; i < newPaths.length; i += batchSize) {
                            const batch = newPaths.slice(i, i + batchSize);
                            await Promise.allSettled(
                                batch.map(path => this.downloadAndCacheImage(path))
                            );
                            
                            const progress = Math.round(((i + batch.length) / newPaths.length) * 100);
                            this.showCacheNotification(`Downloading... ${progress}%`);
                            
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                        
                        this.cacheStatus.downloading = false;
                        this.showCacheNotification(`✅ ${newPaths.length} images ready!`, 'success');
                    }
                    
                    this.updateCacheStatus();
                    return { updated: true, new: newPaths.length, removed: removedPaths.length };
                }

                return { updated: false, message: 'Cache is up to date' };
            } catch (error) {
                console.error('Cache sync failed:', error);
                return { updated: false, error: error.message };
            }
        }

        async getAllCachedPaths() {
            if (!this.db) return [];
            
            const allPaths = [];
            const categories = ['thumbnails', 'logos', 'product-banners', 'product-boxes', 'backround'];
            
            for (const category of categories) {
                const paths = await new Promise((resolve) => {
                    const transaction = this.db.transaction([category], 'readonly');
                    const store = transaction.objectStore(category);
                    const request = store.getAll();
                    
                    request.onsuccess = () => {
                        resolve(request.result.map(item => item.path));
                    };
                    request.onerror = () => resolve([]);
                });
                
                allPaths.push(...paths);
            }
            
            return allPaths;
        }

        async removeCachedImage(path) {
            if (!this.db) return false;
            
            const category = this.getCategoryFromPath(path);
            if (!category) return false;
            
            return new Promise((resolve) => {
                const transaction = this.db.transaction([category], 'readwrite');
                const store = transaction.objectStore(category);
                const request = store.delete(path);
                
                request.onsuccess = () => {
                    console.log(`🗑️ Removed from cache: ${path}`);
                    resolve(true);
                };
                request.onerror = () => resolve(false);
            });
        }

        getCategoryFromPath(path) {
            if (path.includes('Thumbnails/')) return 'thumbnails';
            if (path.includes('Logos/')) return 'logos';
            if (path.includes('Product banners/')) return 'product-banners';
            if (path.includes('Product boxes/')) return 'product-boxes';
            if (path.includes('backround/')) return 'backround';
            return null;
        }

        updatePreloadProgress(category, percentage, results) {
            const loadingElements = document.querySelectorAll('.count-text');
            loadingElements.forEach(element => {
                if (element.textContent.includes('Loading') || element.textContent.includes('...')) {
                    element.textContent = `${percentage}%`;
                }
            });

            const galleryLoadingText = document.querySelector('#gallery-container p');
            if (galleryLoadingText && galleryLoadingText.textContent.includes('Loading')) {
                galleryLoadingText.textContent = `Loading ${category}... ${percentage}%`;
            }
        }

        showCacheNotification(message, type = 'info') {
            const notification = document.createElement('div');
            notification.id = 'cache-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'success' ? 'linear-gradient(135deg, #10b981, #34d399)' : 'linear-gradient(135deg, #3b82f6, #93c5fd)'};
                color: white;
                padding: 15px 25px;
                border-radius: 10px;
                font-weight: 600;
                z-index: 20000;
                box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3);
                transition: all 0.3s ease;
                max-width: 300px;
            `;
            notification.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    ${type === 'success' ? '<span>✅</span>' : '<div class="spinner" style="width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite;"></div>'}
                    <span>${message}</span>
                </div>
            `;
            
            const existing = document.getElementById('cache-notification');
            if (existing) existing.remove();
            
            document.body.appendChild(notification);
            
            if (type === 'success') {
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.style.opacity = '0';
                        notification.style.transform = 'translateX(100%)';
                        setTimeout(() => notification.remove(), 300);
                    }
                }, 3000);
            }
        }

        async updateCacheStatus() {
            if (!this.db) return;
            
            const allPaths = await this.getAllCachedPaths();
            this.cacheStatus.cachedImages = allPaths.length;
            this.cacheStatus.lastUpdate = new Date().toISOString();
            
            console.log(`📊 Cache status: ${allPaths.length} images cached`);
        }

        async clearCache() {
            if (!this.db) return false;
            
            const categories = ['thumbnails', 'logos', 'product-banners', 'product-boxes', 'backround'];
            
            for (const category of categories) {
                await new Promise((resolve) => {
                    const transaction = this.db.transaction([category], 'readwrite');
                    const store = transaction.objectStore(category);
                    const request = store.clear();
                    
                    request.onsuccess = () => resolve();
                    request.onerror = () => resolve();
                });
            }
            
            this.cacheStatus.cachedImages = 0;
            console.log('🗑️ Cache cleared');
            return true;
        }
    }

    const cacheManager = new ImageCacheManager();
    let cacheInitialized = false;

    async function getImagesManifest() {
        if (window.__imagesManifest !== undefined) return window.__imagesManifest;
        try {
            const res = await fetch(`images-manifest.json?cb=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('no manifest');
            const json = await res.json();
            window.__imagesManifest = json;
            return json;
        } catch (e) {
            window.__imagesManifest = null;
            return null;
        }
    }

    function mapFolderToKey(folder) {
        const mapping = {
            'Thumbnails/': 'thumbnails',
            'Logos/': 'logos',
            'Product banners/': 'product-banners',
            'Product boxes/': 'product-boxes',
            'backround/': 'backround'
        };
        return mapping[folder] || null;
    }

    async function listImagesInFolder(folder, extensions) {
        const manifest = await getImagesManifest();
        const key = mapFolderToKey(folder);
        if (manifest && key && Array.isArray(manifest[key])) {
            return manifest[key].filter(name => {
                const lower = name.toLowerCase();
                return extensions.some(ext => lower.endsWith('.' + ext));
            });
        }
        try {
            const res = await fetch(encodeURI(folder));
            if (!res.ok) throw new Error('Directory listing not available');
            const html = await res.text();
            const regex = /href=["']([^"'?>]+\.(?:png|jpg|jpeg|gif|webp))["']/gi;
            const results = new Set();
            let match;
            while ((match = regex.exec(html)) !== null) {
                const href = match[1];
                const lower = href.toLowerCase();
                if (extensions.some(ext => lower.endsWith('.' + ext))) {
                    const filename = href.split('/').pop();
                    if (filename) results.add(filename);
                }
            }
            return Array.from(results);
        } catch (e) {
            return [];
        }
    }

    async function getBackgroundImages() {
        const dynamic = await listImagesInFolder('backround/', ['png', 'jpg', 'jpeg', 'gif', 'webp']);
        if (dynamic.length > 0) return dynamic;
        return [
        '1401907185612755025_001.png',
        '1401907185612755025_002.png',
        '1401907185612755025_003.png',
        '1401907185612755025_004.png',
        '1401907185612755025_005.png',
        '1401907185612755025_006.png',
        '1401907185612755025_007.png',
        '1401907185612755025_008.png',
        '1401907185612755025_009.png',
        '1401907185612755025_010.png',
        '1401907185612755025_011.png',
        '1401907185612755025_012.png',
        '1401907185612755025_013.png',
        '1401907185612755025_014.png',
        '1401907185612755025_015.png',
        '1401907185612755025_016.png',
        '1401907185612755025_017.png',
        '1401907185612755025_018.png',
        '1401907185612755025_019.png',
        '1401907185612755025_020.png',
        '1401907185612755025_021.png',
        '1401907185612755025_022.png',
        '1401907185612755025_023.png',
        '1401907222027702423_001.png',
        '1401907222027702423_002.png',
        '1401907222027702423_003.png',
        '1401907222027702423_004.png',
        '1401907222027702423_005.png',
        '1401907222027702423_006.png',
        '1401907222027702423_007.png',
        '1401907222027702423_008.png',
        '1401907222027702423_009.png',
        '1401907222027702423_010.png',
        '1401907222027702423_011.png',
        '1401907222027702423_012.png',
        '1401907222027702423_013.png',
        '1401907222027702423_014.png',
        '1401907222027702423_015.png',
        '1401907222027702423_016.png',
        '1401907222027702423_017.png',
        '1401907222027702423_018.png',
        '1401907222027702423_019.png',
        '1401907222027702423_021.png',
        '1401907222027702423_022.png',
        '1401907222027702423_023.png',
        '1401907222027702423_024.png',
        '1401907222027702423_025.png',
        '1401907543638282320_001.png',
        '1401907543638282320_002.png',
        '1401907543638282320_003.png',
        '1401907543638282320_004.png',
        '1401909711879802932_001.png',
        '1401909711879802932_003.png'
    ];
    }

    async function preloadBackgroundImages() {
        if (!backgroundImages || backgroundImages.length === 0) {
            backgroundImages = await getBackgroundImages();
        }
        const priorityImages = backgroundImages.slice(0, 3);
        const promises = priorityImages.map(filename => {
            return preloadImage(`backround/${filename}`).catch(() => null);
        });
        
        return Promise.allSettled(promises).then(() => {
            const availableImages = priorityImages.filter(filename => 
                preloadedImages.has(`backround/${filename}`)
            );
            
            if (availableImages.length > 0) {
                selectedBackgroundImage = availableImages[Math.floor(Math.random() * availableImages.length)];
                setBackgroundImage(selectedBackgroundImage);
            }
            
            setTimeout(() => {
                const remainingImages = backgroundImages.slice(3);
                remainingImages.forEach(filename => {
                    preloadImage(`backround/${filename}`).catch(() => null);
                });
            }, 2000);
        });
    }

    function setBackgroundImage(imageName) {
        const style = document.createElement('style');
        style.textContent = `
            body::after {
                background-image: url('backround/${imageName}') !important;
            }
        `;
        document.head.appendChild(style);
    }

    async function preloadImage(src) {
            if (preloadedImages.has(src)) {
            return preloadedImages.get(src);
        }
        
        if (cacheInitialized) {
            const cachedUrl = await cacheManager.getCachedImageUrl(src);
            if (cachedUrl) {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        preloadedImages.set(src, img);
                        resolve(img);
                    };
                    img.onerror = () => reject(new Error(`Failed to load cached image: ${src}`));
                    img.src = cachedUrl;
                });
            }
        }
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                preloadedImages.set(src, img);
                resolve(img);
            };
            img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
            img.src = src;
        });
    }

    async function verifyImagesExist(paths) {
        const checks = paths.map(src => {
            return preloadImage(src).then(() => ({ src, ok: true })).catch(() => ({ src, ok: false }));
        });
        const results = await Promise.allSettled(checks);
        return results
            .filter(r => r.status === 'fulfilled' && r.value.ok)
            .map(r => r.value.src);
    }

    function preloadEssentialImages() {
        return preloadBackgroundImages().then(() => {
            const essentialImages = ['SYRXTY_pfp/IMG_5510.png'];
            
            const preloadPromises = essentialImages.map(path => 
                preloadImage(path).catch(() => null)
            );

            return Promise.allSettled(preloadPromises);
        });
    }

    async function preloadAllPortfolioImages() {
        console.log('🚀 Preloading ALL portfolio images with progress tracking...');

        const allImagePaths = [];
        const promises = [];
        let loadedCount = 0;
        let totalCount = 0;

        const getCategoryFilenames = async (category) => {
            const info = portfolioCategories[category];
            const dynamic = await listImagesInFolder(info.folder, info.extensions);
            if (dynamic.length > 0) return dynamic;
            const fallback = {
            'thumbnails': [
                '1401907185612755025_001.png', '1401907185612755025_002.png', '1401907185612755025_003.png',
                '1401907185612755025_004.png', '1401907185612755025_005.png', '1401907185612755025_006.png',
                '1401907185612755025_007.png', '1401907185612755025_008.png', '1401907185612755025_009.png',
                '1401907185612755025_010.png', '1401907185612755025_011.png', '1401907185612755025_012.png',
                '1401907185612755025_013.png', '1401907185612755025_014.png', '1401907185612755025_015.png',
                '1401907185612755025_016.png', '1401907185612755025_017.png', '1401907185612755025_018.png',
                '1401907185612755025_019.png', '1401907185612755025_020.png', '1401907185612755025_021.png',
                '1401907185612755025_022.png', '1401907185612755025_023.png',
                '1401907222027702423_001.png', '1401907222027702423_002.png', '1401907222027702423_003.png',
                '1401907222027702423_004.png', '1401907222027702423_005.png', '1401907222027702423_006.png',
                '1401907222027702423_007.png', '1401907222027702423_008.png', '1401907222027702423_009.png',
                '1401907222027702423_010.png', '1401907222027702423_011.png', '1401907222027702423_012.png',
                '1401907222027702423_013.png', '1401907222027702423_014.png', '1401907222027702423_015.png',
                '1401907222027702423_016.png', '1401907222027702423_017.png', '1401907222027702423_018.png',
                '1401907222027702423_019.png', '1401907222027702423_021.png', '1401907222027702423_022.png',
                '1401907222027702423_023.png', '1401907222027702423_024.png', '1401907222027702423_025.png',
                '1401907543638282320_001.png', '1401907543638282320_002.png', '1401907543638282320_003.png',
                    '1401907543638282320_004.png', '1401909711879802932_001.png', '1401909711879802932_003.png'
            ],
            'logos': [
                '1401907146664181951_001.jpg', '1401907146664181951_002.png', '1401907146664181951_003.png',
                '1401907146664181951_004.png', '1401907146664181951_005.png', '1401907146664181951_006.png'
            ],
            'product-banners': [
                '150skin.png', '300skin.png', '50skin.png', 'image.png', 'precise_bo6_internal.png',
                'PRecise_fn_priv.png', 'precise_perm_spf.png', 'precise_temp_woofer.png', 'Products_Banner.png',
                'Velocity_Fortnite_Private.png', 'Venza_Accounts.png', 'Venza_Fortnite_Private.png',
                'Venza_Fortnite_Slotted.png', 'Venza_Fortnite_Ultimate.png', 'Venza_Fortnite_Unreal.png',
                'Venza_Spoofer.png', 'Venza_Valorant_INt.png'
            ],
            'product-boxes': [
                'grow_a_garden_fa_account.png', 'image.png', 'neat_cod_priavte.png', 'neat_fn_private.png',
                'neat_temp_spf.png', 'primal_cod_unlock_all.png', 'primal_fn_slotted.png', 'roblox_executors.png',
                'roblox_replay.png', 'rubux_account_fa.png', 'zylo_fn_external.png', 'zylo_fn_ultimate.png',
                'zylo_perm_spoofer.png', 'zylo_temp_spoofer.png', 'ZYRO_fn_og.png', 'ZYRO_fn_private.png',
                'ZYRO_fn_pro.png', 'ZYRO_fn_public.png', 'ZYRO_fn_ultimate.png'
            ]
            };
            return fallback[category] || [];
        };


        for (const category of Object.keys(portfolioCategories)) {
            const categoryInfo = portfolioCategories[category];
            const categoryFiles = await getCategoryFilenames(category);
            const fullPaths = categoryFiles.map(filename => `${categoryInfo.folder}${filename}`);
            const valid = await verifyImagesExist(fullPaths);
            valid.forEach(p => allImagePaths.push(p));
        }

        totalCount = allImagePaths.length;
        console.log(`⚡ Preloading ${totalCount} images with real-time progress...`);


        window.preloadProgress = {
            loaded: 0,
            total: totalCount,
            percentage: 0,
            updateUI: function() {
                this.percentage = Math.round((this.loaded / this.total) * 100);
                this.updateLoadingTexts();
            },
            updateLoadingTexts: function() {
                const loadingElements = document.querySelectorAll('.count-text');
                loadingElements.forEach(element => {
                    if (element.textContent.includes('Loading') || element.textContent.includes('...')) {
                        element.textContent = `${this.percentage}%`;
                    }
                });

                const galleryLoadingText = document.querySelector('#gallery-container p');
                if (galleryLoadingText && galleryLoadingText.textContent.includes('Loading')) {
                    galleryLoadingText.textContent = `Loading images... ${this.percentage}%`;
                }
            }
        };

        const categories = ['thumbnails', 'logos', 'product-banners', 'product-boxes'];
        const categoryData = {};
        let maxImages = 0;

        for (const category of categories) {
            const categoryInfo = portfolioCategories[category];
            const categoryImages = await getCategoryFilenames(category);
            categoryData[category] = {
                info: categoryInfo,
                images: categoryImages,
                index: 0
            };
            maxImages = Math.max(maxImages, categoryImages.length);
        }
        
        console.log(`🔄 Round-Robin preloading: 4 images at a time (1 per category)...`);

        for (let round = 0; round < maxImages; round++) {
            const roundPromises = [];
            
            categories.forEach(category => {
                const catData = categoryData[category];
                if (catData.index < catData.images.length) {
                    const filename = catData.images[catData.index];
                    const imagePath = `${catData.info.folder}${filename}`;
                    
                    const promise = preloadImage(imagePath).then(() => {
                        loadedCount++;
                        window.preloadProgress.loaded = loadedCount;
                        window.preloadProgress.updateUI();
                        console.log(`✓ ${category}: ${filename}`);
                    }).catch(() => {
                        loadedCount++;
                        window.preloadProgress.loaded = loadedCount;
                        window.preloadProgress.updateUI();
                        console.log(`✗ ${category}: ${filename} failed`);
                    });
                    
                    roundPromises.push(promise);
                    catData.index++;
                }
            });

            if (roundPromises.length > 0) {
                await Promise.allSettled(roundPromises);
                console.log(`🔄 Round ${round + 1} completed (${roundPromises.length} images)`);

                await new Promise(resolve => setTimeout(resolve, 25));
            }
        }

        const successful = loadedCount;

        console.log(`✅ Successfully preloaded ${successful}/${totalCount} images`);

        window.preloadProgress.loaded = successful;
        window.preloadProgress.updateUI();

        return successful;
    }

    async function preloadAllPortfolioImagesWithCache() {
        console.log('🚀 Cache-aware preloading with progressive category display...');

        const categories = ['thumbnails', 'logos', 'product-banners', 'product-boxes'];
        let totalCached = 0;
        let totalDownloaded = 0;
        let totalFailed = 0;

        categories.forEach(category => {
            updateCategoryStatus(category, 'loading', 0);
        });

        const categoryPromises = categories.map(async (category) => {
            const categoryInfo = portfolioCategories[category];
            const categoryFiles = await getCategoryFilenames(category);
            const fullPaths = categoryFiles.map(filename => `${categoryInfo.folder}${filename}`);
            
            console.log(`📂 Processing ${category}: ${fullPaths.length} images`);
            
            const results = await cacheManager.preloadCategoryImages(category, fullPaths);
            
            updateCategoryStatus(category, 'ready', results.cached + results.downloaded);
            
            return { category, results };
        });

        const categoryResults = await Promise.allSettled(categoryPromises);
        
        categoryResults.forEach(result => {
            if (result.status === 'fulfilled') {
                const { results } = result.value;
                totalCached += results.cached;
                totalDownloaded += results.downloaded;
                totalFailed += results.failed;
            }
        });

        console.log(`✅ Cache-aware preload complete: ${totalCached} cached, ${totalDownloaded} downloaded, ${totalFailed} failed`);
        
        window.preloadProgress = window.preloadProgress || {};
        window.preloadProgress.loaded = totalCached + totalDownloaded;
        window.preloadProgress.total = totalCached + totalDownloaded + totalFailed;
        window.preloadProgress.updateUI = function() {
            this.percentage = 100;
            this.updateLoadingTexts();
        };
        window.preloadProgress.updateLoadingTexts = function() {
            const loadingElements = document.querySelectorAll('.count-text');
            loadingElements.forEach(element => {
                if (element.textContent.includes('Loading') || element.textContent.includes('...')) {
                    element.textContent = 'Ready!';
                }
            });
        };
        window.preloadProgress.updateUI();

        return totalCached + totalDownloaded;
    }

    function updateCategoryStatus(category, status, count) {
        const categoryCards = document.querySelectorAll('.category-card');
        categoryCards.forEach(card => {
            const categoryName = card.querySelector('.category-name');
            if (categoryName && categoryName.textContent.toLowerCase().includes(category.replace('-', ' '))) {
                const countElement = card.querySelector('.count-text');
                if (countElement) {
                    if (status === 'ready') {
                        countElement.textContent = `${count} designs`;
                        countElement.style.color = '#10b981';
                        countElement.style.fontWeight = '600';
                        
                        countElement.style.transform = 'scale(1.05)';
                        setTimeout(() => {
                            countElement.style.transform = 'scale(1)';
                        }, 200);
                    } else if (status === 'loading') {
                        countElement.textContent = 'Loading...';
                        countElement.style.color = '#3b82f6';
                    }
                }
            }
        });
    }

    function addCacheStatusIndicator() {
        const portfolioSection = document.querySelector('#portfolio .container');
        if (!portfolioSection) return;

        const cacheStatus = document.createElement('div');
        cacheStatus.id = 'cache-status-indicator';
        cacheStatus.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: linear-gradient(135deg, #10b981, #34d399);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            font-weight: 600;
            font-size: 14px;
            z-index: 1000;
            box-shadow: 0 8px 25px rgba(16, 185, 129, 0.3);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s ease;
            cursor: pointer;
        `;
        
        cacheStatus.innerHTML = `
            <span>💾</span>
            <span id="cache-status-text">Images cached for instant loading</span>
            <button id="clear-cache-btn" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 12px;
                margin-left: 8px;
            " title="Clear cache">🗑️</button>
        `;

        document.body.appendChild(cacheStatus);

        const updateCacheStatus = async () => {
            if (cacheInitialized) {
                await cacheManager.updateCacheStatus();
                const statusText = document.getElementById('cache-status-text');
                if (statusText) {
                    statusText.textContent = `${cacheManager.cacheStatus.cachedImages} images cached`;
                }
            }
        };

        updateCacheStatus();

        const clearCacheBtn = document.getElementById('clear-cache-btn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Clear all cached images? This will require re-downloading them.')) {
                    await cacheManager.clearCache();
                    cacheStatus.style.background = 'linear-gradient(135deg, #ef4444, #f87171)';
                    const statusText = document.getElementById('cache-status-text');
                    if (statusText) {
                        statusText.textContent = 'Cache cleared';
                    }
                    setTimeout(() => {
                        cacheStatus.remove();
                    }, 2000);
                }
            });
        }

        let hideTimeout = setTimeout(() => {
            cacheStatus.style.opacity = '0.7';
            cacheStatus.style.transform = 'scale(0.95)';
        }, 5000);

        cacheStatus.addEventListener('mouseenter', () => {
            clearTimeout(hideTimeout);
            cacheStatus.style.opacity = '1';
            cacheStatus.style.transform = 'scale(1)';
        });

        cacheStatus.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(() => {
                cacheStatus.style.opacity = '0.7';
                cacheStatus.style.transform = 'scale(0.95)';
            }, 2000);
        });

        setInterval(updateCacheStatus, 60000);
    }

    const portfolioCategories = {
        'thumbnails': { folder: 'Thumbnails/', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        'logos': { folder: 'Logos/', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        'product-banners': { folder: 'Product banners/', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        'product-boxes': { folder: 'Product boxes/', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
    };

    let portfolioData = {};
    let currentLightboxImages = [];
    let currentImageIndex = 0;
    let preloadedImages = new Map();
    let cart = [];
    let cartCount = 0;
    async function scanDirectoryForImages(category) {
        const categoryInfo = portfolioCategories[category];
        const images = [];
        let categoryFiles = await listImagesInFolder(categoryInfo.folder, categoryInfo.extensions);
        if (!categoryFiles || categoryFiles.length === 0) {
            const fallback = {
            'thumbnails': [
                '1401907185612755025_001.png', '1401907185612755025_002.png', '1401907185612755025_003.png',
                '1401907185612755025_004.png', '1401907185612755025_005.png', '1401907185612755025_006.png',
                '1401907185612755025_007.png', '1401907185612755025_008.png', '1401907185612755025_009.png',
                '1401907185612755025_010.png', '1401907185612755025_011.png', '1401907185612755025_012.png',
                '1401907185612755025_013.png', '1401907185612755025_014.png', '1401907185612755025_015.png',
                '1401907185612755025_016.png', '1401907185612755025_017.png', '1401907185612755025_018.png',
                '1401907185612755025_019.png', '1401907185612755025_020.png', '1401907185612755025_021.png',
                '1401907185612755025_022.png', '1401907185612755025_023.png',
                '1401907222027702423_001.png', '1401907222027702423_002.png', '1401907222027702423_003.png',
                '1401907222027702423_004.png', '1401907222027702423_005.png', '1401907222027702423_006.png',
                '1401907222027702423_007.png', '1401907222027702423_008.png', '1401907222027702423_009.png',
                '1401907222027702423_010.png', '1401907222027702423_011.png', '1401907222027702423_012.png',
                '1401907222027702423_013.png', '1401907222027702423_014.png', '1401907222027702423_015.png',
                '1401907222027702423_016.png', '1401907222027702423_017.png', '1401907222027702423_018.png',
                '1401907222027702423_019.png', '1401907222027702423_021.png', '1401907222027702423_022.png',
                '1401907222027702423_023.png', '1401907222027702423_024.png', '1401907222027702423_025.png',
                '1401907543638282320_001.png', '1401907543638282320_002.png', '1401907543638282320_003.png',
                    '1401907543638282320_004.png', '1401909711879802932_001.png', '1401909711879802932_003.png'
            ],
            'logos': [
                '1401907146664181951_001.jpg', '1401907146664181951_002.png', '1401907146664181951_003.png',
                '1401907146664181951_004.png', '1401907146664181951_005.png', '1401907146664181951_006.png',
                'auto_test_logo_001.jpg'
            ],
            'product-banners': [
                '150skin.png', '300skin.png', '50skin.png', 'image.png', 'precise_bo6_internal.png',
                'PRecise_fn_priv.png', 'precise_perm_spf.png', 'precise_temp_woofer.png', 'Products_Banner.png',
                'Velocity_Fortnite_Private.png', 'Venza_Accounts.png', 'Venza_Fortnite_Private.png',
                'Venza_Fortnite_Slotted.png', 'Venza_Fortnite_Ultimate.png', 'Venza_Fortnite_Unreal.png',
                'Venza_Spoofer.png', 'Venza_Valorant_INt.png'
            ],
            'product-boxes': [
                'grow_a_garden_fa_account.png', 'image.png', 'neat_cod_priavte.png', 'neat_fn_private.png',
                'neat_temp_spf.png', 'primal_cod_unlock_all.png', 'primal_fn_slotted.png', 'roblox_executors.png',
                'roblox_replay.png', 'rubux_account_fa.png', 'zylo_fn_external.png', 'zylo_fn_ultimate.png',
                'zylo_perm_spoofer.png', 'zylo_temp_spoofer.png', 'ZYRO_fn_og.png', 'ZYRO_fn_private.png',
                'ZYRO_fn_pro.png', 'ZYRO_fn_public.png', 'ZYRO_fn_ultimate.png'
            ]
        };
            categoryFiles = fallback[category] || [];
        }
        
        console.log(`🚀 ULTRA-FAST loading ${categoryFiles.length} images for category: ${category}`);

        categoryFiles.forEach(filename => {
            const imagePath = `${categoryInfo.folder}${filename}`;
            const nameWithoutExt = filename.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
            images.push({
                path: imagePath,
                name: nameWithoutExt,
                category: category
            });
        });

        console.log(`⚡ INSTANT loaded ${images.length} images in category: ${category}`);

        images.sort((a, b) => {
            const aMatch = a.name.match(/^(\d+)/);
            const bMatch = b.name.match(/^(\d+)/);

            if (aMatch && bMatch) {
                return parseInt(aMatch[1]) - parseInt(bMatch[1]);
            }

            return a.name.localeCompare(b.name);
        });

        return images;
    }

    function getImagesList(category) {
        return scanDirectoryForImages(category);
    }

    async function loadPortfolioImages() {
        const categories = Object.keys(portfolioCategories);

        await Promise.all(categories.map(async (category) => {
            const info = portfolioCategories[category];
            const files = await listImagesInFolder(info.folder, info.extensions);
            const full = files.map(f => `${info.folder}${f}`);
            const valid = await verifyImagesExist(full);
            updatePortfolioCount(category, valid.length);
        }));

        console.log('⚡ Portfolio counters set to real values from folders.');
        
        for (const category of categories) {
            try {
                console.log(`📂 Loading category: ${category}...`);
                const images = await scanDirectoryForImages(category);

                if (category === 'thumbnails') {
                    const thumbnailImages = [...images];
                    const backgroundPromises = backgroundImages.map(filename => {
                        return new Promise((resolve) => {
                            const imagePath = `Thumbnails/${filename}`;
                            const img = new Image();
                            img.onload = () => {
                                if (!thumbnailImages.find(item => item.path === imagePath)) {
                                    thumbnailImages.push({
                                        path: imagePath,
                                        name: filename.replace(/\.(png|jpg|jpeg)$/i, ''),
                                        category: category
                                    });
                                }
                                resolve();
                            };
                            img.onerror = () => resolve();
                            img.src = imagePath;
                        });
                    });

                    await Promise.allSettled(backgroundPromises);

                    thumbnailImages.sort((a, b) => {
                        const aMatch = a.name.match(/^(\d+)/);
                        const bMatch = b.name.match(/^(\d+)/);

                        if (aMatch && bMatch) {
                            return parseInt(aMatch[1]) - parseInt(bMatch[1]);
                        }

                        return a.name.localeCompare(b.name);
                    });

                    portfolioData[category] = thumbnailImages;
                        updatePortfolioCount(category, thumbnailImages.length);
                } else {
                    portfolioData[category] = images;
                        updatePortfolioCount(category, images.length);
                }

                console.log(`✅ Loaded ${images.length} images for category: ${category}`);

                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`❌ Error loading images for category ${category}:`, error);
                portfolioData[category] = [];
                updatePortfolioCount(category, 0);
            }
        }
        console.log('🎉 All portfolio images loaded successfully!');
    }

    function updatePortfolioCount(category, count) {
        const card = document.querySelector(`[data-category="${category}"]`);
        if (card) {
            const countElement = card.querySelector('.portfolio-count');
            const countText = countElement.querySelector('.count-text');
            const spinner = countElement.querySelector('.loading-spinner');
            
            if (count > 0) {
                countText.textContent = `${count} items`;
                countElement.classList.add('loaded');
                spinner.style.display = 'none';
            } else {
                setTimeout(() => {
                    countText.textContent = 'No items found';
                    countElement.classList.add('loaded');
                    spinner.style.display = 'none';
                }, 2000);
            }
        }
    }

    function openPortfolioModal(category) {
        const modal = document.getElementById('portfolio-modal');
        const modalTitle = document.getElementById('modal-title');
        const galleryContainer = document.getElementById('gallery-container');

        const categoryNames = {
            'thumbnails': 'Thumbnails',
            'logos': 'Logos',
            'product-banners': 'Product Banners',
            'product-boxes': 'Product Boxes'
        };

        modalTitle.textContent = categoryNames[category] || 'Portfolio';

        const images = portfolioData[category] || [];

        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';

        if (images.length > 0) {
            console.log(`🎯 Images already loaded for ${category}, showing instantly!`);
            galleryContainer.innerHTML = '';
            const fragment = document.createDocumentFragment();
            images.forEach((image, index) => {
                const galleryItem = document.createElement('div');
                galleryItem.className = 'gallery-item';
                galleryItem.style.opacity = '0';
                galleryItem.innerHTML = `
                    <img alt="${image.name}" decoding="async" fetchpriority="low" style="opacity:0">
                    <div class="gallery-item-overlay">
                        <h4>${image.name}</h4>
                    </div>
                `;

                const imgEl = galleryItem.querySelector('img');
                
                const loadingIndicator = document.createElement('div');
                loadingIndicator.className = 'image-loading-indicator';
                loadingIndicator.innerHTML = '<div class="loading-spinner"></div>';
                loadingIndicator.style.cssText = `
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 2;
                `;
                galleryItem.appendChild(loadingIndicator);

                if (cacheInitialized) {
                    cacheManager.getCachedImageUrl(image.path).then(cachedUrl => {
                        if (cachedUrl) {
                            imgEl.src = cachedUrl;
                            imgEl.style.opacity = '1';
                            galleryItem.style.opacity = '1';
                            loadingIndicator.remove();
                            
                            const cachedIndicator = document.createElement('div');
                            cachedIndicator.className = 'cached-indicator';
                            cachedIndicator.innerHTML = '💾';
                            cachedIndicator.style.cssText = `
                                position: absolute;
                                top: 8px;
                                right: 8px;
                                background: rgba(16, 185, 129, 0.9);
                                color: white;
                                border-radius: 50%;
                                width: 24px;
                                height: 24px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 12px;
                                z-index: 3;
                            `;
                            galleryItem.appendChild(cachedIndicator);
                            return;
                        }
                        
                        preloadImage(image.path).then(() => {
                            imgEl.src = image.path;
                            imgEl.style.opacity = '1';
                            galleryItem.style.opacity = '1';
                            loadingIndicator.remove();
                        }).catch(() => {
                            galleryItem.remove();
                        });
                    });
                } else {
                    preloadImage(image.path).then(() => {
                        imgEl.src = image.path;
                        imgEl.style.opacity = '1';
                        galleryItem.style.opacity = '1';
                        loadingIndicator.remove();
                    }).catch(() => {
                        galleryItem.remove();
                    });
                }

                galleryItem.addEventListener('click', () => {
                    openLightbox(images, index);
                });

                fragment.appendChild(galleryItem);
            });
            galleryContainer.appendChild(fragment);
            return;
        }

        const startTime = Date.now();
        galleryContainer.innerHTML = `
            <div class="gallery-loading">
                <div class="gallery-loading-spinner"></div>
                <p>Loading ${categoryNames[category]}... 0%</p>
                <div class="progress-bar">
                    <div class="progress-fill" id="gallery-progress-fill" style="width: 0%"></div>
                </div>
                <div class="loading-stats">
                    <span id="loaded-count">0</span> images loading
                </div>
                <div class="loading-time">
                    <span id="estimated-time">Estimating...</span>
                </div>
            </div>
        `;

        setTimeout(() => loadGalleryImages(category, startTime), 10);

        return;
    }

    async function loadGalleryImages(category, startTime = Date.now()) {
        const galleryContainer = document.getElementById('gallery-container');
        const progressFill = document.getElementById('gallery-progress-fill');
        const loadedCountElement = document.getElementById('loaded-count');
        const loadingText = galleryContainer.querySelector('p');
        const estimatedTimeElement = document.getElementById('estimated-time');

        const categoryNames = {
            'thumbnails': 'Thumbnails',
            'logos': 'Logos',
            'product-banners': 'Product Banners',
            'product-boxes': 'Product Boxes'
        };

        try {
            if (!portfolioData[category] || portfolioData[category].length === 0) {
                console.log(`Loading gallery images for ${category}...`);
                let images = await scanDirectoryForImages(category);
                const validPaths = await verifyImagesExist(images.map(i => i.path));
                const validSet = new Set(validPaths);
                images = images.filter(i => validSet.has(i.path));
                portfolioData[category] = images;
            }

            const images = portfolioData[category] || [];
            const expectedCount = images.length;

            const totalSteps = 4;
            const stepSize = Math.ceil(images.length / totalSteps);

            for (let step = 1; step <= totalSteps; step++) {
                const loadedCount = Math.min(step * stepSize, images.length);
                const percentage = Math.round((loadedCount / expectedCount) * 100);
                const elapsedTime = Date.now() - startTime;

                if (progressFill) progressFill.style.width = `${percentage}%`;
                if (loadedCountElement) loadedCountElement.textContent = loadedCount;
                if (loadingText) loadingText.textContent = `Loading ${categoryNames[category]}... ${percentage}%`;

                if (estimatedTimeElement) {
                    if (step === totalSteps) {
                        estimatedTimeElement.textContent = 'Done!';
                    } else {
                        estimatedTimeElement.textContent = `${totalSteps - step}s remaining`;
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 15));
            }

            if (images.length === 0) {
                galleryContainer.innerHTML = '<p style="text-align: center; color: #94a3b8; grid-column: 1 / -1;">No images found in this category yet.</p>';
            } else {
                galleryContainer.innerHTML = '';
                const fragment = document.createDocumentFragment();
                images.forEach((image, index) => {
                    const galleryItem = document.createElement('div');
                    galleryItem.className = 'gallery-item';
                    galleryItem.style.opacity = '0';
                    galleryItem.innerHTML = `
                        <img alt="${image.name}" decoding="async" fetchpriority="low" style="opacity:0">
                        <div class="gallery-item-overlay">
                            <h4>${image.name}</h4>
                        </div>
                    `;

                    const imgEl = galleryItem.querySelector('img');
                    
                    const loadingIndicator = document.createElement('div');
                    loadingIndicator.className = 'image-loading-indicator';
                    loadingIndicator.innerHTML = '<div class="loading-spinner"></div>';
                    loadingIndicator.style.cssText = `
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        z-index: 2;
                    `;
                    galleryItem.appendChild(loadingIndicator);

                    if (cacheInitialized) {
                        cacheManager.getCachedImageUrl(image.path).then(cachedUrl => {
                            if (cachedUrl) {
                                imgEl.src = cachedUrl;
                                imgEl.style.opacity = '1';
                                galleryItem.style.opacity = '1';
                                loadingIndicator.remove();
                                
                                const cachedIndicator = document.createElement('div');
                                cachedIndicator.className = 'cached-indicator';
                                cachedIndicator.innerHTML = '💾';
                                cachedIndicator.style.cssText = `
                                    position: absolute;
                                    top: 8px;
                                    right: 8px;
                                    background: rgba(16, 185, 129, 0.9);
                                    color: white;
                                    border-radius: 50%;
                                    width: 24px;
                                    height: 24px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    font-size: 12px;
                                    z-index: 3;
                                `;
                                galleryItem.appendChild(cachedIndicator);
                                return;
                            }
                            
                            preloadImage(image.path).then(() => {
                                imgEl.src = image.path;
                                imgEl.style.opacity = '1';
                                galleryItem.style.opacity = '1';
                                loadingIndicator.remove();
                            }).catch(() => {
                                galleryItem.remove();
                            });
                        });
                    } else {
                        preloadImage(image.path).then(() => {
                            imgEl.src = image.path;
                            imgEl.style.opacity = '1';
                            galleryItem.style.opacity = '1';
                            loadingIndicator.remove();
                        }).catch(() => {
                            galleryItem.remove();
                        });
                    }

                    galleryItem.addEventListener('click', () => {
                        openLightbox(images, index);
                    });

                    fragment.appendChild(galleryItem);
                });
                galleryContainer.appendChild(fragment);
            }

            console.log(`✅ Gallery loaded successfully: ${images.length} images`);

        } catch (error) {
            console.error(`❌ Error loading gallery: ${error}`);
            galleryContainer.innerHTML = '<p style="text-align: center; color: #ff6b6b; grid-column: 1 / -1;">Error loading images. Please try again.</p>';
        }
    }

    function closePortfolioModal() {
        const modal = document.getElementById('portfolio-modal');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    function openLightbox(images, startIndex) {
        currentLightboxImages = images;
        currentImageIndex = startIndex;
        
        const lightboxModal = document.getElementById('lightbox-modal');
        const lightboxImage = document.getElementById('lightbox-image');
        const lightboxTitle = document.getElementById('lightbox-title');
        const lightboxCounter = document.getElementById('lightbox-counter');
        
        updateLightboxImage();
        lightboxModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        const lightboxModal = document.getElementById('lightbox-modal');
        lightboxModal.style.display = 'none';
        document.body.style.overflow = 'hidden';
    }

    function updateLightboxImage() {
        if (currentLightboxImages.length === 0) return;
        
        const currentImage = currentLightboxImages[currentImageIndex];
        const lightboxImage = document.getElementById('lightbox-image');
        const lightboxTitle = document.getElementById('lightbox-title');
        const lightboxCounter = document.getElementById('lightbox-counter');
        
        lightboxImage.src = currentImage.path;
        lightboxImage.alt = currentImage.name;
        lightboxTitle.textContent = currentImage.name;
        lightboxCounter.textContent = `${currentImageIndex + 1} / ${currentLightboxImages.length}`;
        

        const prevBtn = document.querySelector('.lightbox-prev');
        const nextBtn = document.querySelector('.lightbox-next');
        
        prevBtn.style.display = currentLightboxImages.length > 1 ? 'flex' : 'none';
        nextBtn.style.display = currentLightboxImages.length > 1 ? 'flex' : 'none';
    }

    function nextLightboxImage() {
        if (currentLightboxImages.length === 0) return;
        currentImageIndex = (currentImageIndex + 1) % currentLightboxImages.length;
        updateLightboxImage();
    }

    function prevLightboxImage() {
        if (currentLightboxImages.length === 0) return;
        currentImageIndex = (currentImageIndex - 1 + currentLightboxImages.length) % currentLightboxImages.length;
        updateLightboxImage();
    }


    document.querySelectorAll('.portfolio-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const category = btn.closest('.portfolio-card').getAttribute('data-category');
            openPortfolioModal(category);
        });
    });

    document.querySelector('.modal-close').addEventListener('click', closePortfolioModal);
    
    document.getElementById('portfolio-modal').addEventListener('click', (e) => {
        if (e.target.id === 'portfolio-modal') {
            closePortfolioModal();
        }
    });


    document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    document.querySelector('.lightbox-prev').addEventListener('click', prevLightboxImage);
    document.querySelector('.lightbox-next').addEventListener('click', nextLightboxImage);
    
    document.getElementById('lightbox-modal').addEventListener('click', (e) => {
        if (e.target.id === 'lightbox-modal') {
            closeLightbox();
        }
    });


    document.addEventListener('keydown', (e) => {
        const lightboxModal = document.getElementById('lightbox-modal');
        if (lightboxModal.style.display === 'block') {
            switch(e.key) {
                case 'Escape':
                    closeLightbox();
                    break;
                case 'ArrowLeft':
                    prevLightboxImage();
                    break;
                case 'ArrowRight':
                    nextLightboxImage();
                    break;
            }
        }
    });


    async function initializeCacheSystem() {
        try {
            await cacheManager.init();
            cacheInitialized = true;
            console.log('✅ Cache system initialized');
            
            const syncResult = await cacheManager.syncWithManifest();
            if (syncResult.updated) {
                console.log(`🔄 Cache updated: +${syncResult.new} new, -${syncResult.removed} removed`);
            }
            
            return true;
        } catch (error) {
            console.warn('❌ Cache initialization failed, using fallback:', error);
            cacheInitialized = false;
            return false;
        }
    }

    preloadEssentialImages().then(async () => {
        console.log('🚀 Starting ULTRA-LIGHTNING portfolio loading with cache...');

        await initializeCacheSystem();

        console.log('📂 Loading categories sequentially...');
        await loadPortfolioImages();
        console.log('✅ Portfolio data loaded');

        if (cacheInitialized) {
            console.log('💾 Using cache-aware preloading...');
            await preloadAllPortfolioImagesWithCache();
        } else {
            console.log('🌐 Using fallback preloading...');
        await preloadAllPortfolioImages();
        }
        console.log('✅ All images preloaded');
        
        console.log('⚡⚡⚡ ULTRA-LIGHTNING portfolio ready! All images available instantly!');
        
        if (cacheInitialized) {
            addCacheStatusIndicator();
        }

        async function refreshCountsAndSyncCache() {
            try {
                window.__imagesManifest = undefined;
                const categories = Object.keys(portfolioCategories);
                
                await Promise.all(categories.map(async (category) => {
                    const info = portfolioCategories[category];
                    const files = await listImagesInFolder(info.folder, info.extensions);
                    const full = files.map(f => `${info.folder}${f}`);
                    const valid = await verifyImagesExist(full);
                    updatePortfolioCount(category, valid.length);
                    portfolioData[category] = portfolioData[category] || valid.map(p => ({ path: p, name: p.split('/').pop().replace(/\.(png|jpg|jpeg|gif|webp)$/i, ''), category }));
                }));
                
                if (cacheInitialized) {
                    const syncResult = await cacheManager.syncWithManifest();
                    if (syncResult.updated) {
                        console.log(`🔄 Auto-sync: +${syncResult.new} new, -${syncResult.removed} removed`);
                    }
                }
            } catch (e) {
                console.warn('Refresh counts failed:', e);
            }
        }

        setInterval(refreshCountsAndSyncCache, 30000);
    });



    function startBuildUpSequence() {
        setTimeout(() => {
            splashTitle.classList.add('disappearing');
            addColorBtn.classList.add('disappearing');
            overlay.classList.add('animate-grid');
        }, 100);

        setTimeout(() => {
            body.classList.remove('bw-mode');
        }, 1000);

        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 1800);

        setTimeout(() => {
            navbar.classList.add('slide-in');
        }, 1500);

        setTimeout(() => {
            heroContent.classList.add('fly-in-fast');
            setTimeout(() => {
                heroContent.classList.remove('fly-in-fast');
                heroContent.classList.add('fly-in-slow');
                

                setTimeout(() => {
                    body.classList.remove('build-up-mode');
                    buildUpActive = false;
                }, 400);
            }, 600);
        }, 2000);

        setTimeout(() => {
            reviewsSection.classList.add('reveal', 'fade-in');
            setTimeout(() => reviewsSection.classList.add('animate'), 50);
        }, 2600);

        setTimeout(() => {
            portfolio.classList.add('reveal', 'fade-in');
            setTimeout(() => portfolio.classList.add('animate'), 50);
        }, 2800);

        setTimeout(() => {
            achievements.classList.add('reveal', 'fade-in');
            setTimeout(() => achievements.classList.add('animate'), 50);
        }, 3000);

        setTimeout(() => {
            about.classList.add('reveal', 'fade-in');
            setTimeout(() => about.classList.add('animate'), 50);
        }, 3200);

        setTimeout(() => {
            pricing.classList.add('reveal', 'fade-in');
            setTimeout(() => pricing.classList.add('animate'), 50);
        }, 3400);

        setTimeout(() => {
            processSection.classList.add('reveal', 'fade-in');
            setTimeout(() => processSection.classList.add('animate'), 50);
        }, 3600);

        setTimeout(() => {
            contact.classList.add('reveal', 'fade-in');
            setTimeout(() => contact.classList.add('animate'), 50);
        }, 4000);
    }

    addColorBtn.addEventListener('click', startBuildUpSequence);

    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section');

    function setActiveLink() {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (pageYOffset >= sectionTop - 200) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    }

    window.addEventListener('scroll', setActiveLink);

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        if (buildUpActive) return;
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    function animateCounter(element) {
        const target = parseInt(element.getAttribute('data-target'));
        const duration = 2000;
        const increment = target / (duration / 16);
        let current = 0;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            element.textContent = Math.floor(current) + '+';
        }, 16);
    }

    const observer2 = new IntersectionObserver((entries) => {
        if (buildUpActive) return;
        entries.forEach(entry => {
            if (entry.isIntersecting) {

                if (entry.target.classList.contains('portfolio-card') || entry.target.classList.contains('pricing-card')) {
                    const cards = Array.from(entry.target.parentElement.children);
                    const index = cards.indexOf(entry.target);
                    const delay = entry.target.classList.contains('portfolio-card') ? index * 150 : index * 100;
                    setTimeout(() => {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                    }, delay);
                } else {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
                

                if (entry.target.classList.contains('stat-card')) {
                    const counter = entry.target.querySelector('.counter');
                    if (counter && !counter.classList.contains('animated')) {
                        counter.classList.add('animated');
                        setTimeout(() => animateCounter(counter), 200);
                    }
                }
            }
        });
    }, observerOptions);

    const animateElements = document.querySelectorAll('.achievement-card, .portfolio-card, .pricing-card, .stat-card, .process-step, .showcase-item');
    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(50px)';
        el.style.transition = 'all 0.6s ease';
        observer2.observe(el);
    });

    const heroButtons = document.querySelectorAll('.hero-buttons .btn');
    heroButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            if (this.textContent.includes('View My Work')) {
                e.preventDefault();
                document.getElementById('portfolio').scrollIntoView({
                    behavior: 'smooth'
                });
            } else if (this.textContent.includes('Get In Touch')) {
                e.preventDefault();
                document.getElementById('contact').scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });



    let lastScrollTop = 0;

    window.addEventListener('scroll', function() {
        if (buildUpActive) return;
        
        let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > lastScrollTop && scrollTop > 100) {
            navbar.style.transform = 'translateY(-100%)';
        } else {
            navbar.style.transform = 'translateY(0)';
        }
        lastScrollTop = scrollTop;
    });

    navbar.style.transition = 'transform 0.3s ease';

    function addToCart(product) {
        const existingItem = cart.find(item => item.name === product.name);
        
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({
                ...product,
                quantity: 1,
                id: Date.now()
            });
        }
        
        updateCartUI();
        showCartNotification(product.name);
    }

    function removeFromCart(productId) {
        cart = cart.filter(item => item.id !== productId);
        updateCartUI();
    }

    function updateQuantity(productId, change) {
        const item = cart.find(item => item.id === productId);
        if (item) {
            item.quantity += change;
            if (item.quantity <= 0) {
                removeFromCart(productId);
            } else {
                updateCartUI();
            }
        }
    }

    function updateCartUI() {
        cartCount = cart.reduce((total, item) => total + item.quantity, 0);
        const cartCountElement = document.querySelector('.cart-count');
        cartCountElement.textContent = cartCount;
        
        if (cartCount === 0) {
            cartCountElement.style.display = 'none';
        } else {
            cartCountElement.style.display = 'flex';
        }

        const cartItemsContainer = document.getElementById('cart-items');
        const cartTotal = document.getElementById('cart-total');
        const checkoutBtn = document.getElementById('checkout-btn');

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = `
                <div class="empty-cart">
                    <i data-lucide="shopping-cart"></i>
                    <p>Your cart is empty</p>
                </div>
            `;
            cartTotal.textContent = '0.00';
            checkoutBtn.disabled = true;
        } else {
            const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            cartTotal.textContent = total.toFixed(2);
            checkoutBtn.disabled = false;

            cartItemsContainer.innerHTML = cart.map(item => `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <h4>${item.name}</h4>
                        <p>${item.description}</p>
                    </div>
                    <div class="cart-item-controls">
                        <div class="cart-item-price">£${(item.price * item.quantity).toFixed(2)}</div>
                        <div class="quantity-controls">
                            <button class="quantity-btn" onclick="updateQuantity(${item.id}, -1)" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
                            <span class="quantity-display">${item.quantity}</span>
                            <button class="quantity-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
                        </div>
                        <button class="remove-item" onclick="removeFromCart(${item.id})" title="Remove item">×</button>
                    </div>
                </div>
            `).join('');
        }

        lucide.createIcons();
    }

    function showCartNotification(productName) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 30px;
            background: linear-gradient(135deg, #3b82f6, #93c5fd);
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            font-weight: 600;
            z-index: 20000;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3);
        `;
        notification.textContent = `${productName} added to cart!`;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => document.body.removeChild(notification), 300);
        }, 2000);
    }

    function openCart() {
        const cartModal = document.getElementById('cart-modal');
        cartModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function closeCart() {
        const cartModal = document.getElementById('cart-modal');
        cartModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    function clearCart() {
        cart = [];
        updateCartUI();
    }

    function checkout() {
        if (cart.length === 0) return;

        const orderSummary = cart.map(item => 
            `${item.quantity}x ${item.name} - £${(item.price * item.quantity).toFixed(2)}`
        ).join('\n');
        
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        const message = `🛒 **New Order Request**\n\n**Items:**\n${orderSummary}\n\n**Total: £${total.toFixed(2)}**\n\nPlease contact me to proceed with the order!`;
        
        const encodedMessage = encodeURIComponent(message);
        const discordUrl = `https://discord.gg/tcnhqygZN4`;
        
        window.open(discordUrl, '_blank');
        
        setTimeout(() => {
            const confirmClear = confirm('Order sent! Would you like to clear your cart?');
            if (confirmClear) {
                clearCart();
                closeCart();
            }
        }, 1000);
    }

    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('add-to-cart')) {
            e.preventDefault();
            const productCard = e.target.closest('.pricing-card');
            const productData = JSON.parse(productCard.getAttribute('data-product'));
            addToCart(productData);
        }
    });

    document.getElementById('cart-modal').addEventListener('click', function(e) {
        if (e.target.id === 'cart-modal') {
            closeCart();
        }
    });

    window.openCart = openCart;
    window.closeCart = closeCart;
    window.clearCart = clearCart;
    window.checkout = checkout;
    window.updateQuantity = updateQuantity;
    window.removeFromCart = removeFromCart;

    updateCartUI();
});
