// Canvas-based Snow Animation
(function() {
    const canvas = document.getElementById('snow-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let snowflakes = [];
    let animationId;
    
    // Set canvas size
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    // Snowflake class
    class Snowflake {
        constructor() {
            this.reset();
        }
        
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * -canvas.height;
            this.radius = Math.random() * 3 + 1;
            this.speed = Math.random() * 1 + 0.5;
            this.wind = Math.random() * 0.5 - 0.25;
            this.opacity = Math.random() * 0.6 + 0.4;
        }
        
        update() {
            this.y += this.speed;
            this.x += this.wind;
            
            // Reset if snowflake goes off screen
            if (this.y > canvas.height) {
                this.y = -10;
                this.x = Math.random() * canvas.width;
            }
            
            if (this.x > canvas.width) {
                this.x = 0;
            } else if (this.x < 0) {
                this.x = canvas.width;
            }
        }
        
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
    
    // Initialize snowflakes
    function init() {
        resizeCanvas();
        snowflakes = [];
        const snowflakeCount = Math.floor((canvas.width * canvas.height) / 8000);
        for (let i = 0; i < snowflakeCount; i++) {
            snowflakes.push(new Snowflake());
        }
    }
    
    // Animation loop
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        snowflakes.forEach(snowflake => {
            snowflake.update();
            snowflake.draw();
        });
        
        animationId = requestAnimationFrame(animate);
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        resizeCanvas();
        // Adjust snowflake count on resize
        const targetCount = Math.floor((canvas.width * canvas.height) / 8000);
        while (snowflakes.length < targetCount) {
            snowflakes.push(new Snowflake());
        }
        while (snowflakes.length > targetCount) {
            snowflakes.pop();
        }
    });
    
    // Start animation
    init();
    animate();
    
    // Cleanup function
    window.stopSnowAnimation = function() {
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
    };
})();
