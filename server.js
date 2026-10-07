const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 4000;
const CONFIG_FILE = path.join(__dirname, 'config.json');
const DATA_FILE = path.join(__dirname, 'data.json');

// Memory state
let config = {
    enableWhitelist: true,
    allowedIps: ['127.0.0.1', '::1'],
    elasticIpNotes: 'Configure your AWS Elastic IP or client static IP here.'
};

let records = [];
let serverPublicIp = 'Detecting...';

// Load config from file
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
            config = JSON.parse(raw);
        }
    } catch (e) {
        console.error('Failed to read config.json, using defaults:', e.message);
    }
}

// Save config to file
function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save config.json:', e.message);
    }
}

// Load CRUD records from file
function loadRecords() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            records = JSON.parse(raw);
        } else {
            records = [];
        }
    } catch (e) {
        console.error('Failed to read data.json:', e.message);
        records = [];
    }
}

// Save CRUD records to file
function saveRecords() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save data.json:', e.message);
    }
}

// Discover local network IPv4 addresses
function getLocalNetworkIps() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips;
}

// Fetch public IP in background
async function fetchServerPublicIp() {
    try {
        const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        serverPublicIp = data.ip;
        console.log(`[Network] Detected Server Public IP: ${serverPublicIp}`);
    } catch (e) {
        serverPublicIp = 'Unavailable (Offline)';
        console.warn('[Network] Could not fetch public IP:', e.message);
    }
}

// Initialize config & auto-detect IP
const localIps = getLocalNetworkIps();
if (!fs.existsSync(CONFIG_FILE)) {
    config.allowedIps = ['127.0.0.1', '::1', ...localIps];
    saveConfig();
} else {
    loadConfig();
}
loadRecords();
fetchServerPublicIp();

// Extract client IP from incoming request
function getClientIp(req) {
    // Check if test simulation header is provided (for local AWS simulation testing)
    if (req.headers['x-simulated-ip']) {
        return req.headers['x-simulated-ip'].trim();
    }

    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
        const parts = xForwardedFor.split(',');
        return parts[0].trim();
    }

    const xRealIp = req.headers['x-real-ip'];
    if (xRealIp) {
        return xRealIp.trim();
    }

    return req.socket.remoteAddress || '127.0.0.1';
}

// Normalize IP address (handle IPv6 prefix, loopback)
function normalizeIp(rawIp) {
    if (!rawIp) return '127.0.0.1';
    let ip = rawIp.trim();

    // Remove IPv4 mapped to IPv6 prefix (e.g. ::ffff:192.168.1.22 -> 192.168.1.22)
    if (ip.startsWith('::ffff:')) {
        ip = ip.replace('::ffff:', '');
    }

    return ip;
}

// Check if IP is in whitelist (Strict exact match)
function isIpAllowed(rawIp) {
    loadConfig(); // Reload dynamically so changes to config.json take effect immediately
    if (!config.enableWhitelist) return true;

    const normalized = normalizeIp(rawIp);
    const allowedList = (config.allowedIps || []).map(normalizeIp);
    return allowedList.includes(normalized);
}

// Helper: send JSON response with standard CORS
function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-simulated-ip, x-forwarded-for'
    });
    res.end(JSON.stringify(data, null, 2));
}

