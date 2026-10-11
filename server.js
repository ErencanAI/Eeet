
'use strict';

/**
 * PhoneRescue Ultra
 * Multi-brand diagnostic and recovery guidance API.
 * Node.js 20+ | Express 5 | Render compatible
 *
 * IMPORTANT:
 * This server does not directly access, modify, unlock,
 * erase or reinstall the operating system of a connected phone.
 */

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const STARTED_AT = Date.now();
const API = '/api/v1';

app.disable('x-powered-by');
app.set('trust proxy', 1);

// --------------------------------------------------
// 1. Security headers
// --------------------------------------------------

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.json({
  limit: '32kb',
  strict: true,
  type: 'application/json'
}));

app.use(express.urlencoded({
  extended: false,
  limit: '16kb',
  parameterLimit: 30
}));

app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev'));

// --------------------------------------------------
// 2. Lightweight per-IP rate limiting
// --------------------------------------------------

const rateBuckets = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 100;
const RATE_MAX_API = 30;

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  let entry = rateBuckets.get(key);

  if (!entry || now - entry.start >= RATE_WINDOW_MS) {
    entry = { start: now, count: 0, apiCount: 0 };
    rateBuckets.set(key, entry);
  }

  entry.count++;

  if (req.path.startsWith(API)) {
    entry.apiCount++;
  }

  const isApi = req.path.startsWith(API);
  const limit = isApi ? RATE_MAX_API : RATE_MAX;
  const count = isApi ? entry.apiCount : entry.count;

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader(
    'X-RateLimit-Remaining',
    String(Math.max(0, limit - count))
  );

  if (count > limit) {
    res.setHeader('Retry-After', '60');

    return res.status(429).json({
      ok: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Çok fazla istek gönderildi. Biraz sonra tekrar dene.'
      },
      requestId: req.requestId
    });
  }

  next();
}

app.use(rateLimit);

// Periodic cleanup to keep the in-memory limiter bounded.
const cleanupTimer = setInterval(() => {
  const now = Date.now();

  for (const [key, value] of rateBuckets) {
    if (now - value.start > RATE_WINDOW_MS * 2) {
      rateBuckets.delete(key);
    }
  }

  // Emergency bound for unusually high traffic.
  if (rateBuckets.size > 10_000) {
    const entries = [...rateBuckets.entries()]
      .sort((a, b) => a[1].start - b[1].start);

    for (let i = 0; i < entries.length - 8_000; i++) {
      rateBuckets.delete(entries[i][0]);
    }
  }
}, 60_000);

cleanupTimer.unref();

// --------------------------------------------------
// 3. Device catalog
// --------------------------------------------------

const DEVICES = [
  {
    id: 'apple-iphone-3g',
    brand: 'Apple',
    model: 'iPhone 3G',
    family: 'iphone',
    era: 'legacy',
    supportedOperations: ['guided-diagnostics', 'recovery-guidance']
  },
  {
    id: 'apple-iphone-3gs',
    brand: 'Apple',
    model: 'iPhone 3GS',
    family: 'iphone',
    era: 'legacy',
    supportedOperations: ['guided-diagnostics', 'recovery-guidance']
  },
  {
    id: 'apple-iphone-other',
    brand: 'Apple',
    model: 'Other iPhone',
    family: 'iphone',
    era: 'varies',
    supportedOperations: ['guided-diagnostics', 'recovery-guidance']
  },
  {
    id: 'samsung-android',
    brand: 'Samsung',
    model: 'Galaxy / Android',
    family: 'android',
    era: 'varies',
    supportedOperations: ['guided-diagnostics', 'recovery-guidance']
  },
  {
    id: 'xiaomi-android',
    brand: 'Xiaomi',
    model: 'Xiaomi / Redmi / POCO',
    family: 'android',
    era: 'varies',
    supportedOperations: ['guided-diagnostics', 'recovery-guidance']
  },
  {
    id: 'google-android',
    brand: 'Google',
    model: 'Pixel',
    family: 'android',
    era: 'varies',
    supportedOperations: ['guided-diagnostics', 'recovery-guidance']
  },
  {
    id: 'huawei-android',
    brand: 'Huawei',
    model: 'Huawei',
    family: 'android',
    era: 'varies',
    supportedOperations: ['guided-diagnostics', 'recovery-guidance']
  },
  {
    id: 'other-android',
    brand: 'Other Android',
    model: 'Other Android device',
    family: 'android',
    era: 'varies',
    supportedOperations: ['guided-diagnostics', 'recovery-guidance']
  },
  {
    id: 'other-phone',
    brand: 'Other',
    model: 'Other phone',
    family: 'other',
    era: 'unknown',
    supportedOperations: ['guided-diagnostics', 'recovery-guidance']
  }
];

