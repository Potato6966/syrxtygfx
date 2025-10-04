document.addEventListener('DOMContentLoaded', function() {
    function init3DTiltEffect() {
        const cards = document.querySelectorAll('.portfolio-card, .pricing-card, .achievement-card, .gallery-item, .contact-card');

        cards.forEach(card => {
            let ticking = false;
            let hovering = false;

            card.style.willChange = 'transform';

            card.addEventListener('pointerenter', () => {
                hovering = true;
            });

            card.addEventListener('pointerleave', () => {
                hovering = false;
                card.style.transform = '';
            });

            card.addEventListener('pointermove', (e) => {
                if (!hovering) return;
                if (ticking) return;

                const run = () => {
                    const rect = card.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;

                    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
                        card.style.transform = '';
                        ticking = false;
                        return;
                    }

                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;

                    const rotateX = ((y - centerY) / centerY) * 8;
                    const rotateY = ((centerX - x) / centerX) * 8;

                    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px) scale(1.03)`;

                    const percentX = (x / rect.width) * 100;
                    const percentY = (y / rect.height) * 100;
                    const lightAngle = Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
                    card.style.setProperty('--mouse-x', `${percentX}%`);
                    card.style.setProperty('--mouse-y', `${percentY}%`);
                    card.style.setProperty('--light-angle', `${lightAngle + 90}deg`);

                    ticking = false;
                };

                ticking = true;
                requestAnimationFrame(run);
            });
        });
    }
    async function createPortfolioCarousels() {
        const portfolioCards = document.querySelectorAll('.portfolio-card');
        
        for (const card of portfolioCards) {
            const category = card.getAttribute('data-category');
            if (!category) continue;
            
            const previewElement = card.querySelector('.portfolio-preview');
            if (!previewElement) continue;
            const categoryImages = await getSampleImagesForCategory(category);
            if (categoryImages.length === 0) continue;
            
            const carouselContainer = document.createElement('div');
            carouselContainer.className = 'portfolio-preview-carousel';
            
            const carouselTrack = document.createElement('div');
            carouselTrack.className = 'portfolio-carousel-track';
            const imagesToShow = categoryImages.slice(0, Math.min(8, categoryImages.length));
            imagesToShow.forEach(imagePath => {
                const carouselItem = document.createElement('div');
                carouselItem.className = 'portfolio-carousel-item';
                
                const img = document.createElement('img');
                img.src = imagePath;
                img.alt = 'Portfolio Preview';
                img.loading = 'lazy';
                img.style.opacity = '0';
                
                img.onload = () => {
                    img.style.transition = 'opacity 0.5s ease';
                    img.style.opacity = '1';
                };
                
                carouselItem.appendChild(img);
                carouselTrack.appendChild(carouselItem);
            });
            
            imagesToShow.forEach(imagePath => {
                const carouselItem = document.createElement('div');
                carouselItem.className = 'portfolio-carousel-item';
                
                const img = document.createElement('img');
                img.src = imagePath;
                img.alt = 'Portfolio Preview';
                img.loading = 'lazy';
                img.style.opacity = '0';
                
                img.onload = () => {
                    img.style.transition = 'opacity 0.5s ease';
                    img.style.opacity = '1';
                };
                
                carouselItem.appendChild(img);
                carouselTrack.appendChild(carouselItem);
            });
            const overlay = document.createElement('div');
            overlay.className = 'portfolio-carousel-overlay';
            overlay.innerHTML = '<span>Click to see more</span>';
            
            carouselContainer.appendChild(carouselTrack);
            carouselContainer.appendChild(overlay);
            
            previewElement.insertBefore(carouselContainer, previewElement.firstChild);
            
            let currentIndex = 0;
            const items = carouselTrack.querySelectorAll('.portfolio-carousel-item');
            if (items.length > 0) {
                items[0].classList.add('active');
                
                setInterval(() => {
                    items[currentIndex].classList.remove('active');
                    
                    currentIndex = (currentIndex + 1) % items.length;
                    
                    setTimeout(() => {
                        items[currentIndex].classList.add('active');
                    }, 100);
                }, 4000);
            }
        }
    }
    async function getSampleImagesForCategory(category) {
        const categoryFolders = {
            'thumbnails': 'Thumbnails/',
            'logos': 'Logos/',
            'product-banners': 'Product banners/',
            'product-boxes': 'Product boxes/'
        };
        
        const folder = categoryFolders[category];
        if (!folder) return [];
        try {
            const manifest = await fetch('images-manifest.json?cb=' + Date.now()).then(r => r.json());
            const categoryKey = category;
            if (manifest[categoryKey] && manifest[categoryKey].length > 0) {
                return manifest[categoryKey].slice(0, 8).map(filename => folder + filename);
            }
        } catch (e) {
            
        }
        const fallbackSamples = {
            'thumbnails': [
                'Thumbnails/1401907185612755025_001.png',
                'Thumbnails/1401907185612755025_002.png',
                'Thumbnails/1401907185612755025_003.png',
                'Thumbnails/1401907185612755025_004.png',
                'Thumbnails/1401907185612755025_005.png',
                'Thumbnails/1401907185612755025_006.png',
                'Thumbnails/1401907222027702423_001.png',
                'Thumbnails/1401907222027702423_002.png'
            ],
            'logos': [
                'Logos/1401907146664181951_002.png',
                'Logos/1401907146664181951_003.png',
                'Logos/1401907146664181951_004.png',
                'Logos/1401907146664181951_005.png',
                'Logos/1401907146664181951_006.png',
                'Logos/1401907146664181951_001.jpg'
            ],
            'product-banners': [
                'Product banners/Products_Banner.png',
                'Product banners/Venza_Fortnite_Private.png',
                'Product banners/arena fn priv.png',
                'Product banners/precise_bo6_internal.png',
                'Product banners/Venza_Fortnite_Ultimate.png',
                'Product banners/arena fn ultimate.png',
                'Product banners/PRecise_fn_priv.png',
                'Product banners/Venza_Spoofer.png'
            ],
            'product-boxes': [
                'Product boxes/ZYRO_fn_private.png',
                'Product boxes/ZYRO_fn_ultimate.png',
                'Product boxes/neat_fn_private.png',
                'Product boxes/zylo_fn_ultimate.png',
                'Product boxes/ZYRO_fn_og.png',
                'Product boxes/ZYRO_fn_pro.png',
                'Product boxes/zylo_perm_spoofer.png',
                'Product boxes/neat_temp_spf.png'
            ]
        };
        
        return fallbackSamples[category] || [];
    }
    function initParallaxScroll() {
        let ticking = false;
        
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const scrolled = window.pageYOffset;
                    const heroContent = document.querySelector('.hero-content');
                    if (heroContent) {
                        heroContent.style.transform = `translateY(${scrolled * 0.3}px) translateZ(0)`;
                        heroContent.style.opacity = Math.max(0, 1 - scrolled / 600);
                    }
                    const heroBg = document.querySelector('.hero-bg');
                    if (heroBg) {
                        heroBg.style.transform = `translateY(${scrolled * 0.5}px) scale(1.1)`;
                    }
                    const sections = document.querySelectorAll('section');
                    sections.forEach((section, index) => {
                        const rect = section.getBoundingClientRect();
                        const sectionCenter = rect.top + rect.height / 2;
                        const windowCenter = window.innerHeight / 2;
                        const distance = Math.abs(sectionCenter - windowCenter);
                        const maxDistance = window.innerHeight;
                        const scale = 1 - (distance / maxDistance) * 0.05;
                        
                        if (rect.top < window.innerHeight && rect.bottom > 0) {
                            section.style.transform = `scale(${Math.max(0.95, scale)}) translateZ(0)`;
                        }
                    });
                    
                    ticking = false;
                });
                
                ticking = true;
            }
        });
    }
    function initMagneticButtons() {
        const buttons = document.querySelectorAll('.btn, .cart-button');
        
        buttons.forEach(button => {
            button.addEventListener('mousemove', (e) => {
                const rect = button.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                
                button.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px) scale(1.05)`;
            });
            
            button.addEventListener('mouseleave', () => {
                button.style.transform = '';
            });
        });
    }
    function initRevealAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0) translateZ(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);
        
        const elementsToReveal = document.querySelectorAll('.portfolio-card, .pricing-card, .achievement-card, .stat-card, .process-step, .contact-card');
        elementsToReveal.forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(50px) translateZ(-20px)';
            el.style.transition = 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
            observer.observe(el);
        });
    }
    function enhanceMouseLight() {
        const mouseLight = document.getElementById('mouseLight');
        if (!mouseLight) return;
        
        let mouseX = 0;
        let mouseY = 0;
        let lightX = 0;
        let lightY = 0;
        
        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });
        
        function updateLightPosition() {
            const ease = 0.12;
            lightX += (mouseX - lightX) * ease;
            lightY += (mouseY - lightY) * ease;
            
            mouseLight.style.left = lightX - 200 + 'px';
            mouseLight.style.top = lightY - 200 + 'px';
            const scrollDepth = window.pageYOffset / (document.body.scrollHeight - window.innerHeight);
            const scale = 1 + scrollDepth * 0.3;
            mouseLight.style.transform = `scale(${scale})`;
            
            requestAnimationFrame(updateLightPosition);
        }
        
        updateLightPosition();
    }
    function initStaggeredGalleryAnimation() {
        const galleryObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry, index) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0) scale(1)';
                    }, index * 50);
                    galleryObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        const modalObserver = new MutationObserver(() => {
            const galleryItems = document.querySelectorAll('.gallery-item');
            galleryItems.forEach((item, index) => {
                item.style.opacity = '0';
                item.style.transform = 'translateY(30px) scale(0.9)';
                item.style.transition = `all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${index * 0.05}s`;
                galleryObserver.observe(item);
            });
        });
        
        const galleryContainer = document.getElementById('gallery-container');
        if (galleryContainer) {
            modalObserver.observe(galleryContainer, { childList: true, subtree: true });
        }
    }
    function initAll() {
        
        
        setTimeout(() => {
            init3DTiltEffect();
            initMagneticButtons();
            initRevealAnimations();
            enhanceMouseLight();
            initStaggeredGalleryAnimation();
            setTimeout(() => {
                createPortfolioCarousels();
            }, 2000);
            setTimeout(() => {
                initParallaxScroll();
            }, 500);
        }, 1000);
    }
    
    initAll();
});
window.refresh3DEffects = function() {
    const cards = document.querySelectorAll('.portfolio-card, .pricing-card, .achievement-card, .gallery-item, .contact-card');
    cards.forEach(card => {
        card.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
    });
};
