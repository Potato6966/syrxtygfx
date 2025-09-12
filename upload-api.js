// Node.js API for handling file uploads
// This would be deployed as a serverless function or API endpoint

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration
const UPLOAD_CONFIG = {
    password: process.env.ADMIN_PASSWORD || 'FullBack11!',
    twoFactorAnswer: process.env.TWO_FACTOR_ANSWER || 'photoshop',
    uploadDir: './uploads',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
};

// Category mapping
const CATEGORIES = {
    'thumbnails': 'Thumbnails/',
    'logos': 'Logos/',
    'product-banners': 'Product banners/',
    'product-boxes': 'Product boxes/'
};

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const category = req.body.category;
        const uploadPath = path.join(UPLOAD_CONFIG.uploadDir, CATEGORIES[category] || '');
        
        try {
            await fs.mkdir(uploadPath, { recursive: true });
            cb(null, uploadPath);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const randomString = crypto.randomBytes(4).toString('hex');
        const extension = path.extname(file.originalname);
        const filename = `${timestamp}_${randomString}${extension}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: UPLOAD_CONFIG.maxFileSize
    },
    fileFilter: (req, file, cb) => {
        if (UPLOAD_CONFIG.allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images are allowed.'), false);
        }
    }
});

// Authentication middleware
function authenticateAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.substring(7);
    const expectedToken = Buffer.from(UPLOAD_CONFIG.password + UPLOAD_CONFIG.twoFactorAnswer).toString('base64');
    
    if (token !== expectedToken) {
        return res.status(401).json({ error: 'Invalid authentication token' });
    }

    next();
}

// Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Authentication endpoint
app.post('/api/auth', (req, res) => {
    const { password, twoFactor } = req.body;
    
    if (password === UPLOAD_CONFIG.password && 
        twoFactor.toLowerCase() === UPLOAD_CONFIG.twoFactorAnswer.toLowerCase()) {
        
        const token = Buffer.from(UPLOAD_CONFIG.password + UPLOAD_CONFIG.twoFactorAnswer).toString('base64');
        res.json({ 
            success: true, 
            token: token,
            message: 'Authentication successful' 
        });
    } else {
        res.status(401).json({ 
            success: false, 
            error: 'Invalid credentials' 
        });
    }
});

// Upload endpoint
app.post('/api/upload', authenticateAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { category } = req.body;
        if (!category || !CATEGORIES[category]) {
            return res.status(400).json({ error: 'Invalid category' });
        }

        const fileInfo = {
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size,
            category: category,
            uploadedAt: new Date().toISOString()
        };

        // Update manifest file
        await updateManifest(category, fileInfo);

        // Trigger website cache refresh
        await triggerCacheRefresh();

        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: fileInfo
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Upload failed: ' + error.message 
        });
    }
});

// Get upload statistics
app.get('/api/stats', authenticateAdmin, async (req, res) => {
    try {
        const stats = {};
        
        for (const [category, folder] of Object.entries(CATEGORIES)) {
            const categoryPath = path.join(UPLOAD_CONFIG.uploadDir, folder);
            try {
                const files = await fs.readdir(categoryPath);
                const totalSize = await getDirectorySize(categoryPath);
                
                stats[category] = {
                    count: files.length,
                    size: totalSize,
                    sizeFormatted: formatBytes(totalSize)
                };
            } catch (error) {
                stats[category] = { count: 0, size: 0, sizeFormatted: '0 B' };
            }
        }

        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get statistics' 
        });
    }
});

// Delete file endpoint
app.delete('/api/file/:category/:filename', authenticateAdmin, async (req, res) => {
    try {
        const { category, filename } = req.params;
        
        if (!CATEGORIES[category]) {
            return res.status(400).json({ error: 'Invalid category' });
        }

        const filePath = path.join(UPLOAD_CONFIG.uploadDir, CATEGORIES[category], filename);
        
        try {
            await fs.unlink(filePath);
            
            // Update manifest
            await updateManifest(category, null, filename);
            
            // Trigger cache refresh
            await triggerCacheRefresh();
            
            res.json({ 
                success: true, 
                message: 'File deleted successfully' 
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.status(404).json({ error: 'File not found' });
            } else {
                throw error;
            }
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Delete failed: ' + error.message 
        });
    }
});

// Helper functions

async function updateManifest(category, fileInfo, deletedFilename = null) {
    const manifestPath = './images-manifest.json';
    
    try {
        let manifest = {};
        try {
            const manifestData = await fs.readFile(manifestPath, 'utf8');
            manifest = JSON.parse(manifestData);
        } catch (error) {
            // Manifest doesn't exist, create new one
        }

        if (!manifest[category]) {
            manifest[category] = [];
        }

        if (deletedFilename) {
            // Remove file from manifest
            manifest[category] = manifest[category].filter(file => file !== deletedFilename);
        } else if (fileInfo) {
            // Add file to manifest
            const filename = path.basename(fileInfo.filename);
            if (!manifest[category].includes(filename)) {
                manifest[category].push(filename);
            }
        }

        // Sort files
        manifest[category].sort();

        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`Manifest updated for category: ${category}`);
    } catch (error) {
        console.error('Failed to update manifest:', error);
    }
}

async function triggerCacheRefresh() {
    try {
        // This could trigger various cache refresh mechanisms:
        
        // 1. Update a cache invalidation timestamp
        const cacheTimestamp = Date.now();
        await fs.writeFile('./cache-timestamp.txt', cacheTimestamp.toString());
        
        // 2. Send webhook to your hosting service (if supported)
        // await sendWebhook();
        
        // 3. Update service worker cache version
        // await updateServiceWorkerCache();
        
        console.log('Cache refresh triggered');
    } catch (error) {
        console.error('Failed to trigger cache refresh:', error);
    }
}

async function getDirectorySize(dirPath) {
    try {
        const files = await fs.readdir(dirPath);
        let totalSize = 0;
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
                totalSize += stats.size;
            }
        }
        
        return totalSize;
    } catch (error) {
        return 0;
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false, 
                error: 'File too large. Maximum size is 10MB.' 
            });
        }
    }
    
    console.error('API Error:', error);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`SYRXTY Upload API running on port ${PORT}`);
    console.log(`Admin password: ${UPLOAD_CONFIG.password}`);
    console.log(`Two-factor answer: ${UPLOAD_CONFIG.twoFactorAnswer}`);
});

module.exports = app;