const ISSUES = {
  wont_turn_on: {
    label: 'Telefon açılmıyor',
    keywords: ['açılmıyor', 'acilmiyor', 'açılmama', 'power', 'boot'],
    checks: [
      'Şarj cihazını, kabloyu ve güç kaynağını kontrol et.',
      'Cihazın modeline uygun normal yeniden başlatma adımlarını kontrol et.',
      'Ekran arızası ile cihazın hiç açılmaması durumunu ayırt et.'
    ]
  },
  boot_loop: {
    label: 'Açılış ekranında kalıyor',
    keywords: ['logo', 'bootloop', 'açılış', 'baslangic', 'başlangıç'],
    checks: [
      'Sorunun güncelleme veya yeniden başlatma sonrasında başlayıp başlamadığını belirle.',
      'Modelin resmi kurtarma talimatlarını kontrol et.',
      'Verileri silebilecek sıfırlama işlemlerinden önce yedek durumunu değerlendir.'
    ]
  },
  usb_connection: {
    label: 'USB bağlantı sorunu',
    keywords: ['usb', 'bağlanmıyor', 'baglanmiyor', 'bilgisayar', 'kablo'],
    checks: [
      'Veri aktarımını destekleyen uyumlu bir kablo dene.',
      'Farklı bir USB bağlantı noktası kullan.',
      'Telefonun kilit ve bağlantı izinlerini kontrol et.'
    ]
  },
  charging: {
    label: 'Şarj sorunu',
    keywords: ['şarj', 'sarj', 'batarya', 'pil', 'şarj olmuyor'],
    checks: [
      'Uyumlu bir güç kaynağı ve sağlam kablo dene.',
      'Şarj girişinde görünür hasar olup olmadığını kontrol et.',
      'Aşırı ısınma veya fiziksel hasar varsa kullanmayı bırakıp teknik destek al.'
    ]
  },
  apps_crashing: {
    label: 'Uygulamalar çalışmıyor',
    keywords: ['uygulama', 'çöküyor', 'donuyor', 'kapanıyor', 'app'],
    checks: [
      'Sorunun tek bir uygulamada mı yoksa tüm sistemde mi olduğunu belirle.',
      'Cihaz açılıyorsa kullanılabilir depolama alanını kontrol et.',
      'Desteklenen uygulama güncellemelerini ve resmi sistem güncellemelerini incele.'
    ]
  },
  screen: {
    label: 'Ekran sorunu',
    keywords: ['ekran', 'dokunmatik', 'görüntü', 'siyah ekran'],
    checks: [
      'Cihazın güç veya bildirim belirtisi verip vermediğini kontrol et.',
      'Ekran, bağlantı veya donanım arızası olasılığını değerlendir.',
      'Fiziksel hasar varsa cihazı yetkili teknik servise göster.'
    ]
  },
  storage: {
    label: 'Depolama sorunu',
    keywords: ['depolama', 'alan dolu', 'hafıza', 'bellek'],
    checks: [
      'Cihaz açılıyorsa depolama alanını incele.',
      'Önemli dosyaları yedeklemeden toplu silme yapma.',
      'Uygulama verileri ve önbellek arasındaki farkı kontrol et.'
    ]
  },
  unknown: {
    label: 'Diğer / belirlenmemiş sorun',
    keywords: [],
    checks: [
      'Sorunun ne zaman başladığını belirle.',
      'Ekranda görünen hata mesajını kaydet.',
      'Marka ve modele uygun resmi destek adımlarını izle.'
    ]
  }
};

