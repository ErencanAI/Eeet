
'use strict';

/**
 * PhoneRescue Ultra — Stable Server
 * Node.js 18+ | Render | No external dependencies
 *
 * Start: npm start
 * Static files: project root (index.html)
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 10000;
const HOST = '0.0.0.0';
const ROOT = path.resolve(__dirname);
const MAX_BODY = 1024 * 1024;
const REPORT_TTL = 60 * 60 * 1000;
const reports = new Map();
const rateLimits = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2'
};

const devices = [
  { id: 'iphone-3g', name: 'iPhone 3G', brand: 'Apple', type: 'phone', usbSupport: 'limited' },
  { id: 'iphone-3gs', name: 'iPhone 3GS', brand: 'Apple', type: 'phone', usbSupport: 'limited' },
  { id: 'iphone-4', name: 'iPhone 4', brand: 'Apple', type: 'phone', usbSupport: 'limited' },
  { id: 'iphone-4s', name: 'iPhone 4s', brand: 'Apple', type: 'phone', usbSupport: 'limited' },
  { id: 'iphone-5', name: 'iPhone 5', brand: 'Apple', type: 'phone', usbSupport: 'limited' },
  { id: 'iphone-6', name: 'iPhone 6', brand: 'Apple', type: 'phone', usbSupport: 'limited' },
  { id: 'iphone', name: 'Other iPhone', brand: 'Apple', type: 'phone', usbSupport: 'limited' },
  { id: 'samsung', name: 'Samsung Galaxy', brand: 'Samsung', type: 'phone', usbSupport: 'device-dependent' },
  { id: 'xiaomi', name: 'Xiaomi', brand: 'Xiaomi', type: 'phone', usbSupport: 'device-dependent' },
  { id: 'android', name: 'Other Android', brand: 'Android', type: 'phone', usbSupport: 'device-dependent' },
  { id: 'other', name: 'Other device', brand: 'Other', type: 'device', usbSupport: 'unknown' }
];

const issues = [
  {
    id: 'battery',
    title: 'Battery drains quickly',
    keywords: ['battery', 'drain', 'power', 'charge', 'pil', 'şarj', 'batarya'],
    checks: [
      'Check battery condition in the device settings if available.',
      'Look for apps consuming unusually high power.',
      'Try a known-good compatible charging cable and adapter.'
    ],
    severity: 'medium'
  },
  {
    id: 'charging',
    title: 'Device will not charge',
    keywords: ['charging', 'charge', 'charging port', 'şarj olmuyor', 'şarj girişi'],
    checks: [
      'Inspect the charging cable and adapter for visible damage.',
      'Try a compatible, known-good power source.',
      'Check the port visually; do not insert metal objects or liquids.',
      'If the port is damaged or the device heats up, stop charging and seek repair.'
    ],
    severity: 'medium'
  },
  {
    id: 'overheating',
    title: 'Device gets too hot',
    keywords: ['hot', 'heat', 'overheat', 'ısınma', 'ısınıyor'],
    checks: [
      'Stop demanding tasks and let the device cool naturally.',
      'Disconnect the charger if it is unusually hot.',
      'Do not put the device in a refrigerator or freezer.',
      'If swelling, smoke or a burning smell occurs, stop using it and seek professional help.'
    ],
    severity: 'high'
  },
  {
    id: 'slow',
    title: 'Device is slow or freezes',
    keywords: ['slow', 'freeze', 'lag', 'crash', 'donma', 'yavaş', 'kasiyor', 'kasıyor'],
    checks: [
      'Restart the device normally if possible.',
      'Check available storage space.',
      'Update apps and the operating system only if compatible.',
      'Back up important data before advanced troubleshooting.'
    ],
    severity: 'low'
  },
  {
    id: 'network',
    title: 'Network or Wi-Fi problems',
    keywords: ['wifi', 'wi-fi', 'network', 'internet', 'signal', 'şebeke', 'internet yok'],
    checks: [
      'Check whether other devices can connect to the same network.',
      'Toggle Wi-Fi or airplane mode using the normal settings.',
      'Restart the router if the problem affects multiple devices.',
      'Check the SIM and carrier status if mobile service is affected.'
    ],
    severity: 'low'
  },
  {
    id: 'screen',
    title: 'Screen or touch problems',
    keywords: ['screen', 'display', 'touch', 'black screen', 'ekran', 'dokunmatik'],
    checks: [
      'Check whether the device responds to its normal buttons.',
      'Connect a known-good charger briefly if the battery may be empty.',
      'Avoid pressing hard on a cracked or damaged screen.',
      'Seek repair if the display remains black or touch input fails.'
    ],
    severity: 'medium'
  },
  {
    id: 'usb',
    title: 'USB connection not detected',
    keywords: ['usb', 'computer', 'pc', 'detected', 'recognize', 'bağlanmıyor', 'tanımıyor'],
    checks: [
      'Try a compatible data cable; some cables only provide charging.',
      'Try another USB port and restart the computer if appropriate.',
      'Unlock the phone and approve any connection prompt.',
      'On Android, check USB mode and developer settings only when needed.',
      'Older iPhones may require compatible legacy drivers and software.'
    ],
    severity: 'medium'
  },
  {
    id: 'boot',
    title: 'Device will not start',
    keywords: ['boot', 'startup', 'start', 'power on', 'açılmıyor', 'başlamıyor'],
    checks: [
      'Charge with a known-good compatible charger for a short period.',
      'Try the manufacturer-recommended button restart procedure for the exact model.',
      'Check for visible signs of physical or liquid damage.',
      'Avoid restore or factory-reset actions if you need to preserve data.'
    ],
    severity: 'medium'
  },
  {
    id: 'audio',
    title: 'Speaker or microphone problems',
    keywords: ['speaker', 'microphone', 'sound', 'audio', 'ses', 'mikrofon'],
    checks: [
      'Check volume, mute and audio output settings.',
      'Test with another app or a normal phone call.',
      'Disconnect Bluetooth audio devices and test again.',
      'Seek service if the issue persists after basic checks.'
    ],
    severity: 'low'
  }
];

function send(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function sendError(res, status, code, message) {
  send(res, status, { ok: false, error: { code, message } });
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function getClientKey(req) {
  // Use the direct connection address; do not trust arbitrary forwarded IP headers.
  return req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(req, res) {
  const now = Date.now();
  const key = getClientKey(req);
  let entry = rateLimits.get(key);

  if (!entry || now - entry.start > 60_000) {
    entry = { start: now, count: 0 };
    rateLimits.set(key, entry);
  }

  entry.count += 1;

  if (entry.count > 180) {
    sendError(res, 429, 'RATE_LIMIT', 'Too many requests. Please try again shortly.');
    return false;
  }

  return true;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';
    let finished = false;

    req.on('data', chunk => {
      if (finished) return;
      size += chunk.length;

      if (size > MAX_BODY) {
        finished = true;
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.resume();
        return;
      }

      body += chunk.toString('utf8');
    });

    req.on('end', () => {
      if (finished) return;
      if (!body.trim()) return resolve({});

      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(Object.assign(new Error('JSON body must be an object.'), { status: 400 }));
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('Invalid JSON body.'), { status: 400 }));
      }
    });

    req.on('error', err => {
      if (!finished) reject(err);
    });
  });
}

function cleanText(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\0/g, '').slice(0, maxLength);
}

function findDevice(id) {
  return devices.find(device => device.id === id);
}

function analyzeSymptoms(input) {
  const raw = Array.isArray(input)
    ? input.filter(v => typeof v === 'string').join(' ')
    : typeof input === 'string' ? input : '';

  const text = raw.toLocaleLowerCase('tr-TR');
  const matched = issues.filter(issue =>
    issue.keywords.some(keyword => text.includes(keyword.toLocaleLowerCase('tr-TR')))
  );

  return matched.map(issue => ({
    issueId: issue.id,
    title: issue.title,
    severity: issue.severity,
    confidence: 'keyword-match',
    checks: issue.checks
  }));
}

function createReport(payload) {
  const id = crypto.randomUUID();
  const deviceId = cleanText(payload.deviceId, 80);
  const device = findDevice(deviceId);
  const symptoms = Array.isArray(payload.symptoms)
    ? payload.symptoms.filter(v => typeof v === 'string').map(v => cleanText(v, 250)).slice(0, 30)
    : cleanText(payload.symptoms, 2000);

  const observations = cleanText(payload.observations, 2000);
  const searchableText = [
    ...(Array.isArray(symptoms) ? symptoms : [symptoms]),
    observations
  ].join(' ');

  const result = {
    id,
    createdAt: new Date().toISOString(),
    device: device || {
      id: deviceId || 'unknown',
      name: 'Unspecified device',
      brand: 'Unknown',
      usbSupport: 'unknown'
    },
    symptoms,
    observations,
    results: analyzeSymptoms(searchableText),
    limitations: [
      'This report is based on the symptoms entered by the user.',
      'No physical hardware test or USB diagnostic scan was performed.',
      'Results are troubleshooting suggestions, not a confirmed repair diagnosis.'
    ]
  };

  reports.set(id, { result, expiresAt: Date.now() + REPORT_TTL });
  return result;
}

function getGuide(deviceId) {
  const device = findDevice(deviceId);
  if (!device) return null;

  return {
    device,
    issues: issues.map(issue => ({
      id: issue.id,
      title: issue.title,
      severity: issue.severity,
      checks: issue.checks
    })),
    usbNotes: [
      'A browser or server cannot automatically inspect every phone component.',
      'USB access depends on the operating system, browser, drivers and device permissions.',
      'Legacy iPhones may need compatible desktop software for advanced diagnostics.'
    ]
  };
}

function api(req, res, url) {
  const pathname = url.pathname;
  const method = req.method;

  if (method === 'GET' && pathname === '/api') {
    return send(res, 200, {
      ok: true,
      name: 'PhoneRescue Ultra',
      version: '4.1.0',
      status: 'online',
      docs: [
        'GET /api/health',
        'GET /api/ready',
        'GET /api/v1/devices',
        'GET /api/v1/issues',
        'GET /api/v1/search?q=charging',
        'GET /api/v1/guides/iphone-3gs',
        'POST /api/v1/diagnose',
        'GET /api/v1/reports/:reportId'
      ]
    });
  }

  if (method === 'GET' && pathname === '/api/health') {
    return send(res, 200, { ok: true, status: 'healthy', time: new Date().toISOString() });
  }

  if (method === 'GET' && pathname === '/api/ready') {
    return send(res, 200, { ok: true, ready: true });
  }

  if (method === 'GET' && pathname === '/api/v1/devices') {
    return send(res, 200, { ok: true, count: devices.length, devices });
  }

  if (method === 'GET' && pathname === '/api/v1/issues') {
    return send(res, 200, {
      ok: true,
      count: issues.length,
      issues: issues.map(({ id, title, severity, checks }) => ({
        id, title, severity, checks
      }))
    });
  }

  if (method === 'GET' && pathname === '/api/v1/search') {
    const q = cleanText(url.searchParams.get('q') || '', 120)
      .toLocaleLowerCase('tr-TR');

    if (!q) {
      return send(res, 200, { ok: true, query: '', count: 0, results: [] });
    }

    const results = issues.filter(issue =>
      issue.title.toLocaleLowerCase('tr-TR').includes(q) ||
      issue.keywords.some(k => k.toLocaleLowerCase('tr-TR').includes(q)) ||
      issue.checks.some(c => c.toLocaleLowerCase('tr-TR').includes(q))
    );

    return send(res, 200, {
      ok: true,
      query: q,
      count: results.length,
      results
    });
  }

  const guideMatch = pathname.match(/^\/api\/v1\/guides\/([a-z0-9-]+)$/i);
  if (method === 'GET' && guideMatch) {
    const guide = getGuide(guideMatch[1]);
    if (!guide) return sendError(res, 404, 'DEVICE_NOT_FOUND', 'Device guide not found.');
    return send(res, 200, { ok: true, ...guide });
  }

  if (method === 'POST' && pathname === '/api/v1/diagnose') {
    return readJson(req).then(payload => {
      const report = createReport(payload);
      return send(res, 201, { ok: true, report });
    }).catch(err => {
      if (res.writableEnded) return;
      const status = err.status || 400;
      return sendError(
        res,
        status,
        status === 413 ? 'BODY_TOO_LARGE' : 'INVALID_REQUEST',
        err.message || 'Unable to process request.'
      );
    });
  }

  const reportMatch = pathname.match(/^\/api\/v1\/reports\/([a-f0-9-]+)$/i);
  if (method === 'GET' && reportMatch) {
    const stored = reports.get(reportMatch[1]);
    if (!stored || stored.expiresAt < Date.now()) {
      reports.delete(reportMatch[1]);
      return sendError(res, 404, 'REPORT_NOT_FOUND', 'Report not found or expired.');
    }
    return send(res, 200, { ok: true, report: stored.result });
  }

  if (pathname.startsWith('/api/')) {
    if (!['GET', 'POST', 'HEAD'].includes(method)) {
      res.setHeader('Allow', 'GET, POST, HEAD');
      return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
    }
    return sendError(res, 404, 'API_ROUTE_NOT_FOUND', 'API route not found.');
  }

  return null;
}

function serveStatic(req, res, url) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendError(res, 400, 'BAD_PATH', 'Invalid URL path.');
  }

  if (pathname.includes('\0') || pathname.includes('\\')) {
    return sendError(res, 400, 'BAD_PATH', 'Invalid URL path.');
  }

  if (pathname === '/') pathname = '/index.html';

  const filePath = path.resolve(ROOT, '.' + pathname);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return sendError(res, 403, 'FORBIDDEN', 'Access denied.');
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      return sendError(res, 404, 'FILE_NOT_FOUND', 'File not found.');
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });

    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) sendError(res, 500, 'FILE_READ_ERROR', 'Could not read file.');
      else res.destroy();
    });
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  securityHeaders(res);

  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendError(res, 400, 'BAD_URL', 'Invalid request URL.');
  }

  if (url.pathname.startsWith('/api/') && !checkRateLimit(req, res)) return;

  try {
    const result = api(req, res, url);
    if (result !== null) return;
    return serveStatic(req, res, url);
  } catch (error) {
    console.error('Request error:', error.message);
    if (!res.headersSent) {
      return sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
    }
    res.destroy();
  }
});

// Remove expired reports and stale rate-limit entries.
setInterval(() => {
  const now = Date.now();

  for (const [id, report] of reports) {
    if (report.expiresAt < now) reports.delete(id);
  }

  for (const [key, entry] of rateLimits) {
    if (now - entry.start > 10 * 60_000) rateLimits.delete(key);
  }
}, 5 * 60_000).unref();

server.listen(PORT, HOST, () => {
  console.log(`PhoneRescue Ultra listening on ${HOST}:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

server.on('error', error => {
  console.error('Server startup error:', error.message);
  process.exitCode = 1;
});