// Helper: parse JSON request body
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > 1e6) { // 1MB limit
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(new Error('Invalid JSON format'));
            }
        });
        req.on('error', err => reject(err));
    });
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-simulated-ip, x-forwarded-for'
        });
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;
    const clientIp = getClientIp(req);
    const normalizedClientIp = normalizeIp(clientIp);

    // -------------------------------------------------------------
    // PROTECTED API ROUTE: /api/records (CRUD Operations)
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/records')) {
        const allowed = isIpAllowed(clientIp);

        // IP Whitelist Security Gate
        if (!allowed) {
            console.warn(`[BLOCKED 403] Unauthorized access attempt from IP: ${clientIp} to ${req.method} ${pathname}`);
            sendJSON(res, 403, {
                success: false,
                status: 403,
                error: 'Forbidden: IP Not Authorized',
                message: `Access denied. Your IP address (${normalizedClientIp}) is not present in the allowed static/Elastic IP whitelist.`,
                clientIp: normalizedClientIp,
                rawClientIp: clientIp,
                allowedIps: config.allowedIps,
                timestamp: new Date().toISOString(),
                tip: 'Add your IP to config.json or via the System Dashboard to gain access.'
            });
            return;
        }

        // CRUD: GET /api/records (List All Records)
        if (pathname === '/api/records' && req.method === 'GET') {
            const search = parsedUrl.searchParams.get('search');
            let result = [...records];
            if (search) {
                const s = search.toLowerCase();
                result = result.filter(r => 
                    r.name.toLowerCase().includes(s) ||
                    r.category.toLowerCase().includes(s) ||
                    r.environment.toLowerCase().includes(s)
                );
            }
            sendJSON(res, 200, {
                success: true,
                count: result.length,
                callerIp: normalizedClientIp,
                data: result
            });
            return;
        }

        // CRUD: GET /api/records/:id (Get Single Record)
        const idMatch = pathname.match(/^\/api\/records\/([a-zA-Z0-9_-]+)$/);
        if (idMatch && req.method === 'GET') {
            const id = idMatch[1];
            const record = records.find(r => r.id === id);
            if (!record) {
                sendJSON(res, 404, { success: false, error: 'Record not found', id });
                return;
            }
            sendJSON(res, 200, { success: true, callerIp: normalizedClientIp, data: record });
            return;
        }

        // CRUD: POST /api/records (Create New Record)
        if (pathname === '/api/records' && req.method === 'POST') {
            try {
                const body = await parseBody(req);
                if (!body.name) {
                    sendJSON(res, 400, { success: false, error: 'Validation Error: "name" field is required' });
                    return;
                }

                const newRecord = {
                    id: body.id || 'rec_' + Date.now().toString(36),
                    name: body.name.trim(),
                    category: body.category || 'General',
                    environment: body.environment || 'AWS-Production',
                    status: body.status || 'Active',
                    ipBinding: body.ipBinding || `Created by IP: ${normalizedClientIp}`,
                    description: body.description || '',
                    createdAt: new Date().toISOString()
                };

                records.unshift(newRecord);
                saveRecords();

                console.log(`[CRUD CREATE] Record created by authorized IP ${normalizedClientIp}: ${newRecord.id}`);
                sendJSON(res, 201, {
                    success: true,
                    message: 'Record created successfully',
                    callerIp: normalizedClientIp,
                    data: newRecord
                });
            } catch (err) {
                sendJSON(res, 400, { success: false, error: err.message });
            }
            return;
        }

        // CRUD: PUT /api/records/:id (Update Record)
        if (idMatch && req.method === 'PUT') {
            try {
                const id = idMatch[1];
                const index = records.findIndex(r => r.id === id);
                if (index === -1) {
                    sendJSON(res, 404, { success: false, error: 'Record not found for update', id });
                    return;
                }

                const body = await parseBody(req);
                records[index] = {
                    ...records[index],
                    ...body,
                    id: records[index].id, // Prevent ID overwrite
                    updatedAt: new Date().toISOString(),
                    lastModifiedByIp: normalizedClientIp
                };

                saveRecords();
                console.log(`[CRUD UPDATE] Record ${id} updated by authorized IP ${normalizedClientIp}`);
                sendJSON(res, 200, {
                    success: true,
                    message: 'Record updated successfully',
                    callerIp: normalizedClientIp,
                    data: records[index]
                });
            } catch (err) {
                sendJSON(res, 400, { success: false, error: err.message });
            }
            return;
        }

        // CRUD: DELETE /api/records/:id (Delete Record)
        if (idMatch && req.method === 'DELETE') {
            const id = idMatch[1];
            const index = records.findIndex(r => r.id === id);
            if (index === -1) {
                sendJSON(res, 404, { success: false, error: 'Record not found for deletion', id });
                return;
            }

            const deleted = records.splice(index, 1)[0];
            saveRecords();
            console.log(`[CRUD DELETE] Record ${id} deleted by authorized IP ${normalizedClientIp}`);
            sendJSON(res, 200, {
                success: true,
                message: 'Record deleted successfully',
                callerIp: normalizedClientIp,
                data: deleted
            });
            return;
        }
    }

    // -------------------------------------------------------------
    // SYSTEM & VERIFICATION ENDPOINTS (Open for diagnostics & control)
    // -------------------------------------------------------------

    // GET /api/system/network-info
    if (pathname === '/api/system/network-info' && req.method === 'GET') {
        const allowed = isIpAllowed(clientIp);
        sendJSON(res, 200, {
            success: true,
            detectedClientIp: normalizedClientIp,
            rawClientIp: clientIp,
            isAccessGranted: allowed,
            enableWhitelist: config.enableWhitelist,
            serverPublicIp: serverPublicIp,
            serverLocalIps: getLocalNetworkIps(),
            allowedIps: config.allowedIps,
            notes: config.elasticIpNotes,
            serverTime: new Date().toISOString()
        });
        return;
    }

    // POST /api/system/allowed-ips (Manage Whitelist dynamically)
    if (pathname === '/api/system/allowed-ips' && req.method === 'POST') {
        try {
            const body = await parseBody(req);
            const { action, ip, allowedIps, enableWhitelist } = body;

            if (typeof enableWhitelist === 'boolean') {
                config.enableWhitelist = enableWhitelist;
            }

            if (Array.isArray(allowedIps)) {
                config.allowedIps = [...new Set(allowedIps.map(normalizeIp))];
            } else if (action === 'add' && ip) {
                const clean = normalizeIp(ip);
                if (!config.allowedIps.includes(clean)) {
                    config.allowedIps.push(clean);
                }
            } else if (action === 'remove' && ip) {
                const clean = normalizeIp(ip);
                config.allowedIps = config.allowedIps.filter(item => normalizeIp(item) !== clean);
            }

            saveConfig();
            sendJSON(res, 200, {
                success: true,
                message: 'Whitelist configuration updated',
                config
            });
        } catch (err) {
            sendJSON(res, 400, { success: false, error: err.message });
        }
        return;
    }

    // POST /api/system/reset-demo (Reset sample records and auto-restore current IP)
    if (pathname === '/api/system/reset-demo' && req.method === 'POST') {
        const local = getLocalNetworkIps();
        config.enableWhitelist = true;
        config.allowedIps = ['127.0.0.1', '::1', ...local];
        if (serverPublicIp && !serverPublicIp.includes('Unavailable')) {
            config.allowedIps.push(serverPublicIp);
        }
        config.allowedIps = [...new Set(config.allowedIps)];
        saveConfig();

        // Restore initial default records
        records = [
            {
                id: 'rec_001',
                name: 'AWS EC2 Cron Worker',
                category: 'Background Task',
                environment: 'AWS-Mumbai-ap-south-1',
                status: 'Active',
                ipBinding: 'Elastic IP (Allocated)',
                description: 'Daily automated billing reconciliation worker instance.',
                createdAt: new Date().toISOString()
            },
            {
                id: 'rec_002',
                name: 'Payment Gateway Webhook Listener',
                category: 'API Service',
                environment: 'Production',
                status: 'Active',
                ipBinding: 'Static IP Whitelisted',
                description: 'Secure listener for incoming banking settlement webhooks.',
                createdAt: new Date().toISOString()
            }
        ];
        saveRecords();

        sendJSON(res, 200, {
            success: true,
            message: 'System reset to defaults with current system IP restored in whitelist',
            config,
            records
        });
        return;
    }

    // GET /api/system/ping (Liveness Probe)
    if (pathname === '/api/system/ping' && req.method === 'GET') {
        sendJSON(res, 200, { pong: true, time: Date.now() });
        return;
    }

    // -------------------------------------------------------------
    // STATIC ASSETS: Serve public/index.html & UI assets
    // -------------------------------------------------------------
    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    fs.readFile(filePath, (err, content) => {
        if (err) {
            const indexHtml = path.join(__dirname, 'public', 'index.html');
            fs.readFile(indexHtml, (err2, indexContent) => {
                if (err2) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 Not Found');
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(indexContent);
                }
            });
            return;
        }

        const ext = path.extname(filePath);
        let contentType = 'text/html';
        if (ext === '.js') contentType = 'text/javascript';
        else if (ext === '.css') contentType = 'text/css';
        else if (ext === '.json') contentType = 'application/json';
        else if (ext === '.svg') contentType = 'image/svg+xml';
        else if (ext === '.png') contentType = 'image/png';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🛡️  Static & AWS Elastic IP Restricted CRUD API Server`);
    console.log(`🌐 Dashboard:    http://localhost:${PORT}`);
    console.log(`📡 Local Network: http://${localIps[0] || '127.0.0.1'}:${PORT}`);
    console.log(`🔒 Allowed IPs:  [ ${config.allowedIps.join(', ')} ]`);
    console.log(`======================================================\n`);
});