const PROFILES = {
  iphoneLegacy: {
    recovery: [
      'Uyumlu şarj ve bağlantı ekipmanını kontrol et.',
      'Bilgisayarın cihazı tanıyıp tanımadığını belirle.',
      'Eski cihazla uyumlu resmi veya güvenilir kurtarma seçeneklerini araştır.',
      'Geri yükleme öncesinde veri kaybı ihtimalini değerlendir.'
    ],
    limitations: [
      'Bu API eski iOS sürümünü algılamaz veya yüklemez.',
      'Modern tarayıcı, eski iPhone sistem onarımı yapamaz.',
      'Donanım arızaları için fiziksel inceleme gerekebilir.'
    ]
  },
  iphone: {
    recovery: [
      'Modelin resmi destek talimatlarını kontrol et.',
      'Uygun bilgisayar ve bağlantı yazılımının cihazı algılayıp algılamadığını belirle.',
      'Veri kaybı yaratmayan seçenekleri önceliklendir.',
      'Gerekirse resmi kurtarma yöntemlerini kullan.'
    ],
    limitations: [
      'Bu sunucu iOS dosya sistemine erişmez.',
      'Aktivasyon kilidi veya hesap güvenliği atlatılmaz.',
      'Geri yükleme verileri silebilir.'
    ]
  },
  android: {
    recovery: [
      'Modelin üretici tarafından desteklenen kurtarma yöntemini belirle.',
      'Cihaz açılıyorsa önemli dosyaların yedeğini al.',
      'USB veri bağlantısı ve yetkilendirme durumunu kontrol et.',
      'Gerekirse üreticinin resmi yazılım onarım rehberini izle.'
    ],
    limitations: [
      'Tarayıcı USB seçimi Android sistem erişimi sağlamaz.',
      'ADB erişimi için cihazın ve kullanıcının uygun yetkilendirmesi gerekir.',
      'İzinsiz kilit atlatma veya gizli verileri çıkarma yapılmaz.'
    ]
  },
  other: {
    recovery: [
      'Üreticiyi ve cihaz modelini doğrula.',
      'Üreticinin resmi kurtarma rehberini kullan.',
      'Veri kaybı yaratabilecek işlemlerden önce yedek al.'
    ],
    limitations: [
      'Model bilinmeden kesin kurtarma yöntemi seçilemez.',
      'Bu sunucu doğrudan cihaz onarımı yapmaz.'
    ]
  }
};

function textValue(value, max = 200) {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function publicError(res, status, code, message, requestId) {
  return res.status(status).json({
    ok: false,
    error: { code, message },
    requestId
  });
}

function resolveDevice(id, brand, model) {
  if (id) {
    return DEVICES.find(d => d.id === id) || null;
  }

  const b = textValue(brand, 60).toLocaleLowerCase('tr-TR');
  const m = textValue(model, 80).toLocaleLowerCase('tr-TR');

  if (b === 'apple' || b === 'iphone') {
    if (m.includes('3gs')) return DEVICES[1];
    if (m.includes('3g')) return DEVICES[0];
    return DEVICES[2];
  }

  if (/samsung/.test(b)) return DEVICES[3];
  if (/xiaomi|redmi|poco/.test(b)) return DEVICES[4];
  if (/google|pixel/.test(b)) return DEVICES[5];
  if (/huawei/.test(b)) return DEVICES[6];

  if (/android|oppo|vivo|realme|oneplus|motorola|nokia|sony|tecno|infinix/.test(b)) {
    return DEVICES[7];
  }

  if (b && m) return DEVICES[8];

  return null;
}

function getProfile(device) {
  if (device.id === 'apple-iphone-3g' ||
      device.id === 'apple-iphone-3gs') {
    return PROFILES.iphoneLegacy;
  }

  if (device.family === 'iphone') return PROFILES.iphone;
  if (device.family === 'android') return PROFILES.android;

  return PROFILES.other;
}

function classifyIssue(issue, issueId) {
  if (issueId && ISSUES[issueId]) {
    return { id: issueId, ...ISSUES[issueId] };
  }

  const normalized = issue.toLocaleLowerCase('tr-TR');

  for (const [id, item] of Object.entries(ISSUES)) {
    if (id === 'unknown') continue;

    if (item.keywords.some(word => normalized.includes(word))) {
      return { id, ...item };
    }
  }

  return { id: 'unknown', ...ISSUES.unknown };
}

// --------------------------------------------------
// 4. Service health
// --------------------------------------------------

function healthPayload() {
  return {
    ok: true,
    service: 'PhoneRescue Ultra',
    version: '1.0.0',
    status: 'online',
    mode: 'guided-diagnostics',
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    timestamp: new Date().toISOString()
  };
}

app.get('/health', (req, res) => {
  res.status(200).json(healthPayload());
});

app.get('/api/health', (req, res) => {
  res.status(200).json(healthPayload());
});

app.get(`${API}/health`, (req, res) => {
  res.status(200).json({
    ...healthPayload(),
    apiVersion: 'v1'
  });
});

// --------------------------------------------------
// 5. Public configuration
// --------------------------------------------------

app.get(`${API}/config`, (req, res) => {
  res.json({
    ok: true,
    product: {
      name: 'PhoneRescue Ultra',
      version: '1.0.0',
      apiVersion: 'v1'
    },
    capabilities: [
      'device-catalog',
      'guided-diagnostics',
      'recovery-guidance',
      'report-generation'
    ],
    unavailableCapabilities: [
      'direct-phone-repair',
      'direct-ios-installation',
      'unattended-device-erasure',
      'security-lock-bypass'
    ],
    privacy: {
      persistentPersonalStorage: false,
      automaticDeviceModification: false,
      automaticAppDeletion: false
    }
  });
});

// --------------------------------------------------
// 6. Device catalog
// --------------------------------------------------

app.get(`${API}/devices`, (req, res) => {
  const family = textValue(req.query.family, 30).toLowerCase();

  if (family && !['iphone', 'android', 'other'].includes(family)) {
    return publicError(
      res, 400, 'INVALID_FAMILY',
      'Geçersiz cihaz ailesi.', req.requestId
    );
  }

  const devices = family
    ? DEVICES.filter(d => d.family === family)
    : DEVICES;

  res.json({
    ok: true,
    count: devices.length,
    devices
  });
});

app.get(`${API}/devices/:id`, (req, res) => {
  const device = DEVICES.find(d => d.id === req.params.id);

  if (!device) {
    return publicError(
      res, 404, 'DEVICE_NOT_FOUND',
      'Bu model katalogda bulunamadı.', req.requestId
    );
  }

  res.json({
    ok: true,
    device,
    profile: getProfile(device)
  });
});

// --------------------------------------------------
// 7. Issue catalog
// --------------------------------------------------

app.get(`${API}/issues`, (req, res) => {
  const issues = Object.entries(ISSUES).map(([id, issue]) => ({
    id,
    label: issue.label
  }));

  res.json({
    ok: true,
    count: issues.length,
    issues
  });
});

// --------------------------------------------------
// 8. Diagnostics API
// --------------------------------------------------

app.post(`${API}/diagnose`, (req, res) => {
  const deviceId = textValue(req.body?.deviceId, 80);
  const brand = textValue(req.body?.brand, 60);
  const model = textValue(req.body?.model, 80);
  const issue = textValue(req.body?.issue, 500);
  const issueId = textValue(req.body?.issueId, 50);

  if (!issue || issue.length < 3) {
    return publicError(
      res, 400, 'ISSUE_REQUIRED',
      'Arızayı en az 3 karakterle açıkla.', req.requestId
    );
  }

  const device = resolveDevice(deviceId, brand, model);

  if (!device) {
    return publicError(
      res, 400, 'DEVICE_REQUIRED',
      'Geçerli bir cihaz modeli seç.', req.requestId
    );
  }

  const category = classifyIssue(issue, issueId);
  const profile = getProfile(device);

  const result = {
    ok: true,
    report: {
      reportId: `PR-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      requestId: req.requestId,
      status: 'guidance-generated'
    },
    device: {
      id: device.id,
      brand: device.brand,
      model: device.model,
      family: device.family,
      era: device.era
    },
    issue: {
      id: category.id,
      label: category.label,
      description: issue
    },
    assessment: {
      type: 'preliminary',
      certainty: 'not-verified',
      message: 'Bu sonuç, kullanıcı tarafından bildirilen belirtiye dayalı bir ön yönlendirmedir. Gerçek cihaz testi yapılmamıştır.',
      checks: category.checks,
      recoverySteps: profile.recovery,
      warnings: profile.limitations
    },
    execution: {
      physicalDeviceAccess: false,
      systemFilesRead: false,
      appsDeleted: false,
      settingsChanged: false,
      dataErased: false,
      firmwareInstalled: false
    }
  };

  res.status(200).json(result);
});

// --------------------------------------------------
// 9. Recovery guide
// --------------------------------------------------

app.get(`${API}/guides/:deviceId`, (req, res) => {
  const device = DEVICES.find(d => d.id === req.params.deviceId);

  if (!device) {
    return publicError(
      res, 404, 'DEVICE_NOT_FOUND',
      'Cihaz bulunamadı.', req.requestId
    );
  }

  const profile = getProfile(device);

  res.json({
    ok: true,
    device: {
      id: device.id,
      brand: device.brand,
      model: device.model
    },
    steps: profile.recovery,
    limitations: profile.limitations,
    destructiveActionsAvailable: false
  });
});

// --------------------------------------------------
// 10. Report generation
// Reports are returned to the caller, not persisted.
// --------------------------------------------------

app.post(`${API}/reports`, (req, res) => {
  const brand = textValue(req.body?.brand, 60);
  const model = textValue(req.body?.model, 80);
  const issue = textValue(req.body?.issue, 500);
  const diagnosis = req.body?.diagnosis;

  if (!brand || !model || !issue) {
    return publicError(
      res, 400, 'REPORT_FIELDS_REQUIRED',
      'Marka, model ve arıza açıklaması gereklidir.', req.requestId
    );
  }

  const report = {
    reportId: `PR-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    brand,
    model,
    issue,
    diagnosis: diagnosis && typeof diagnosis === 'object'
      ? {
          category: textValue(diagnosis.category, 80),
          summary: textValue(diagnosis.summary, 500)
        }
      : null,
    status: 'guidance-generated',
    disclaimer: 'Bu rapor gerçek bir cihaz testi veya onarımı yapıldığını göstermez.'
  };

  res.status(201).json({
    ok: true,
    report
  });
});

// --------------------------------------------------
// 11. Root and static frontend
// --------------------------------------------------

app.get('/', (req, res, next) => {
  res.sendFile(path.join(__dirname, 'index.html'), err => {
    if (err && !res.headersSent) next(err);
  });
});

// Serve other frontend assets from project root.
app.use(express.static(__dirname, {
  index: false,
  dotfiles: 'deny',
  fallthrough: true,
  maxAge: IS_PRODUCTION ? '1h' : 0
}));

// --------------------------------------------------
// 12. Not found handler
// --------------------------------------------------

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return publicError(
      res, 404, 'API_ROUTE_NOT_FOUND',
      'API adresi bulunamadı.', req.requestId
    );
  }

  return res.status(404).type('text').send(
    'Sayfa bulunamadı. index.html dosyasını kontrol et.'
  );
});

// --------------------------------------------------
// 13. Centralized error handler
// --------------------------------------------------

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = Number(err.status || err.statusCode) || 500;

  console.error(JSON.stringify({
    level: 'error',
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    status,
    message: err.message
  }));

  if (err.type === 'entity.too.large') {
    return publicError(
      res, 413, 'REQUEST_TOO_LARGE',
      'İstek boyutu izin verilen sınırı aşıyor.', req.requestId
    );
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return publicError(
      res, 400, 'INVALID_JSON',
      'JSON biçimi geçersiz.', req.requestId
    );
  }

  return publicError(
    res,
    status >= 400 && status < 600 ? status : 500,
    'INTERNAL_ERROR',
    IS_PRODUCTION
      ? 'Sunucuda bir hata oluştu. Daha sonra tekrar dene.'
      : err.message || 'Bilinmeyen sunucu hatası.',
    req.requestId
  );
});

// --------------------------------------------------
// 14. Startup and graceful shutdown
// --------------------------------------------------

const server = app.listen(PORT, HOST, () => {
  console.log(JSON.stringify({
    level: 'info',
    message: 'PhoneRescue Ultra started',
    host: HOST,
    port: PORT,
    node: process.version,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  }));
});

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 5_000;

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`Shutdown requested: ${signal}`);

  clearInterval(cleanupTimer);

  server.close(err => {
    if (err) {
      console.error('Shutdown error:', err.message);
      process.exitCode = 1;
    }

    process.exit();
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', reason => {
  console.error(
    'Unhandled rejection:',
    reason instanceof Error ? reason.message : String(reason)
  );
  process.exitCode = 1;
});

module.exports = app;
