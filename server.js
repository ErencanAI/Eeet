
'use strict';

/**
 * PhoneRescue Ultra
 * Production-oriented, dependency-free Node.js server.
 * Works on Render and serves index.html from the project root.
 *
 * IMPORTANT:
 * This server provides guided troubleshooting, not direct access
 * to a connected phone's private operating system or hardware.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const ROOT = path.resolve(__dirname);
const MAX_BODY_BYTES = 64 * 1024;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const MIME_TYPES = {
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
  '.txt': 'text/plain; charset=utf-8'
};

const devices = [
  {
    id: 'iphone-3g',
    family: 'ios',
    brand: 'Apple',
    model: 'iPhone 3G',
    era: '2008',
    notes: 'Eski nesil iPhone. Güncel iOS sürümlerini desteklemez.'
  },
  {
    id: 'iphone-3gs',
    family: 'ios',
    brand: 'Apple',
    model: 'iPhone 3GS',
    era: '2009',
    notes: 'Eski nesil iPhone. Modern iOS ve uygulamalarla uyumluluk sınırlıdır.'
  },
  {
    id: 'iphone-4',
    family: 'ios',
    brand: 'Apple',
    model: 'iPhone 4',
    era: '2010',
    notes: 'Eski donanım ve yazılım desteği sınırlıdır.'
  },
  {
    id: 'iphone-4s',
    family: 'ios',
    brand: 'Apple',
    model: 'iPhone 4s',
    era: '2011',
    notes: 'Eski iOS sürümleri ve uygulama uyumluluğu dikkate alınmalıdır.'
  },
  {
    id: 'iphone-5',
    family: 'ios',
    brand: 'Apple',
    model: 'iPhone 5',
    era: '2012',
    notes: 'Eski yazılım desteği nedeniyle bazı servisler çalışmayabilir.'
  },
  {
    id: 'iphone-6',
    family: 'ios',
    brand: 'Apple',
    model: 'iPhone 6',
    era: '2014',
    notes: 'Uygulama ve sistem desteği sürüme göre değişir.'
  },
  {
    id: 'iphone-modern',
    family: 'ios',
    brand: 'Apple',
    model: 'Diğer iPhone',
    era: 'Diğer',
    notes: 'Model ve iOS sürümüne göre işlem adımları değişebilir.'
  },
  {
    id: 'samsung-generic',
    family: 'android',
    brand: 'Samsung',
    model: 'Samsung Galaxy',
    era: 'Çeşitli',
    notes: 'Menüler Android ve One UI sürümüne göre değişebilir.'
  },
  {
    id: 'xiaomi-generic',
    family: 'android',
    brand: 'Xiaomi',
    model: 'Xiaomi / Redmi / POCO',
    era: 'Çeşitli',
    notes: 'Menüler MIUI veya HyperOS sürümüne göre değişebilir.'
  },
  {
    id: 'android-generic',
    family: 'android',
    brand: 'Android',
    model: 'Diğer Android telefon',
    era: 'Çeşitli',
    notes: 'Üreticiye ve Android sürümüne göre işlem adımları değişebilir.'
  },
  {
    id: 'other-phone',
    family: 'other',
    brand: 'Diğer',
    model: 'Diğer telefon',
    era: 'Bilinmiyor',
    notes: 'Üretici ve model belirtilirse yönlendirme daha doğru olabilir.'
  }
];

const issueCatalog = [
  {
    id: 'wont-turn-on',
    label: 'Telefon açılmıyor',
    keywords: ['açılmıyor', 'acilmiyor', 'power', 'güç düğmesi', 'siyah ekran']
  },
  {
    id: 'battery',
    label: 'Pil veya şarj sorunu',
    keywords: ['şarj', 'sarj', 'pil', 'batarya', 'battery', 'şarj olmuyor']
  },
  {
    id: 'slow',
    label: 'Telefon yavaş',
    keywords: ['yavaş', 'yavas', 'donuyor', 'kasıyor', 'kasiyor', 'slow']
  },
  {
    id: 'app-crash',
    label: 'Uygulama açılmıyor',
    keywords: ['uygulama', 'app', 'kapanıyor', 'kapanıyor', 'çöküyor', 'acilmiyor']
  },
  {
    id: 'network',
    label: 'Wi-Fi veya bağlantı',
    keywords: ['wifi', 'wi-fi', 'internet', 'şebeke', 'sebeke', 'sinyal', 'bluetooth']
  },
  {
    id: 'screen',
    label: 'Ekran sorunu',
    keywords: ['ekran', 'dokunmatik', 'touch', 'görüntü', 'goruntu']
  },
  {
    id: 'storage',
    label: 'Depolama alanı',
    keywords: ['hafıza', 'hafiza', 'depolama', 'storage', 'yer yok', 'alan yok']
  },
  {
    id: 'computer-connection',
    label: 'Bilgisayar telefonu görmüyor',
    keywords: ['usb', 'bilgisayar', 'itunes', 'finder', 'tanımıyor', 'görmüyor']
  },
  {
    id: 'update',
    label: 'Güncelleme veya yazılım',
    keywords: ['güncelleme', 'guncelleme', 'yazılım', 'yazilim', 'update', 'restore']
  },
  {
    id: 'overheating',
    label: 'Aşırı ısınma',
    keywords: ['ısınıyor', 'isiniyor', 'ısınma', 'isinma', 'sıcak', 'sicak']
  }
];

const guides = {
  'iphone-3g': {
    steps: [
      'Telefonu ve kabloyu gözle kontrol et; hasarlı veya ıslak ekipmanı kullanma.',
      'Uyumlu ve sağlam bir şarj adaptörü ile kabloyu deneyerek bir süre bekle.',
      'Şarj girişinde görünür kir veya hasar varsa metal cisim sokma; profesyonel destek al.',
      'Bilgisayara bağlama sorunu varsa farklı bir kablo, USB portu ve uyumlu bilgisayar dene.',
      'Cihaz hâlâ açılmıyorsa pil, bağlantı noktası veya başka bir donanım arızası için teknik servis değerlendirmesi gerekir.'
    ],
    limitations: [
      'iPhone 3G eski bir modeldir; modern uygulamalar ve güncel servislerle uyumlu olmayabilir.',
      'Tarayıcı üzerinden telefonun dahili sistem günlükleri okunamaz.',
      'Geri yükleme işlemi verileri silebilir. Yedekleme ve riskler değerlendirilmeden başlatılmamalıdır.'
    ]
  },
  'iphone-3gs': {
    steps: [
      'Sağlam ve uyumlu bir kablo ile adaptör kullandığını kontrol et.',
      'Telefonu bir süre şarjda beklet ve ekranda herhangi bir belirti olup olmadığına bak.',
      'Bilgisayar bağlantısında farklı USB portu ve mümkünse başka bir kablo dene.',
      'Bilgisayar cihazı algılamıyorsa uyumlu Apple aygıt yazılımlarını ve bilgisayar bağlantısını kontrol et.',
      'Sorun devam ederse pil, şarj soketi veya anakart gibi parçalar için teknik inceleme gerekebilir.'
    ],
    limitations: [
      'Bu model güncel iOS sürümlerini desteklemez.',
      'Bazı güncel uygulamalar, web servisleri ve bağlantı yöntemleri çalışmayabilir.',
      'Geri yükleme veya sıfırlama kişisel verileri silebilir.'
    ]
  },
  'default': {
    steps: [
      'Sorunu ve ne zaman başladığını belirle; yakın zamanda yapılan değişiklikleri not et.',
      'Telefonun pil seviyesini ve fiziksel durumunu kontrol et.',
      'Sorun bir uygulamadaysa önce uygulamayı kapatıp tekrar açmayı dene.',
      'Üreticinin önerdiği güvenli yeniden başlatma yöntemini kullan.',
      'İşlem verileri silebilecekse önce yedekleme yap; emin değilsen sıfırlama veya geri yükleme başlatma.',
      'Sorun sürüyorsa modeline uygun resmî destek kaynağına veya yetkili teknik servise başvur.'
    ],
    limitations: [
      'Bu rehber genel yönlendirmedir; donanım arızasını kesin olarak teşhis etmez.',
      'Menü adları ve desteklenen işlemler telefonun modeline ve yazılım sürümüne bağlıdır.',
      'Fabrika ayarlarına döndürme ve sistem geri yükleme veri kaybına yol açabilir.'
    ]
  }
};

const rateBuckets = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 100;
const MAX_RATE_BUCKETS = 5000;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function cleanText(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function normalize(value) {
  return cleanText(value, 1000)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getClientIp(req) {
  // Do not trust arbitrary forwarded headers unless a trusted proxy is configured.
  return req.socket.remoteAddress || 'unknown';
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Powered-By', 'PhoneRescue Ultra');

  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

function checkRateLimit(req, res) {
  const ip = getClientIp(req);
  const now = Date.now();
  let entry = rateBuckets.get(ip);

  if (!entry || now - entry.startedAt >= RATE_WINDOW_MS) {
    entry = { startedAt: now, count: 0 };
    rateBuckets.set(ip, entry);
  }

  entry.count += 1;

  if (rateBuckets.size > MAX_RATE_BUCKETS) {
    for (const [key, value] of rateBuckets) {
      if (now - value.startedAt >= RATE_WINDOW_MS) {
        rateBuckets.delete(key);
      }
      if (rateBuckets.size <= MAX_RATE_BUCKETS * 0.8) break;
    }
  }

  if (entry.count > RATE_LIMIT) {
    const retryAfter = Math.max(
      1,
      Math.ceil((RATE_WINDOW_MS - (now - entry.startedAt)) / 1000)
    );
    res.setHeader('Retry-After', String(retryAfter));
    sendJson(res, 429, {
      ok: false,
      error: 'rate_limit',
      message: 'Çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar dene.'
    });
    return false;
  }

  return true;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on('data', chunk => {
      total += chunk.length;

      if (total > MAX_BODY_BYTES) {
        const err = new Error('İstek gövdesi çok büyük.');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      if (total === 0) {
        resolve({});
        return;
      }

      const contentType = String(req.headers['content-type'] || '');

      if (!contentType.toLowerCase().includes('application/json')) {
        const err = new Error('İstek application/json biçiminde olmalıdır.');
        err.statusCode = 415;
        reject(err);
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        const err = new Error('Geçersiz JSON verisi.');
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

function findDevice(id, brand, model) {
  const wantedId = normalize(id).replace(/\s+/g, '-');
  const wantedBrand = normalize(brand);
  const wantedModel = normalize(model);

  let device = devices.find(item => normalize(item.id) === wantedId);

  if (device) return device;

  if (wantedModel.includes('3gs')) {
    return devices.find(item => item.id === 'iphone-3gs');
  }

  if (wantedModel.includes('iphone') && wantedModel.includes('3g')) {
    return devices.find(item => item.id === 'iphone-3g');
  }

  if (wantedBrand.includes('apple') || wantedModel.includes('iphone')) {
    return devices.find(item => item.id === 'iphone-modern');
  }

  if (wantedBrand.includes('samsung')) {
    return devices.find(item => item.id === 'samsung-generic');
  }

  if (wantedBrand.includes('xiaomi') ||
      wantedBrand.includes('redmi') ||
      wantedBrand.includes('poco')) {
    return devices.find(item => item.id === 'xiaomi-generic');
  }

  if (wantedBrand.includes('android')) {
    return devices.find(item => item.id === 'android-generic');
  }

  return devices.find(item => item.id === 'other-phone');
}

function findIssue(issueId, issueText) {
  const id = normalize(issueId).replace(/\s+/g, '-');
  const text = normalize(issueText);

  const byId = issueCatalog.find(item => normalize(item.id) === id);
  if (byId) return byId;

  return issueCatalog.find(item =>
    item.keywords.some(keyword => text.includes(normalize(keyword)))
  ) || {
    id: 'general',
    label: issueText || 'Genel telefon sorunu',
    keywords: []
  };
}

function buildAssessment(device, issue, details) {
  const model = device.model;
  const label = issue.label;
  const text = normalize(`${label} ${details}`);
  let checks = [];
  let recoverySteps = [];
  let warnings = [];

  if (issue.id === 'wont-turn-on') {
    checks = [
      'Telefonun ekranında, titreşiminde veya bildirimlerinde herhangi bir belirti var mı?',
      'Farklı ve uyumlu bir kablo/adaptör ile denendi mi?',
      'Cihaz yakın zamanda düştü, ıslandı veya aşırı ısındı mı?'
    ];
    recoverySteps = [
      'Sağlam ve uyumlu bir güç kaynağıyla bir süre şarj etmeyi dene.',
      'Üreticinin modeline özel yeniden başlatma yönergelerini kontrol et.',
      'Hiçbir belirti yoksa veya cihaz fiziksel hasarlıysa teknik servis değerlendirmesi al.'
    ];
    warnings = [
      'Cihaz şişmiş, aşırı sıcak veya ıslaksa şarja takma.',
      'Telefon açılmıyorsa pilin veya anakartın sağlam olduğu uzaktan doğrulanamaz.'
    ];
  } else if (issue.id === 'battery') {
    checks = [
      'Başka bir uyumlu kablo ve adaptör ile aynı sorun yaşanıyor mu?',
      'Şarj soketinde görünür hasar var mı?',
      'Pil yüzdesi sabit mi kalıyor, yoksa hızla mı düşüyor?'
    ];
    recoverySteps = [
      'Sağlam bir kablo ve uyumlu adaptör dene.',
      'Şarj soketini ışık altında yalnızca gözle kontrol et; içine metal cisim sokma.',
      'Sorun sürüyorsa pil ve şarj devresini teknik servise kontrol ettir.'
    ];
    warnings = [
      'Şişmiş pil veya aşırı ısınma varsa cihazı kullanmayı bırak ve profesyonel yardım al.',
      'Eski cihazlarda pilin kapasitesi zamanla azalabilir.'
    ];
  } else if (issue.id === 'slow') {
    checks = [
      'Sorun bütün sistemde mi, yoksa yalnızca bir uygulamada mı görülüyor?',
      'Depolama alanı çok azalmış mı?',
      'Cihaz uzun süredir yeniden başlatılmadı mı?'
    ];
    recoverySteps = [
      'Önemli verileri yedekle.',
      'Gereksiz açık uygulamaları kapatıp cihazı normal şekilde yeniden başlat.',
      'Depolama alanını telefonun kendi ayarlarından kontrol et.',
      'Sorun tek bir uygulamadaysa uygulama uyumluluğunu ve resmî destek durumunu kontrol et.'
    ];
    warnings = [
      'Bilinmeyen “telefon hızlandırıcı” uygulamalara parola veya kişisel veri verme.',
      'Rastgele sistem dosyası silme veya fabrika ayarlarına dönme.'
    ];
  } else if (issue.id === 'app-crash') {
    checks = [
      'Hata yalnızca bir uygulamada mı meydana geliyor?',
      'Uygulama ve işletim sistemi bu modelle uyumlu mu?',
      'Hata mesajı varsa tam metni nedir?'
    ];
    recoverySteps = [
      'Cihazı normal şekilde yeniden başlat.',
      'Uygulamanın resmî mağazadaki uyumluluk bilgilerini kontrol et.',
      'Android cihazlarda, gerekiyorsa uygulamanın önbelleğini ayarlardan temizle.',
      'iPhone 3G/3GS gibi eski modellerde uygulamanın güncel sürümünün desteklenmeyebileceğini unutma.'
    ];
    warnings = [
      'Uygulamayı silmek yerel verileri kaybettirebilir; önce yedekleme durumunu kontrol et.',
      'Eski iOS sürümlerinde güncel uygulamaların çalışmaması her zaman cihaz arızası anlamına gelmez.'
    ];
  } else if (issue.id === 'network') {
    checks = [
      'Aynı ağ başka bir cihazda çalışıyor mu?',
      'Sorun Wi-Fi, mobil şebeke veya Bluetooth bağlantılarından hangisinde?',
      'Sorun belirli bir yerde mi ortaya çıkıyor?'
    ];
    recoverySteps = [
      'Uçak modunu normal şekilde açıp kapatmayı dene.',
      'Wi-Fi kullanıyorsan yönlendiricinin çalıştığını kontrol et.',
      'Cihazı yeniden başlat.',
      'Ağ ayarlarını sıfırlamadan önce kayıtlı ağ parolalarının gerekebileceğini dikkate al.'
    ];
    warnings = [
      'Ağ ayarlarını sıfırlamak kayıtlı bağlantı bilgilerini kaldırabilir.',
      'Eski telefonların desteklediği Wi-Fi ve hücresel ağ standartları sınırlı olabilir.'
    ];
  } else if (issue.id === 'screen') {
    checks = [
      'Ekranda görüntü var mı, yoksa ekran tamamen siyah mı?',
      'Sorun düşme, baskı veya sıvı temasından sonra mı başladı?',
      'Dokunmatik ekranın tamamı mı, yoksa bir bölümü mü yanıt vermiyor?'
    ];
    recoverySteps = [
      'Cihazı zorlamadan normal şekilde yeniden başlatmayı dene.',
      'Ekranı kuru ve yumuşak bir bezle temizle.',
      'Fiziksel hasar veya dokunmatik arızası varsa teknik servis değerlendirmesi al.'
    ];
    warnings = [
      'Ekrana bastırma, cihazı açmaya çalışma veya sıvı uygulama.',
      'Görüntü gelmemesi ekran, pil veya başka bir donanım sorunundan kaynaklanabilir.'
    ];
  } else if (issue.id === 'storage') {
    checks = [
      'Ayarlar bölümünde ne kadar boş alan görünüyor?',
      'Sorun fotoğraf, video veya belirli bir uygulamayla mı ilgili?',
      'Önemli dosyaların yedeği var mı?'
    ];
    recoverySteps = [
      'Önemli fotoğraf ve dosyaların yedeklendiğini doğrula.',
      'Telefonun kendi depolama ekranından yer kaplayan kategorileri incele.',
      'Yedekli ve artık gerekli olmayan dosyaları yalnızca kendin seçerek kaldır.'
    ];
    warnings = [
      'Toplu silme veya sistem klasörlerini silme işlemi yapma.',
      'Yedekleme doğrulanmadan fotoğraf veya uygulama verilerini silme.'
    ];
  } else if (issue.id === 'computer-connection') {
    checks = [
      'Kullandığın kablo veri aktarımını destekliyor mu?',
      'Başka bir USB portu veya bilgisayar denendi mi?',
      'Telefonun ekranında bağlantı veya güven onayı görünüyor mu?'
    ];
    recoverySteps = [
      'Sağlam ve veri aktarımını destekleyen uyumlu bir kablo dene.',
      'Bilgisayarda başka bir USB portu kullan.',
      'İşletim sistemine ve telefon modeline uygun resmî aygıt yazılımlarını kontrol et.',
      'Eski iPhone modellerinde kullanılan yazılım ve sürücülerin uyumluluğunu doğrula.'
    ];
    warnings = [
      'Bu web uygulaması USB üzerinden telefonun özel sistem günlüklerini okuyamaz.',
      'Telefonu geri yüklemek kişisel verileri silebilir; bunu ilk çözüm olarak kullanma.'
    ];
  } else if (issue.id === 'update') {
    checks = [
      'Telefonun tam modeli ve mevcut yazılım sürümü nedir?',
      'Güncelleme sırasında gösterilen hata kodu nedir?',
      'Cihazda yeterli pil ve depolama alanı var mı?'
    ];
    recoverySteps = [
      'Hata kodunu ve mevcut sürümü not et.',
      'Yalnızca üreticinin cihaz modelin için sunduğu resmî talimatları kullan.',
      'İşlem öncesinde mümkünse verilerini yedekle.',
      'Eski cihazlarda artık sunulmayan güncellemeleri yüklemeye zorlamama.'
    ];
    warnings = [
      'Uyumsuz yazılım yüklemek cihazı kullanılamaz hâle getirebilir.',
      'Geri yükleme ve sıfırlama veri kaybına neden olabilir.'
    ];
  } else if (issue.id === 'overheating') {
    checks = [
      'Telefon normal kullanımda mı, yoksa şarj sırasında mı ısınıyor?',
      'Cihaz güneşte veya çok sıcak bir ortamda mı kaldı?',
      'Pil şişmesi, koku veya fiziksel hasar belirtisi var mı?'
    ];
    recoverySteps = [
      'Yoğun uygulamaları kapat ve cihazı ısı kaynağından uzaklaştır.',
      'Telefon çok sıcaksa şarjı kes ve soğumasını bekle.',
      'Sorun tekrarlanıyorsa teknik servis değerlendirmesi al.'
    ];
    warnings = [
      'Şişmiş pil, duman, koku veya aşırı ısınma varsa cihazı kullanma ve şarja takma.',
      'Telefonu buzdolabına koyma veya suyla soğutmaya çalışma.'
    ];
  } else {
    checks = [
      'Sorun tam olarak ne zaman ve nasıl başladı?',
      'Ekranda görünen hata mesajı var mı?',
      'Telefonun marka, model ve yazılım sürümü nedir?'
    ];
    recoverySteps = [
      'Sorunu tekrar üretmek için yaptığın işlemleri not et.',
      'Cihazı ve bağlantılarını gözle kontrol et.',
      'Verilerini koruyarak yalnızca güvenli, geri alınabilir kontrolleri dene.',
      'Sorun devam ederse modele uygun resmî destek veya teknik servis kullan.'
    ];
    warnings = [
      'Bu değerlendirme genel bir ön incelemedir; kesin donanım teşhisi değildir.',
      'Sıfırlama, geri yükleme veya veri silme işlemini yedekleme yapmadan başlatma.'
    ];
  }

  if (device.id === 'iphone-3g' || device.id === 'iphone-3gs') {
    warnings.push(
      `${model} eski bir modeldir. Güncel uygulama ve servis uyumsuzluğu, donanım arızasından ayrı değerlendirilmelidir.`
    );
  }

  if (text.includes('veri') || text.includes('fotoğraf') || text.includes('fotograf')) {
    warnings.unshift('Öncelik kişisel verileri korumaktır. Silme veya geri yükleme işlemine geçmeden önce yedek durumunu kontrol et.');
  }

  return {
    message: `${model} için “${label}” başlığı altında güvenli ön inceleme hazırlandı. Bu sonuç uzaktan kesin arıza tespiti değildir.`,
    checks,
    recoverySteps,
    warnings
  };
}

function getGuide(deviceId) {
  const device = devices.find(item => item.id === deviceId) || devices.find(item => item.id === 'other-phone');
  const guide = guides[device.id] || guides.default;

  return {
    ok: true,
    device: {
      id: device.id,
      brand: device.brand,
      model: device.model
    },
    steps: guide.steps,
    limitations: guide.limitations
  };
}

function serveStatic(req, res, pathname) {
  let requestedPath = pathname === '/' ? '/index.html' : pathname;

  try {
    requestedPath = decodeURIComponent(requestedPath);
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_path', message: 'Geçersiz adres.' });
    return;
  }

  if (requestedPath.includes('\0')) {
    sendJson(res, 400, { ok: false, error: 'invalid_path', message: 'Geçersiz adres.' });
    return;
  }

  const fullPath = path.resolve(ROOT, `.${requestedPath}`);

  if (fullPath !== ROOT && !fullPath.startsWith(ROOT + path.sep)) {
    sendJson(res, 403, { ok: false, error: 'forbidden', message: 'Bu dosyaya erişilemiyor.' });
    return;
  }

  fs.stat(fullPath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      if (pathname === '/index.html' || pathname === '/') {
        sendJson(res, 500, {
          ok: false,
          error: 'index_not_found',
          message: 'index.html bulunamadı. Dosyanın server.js ile aynı klasörde olduğunu kontrol et.'
        });
      } else {
        sendJson(res, 404, { ok: false, error: 'not_found', message: 'Sayfa bulunamadı.' });
      }
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });

    const stream = fs.createReadStream(fullPath);
    stream.on('error', () => {
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: 'file_read_error', message: 'Dosya okunamadı.' });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  });
}

async function handleRequest(req, res) {
  applySecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    sendJson(res, 400, { ok: false, error: 'bad_url', message: 'Geçersiz istek adresi.' });
    return;
  }

  const pathname = url.pathname;

  if (!checkRateLimit(req, res)) return;

  if (pathname === '/api/health' || pathname === '/api/v1/health') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      service: 'PhoneRescue Ultra API',
      status: 'online',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      capabilities: [
        'device-catalog',
        'guided-diagnostics',
        'recovery-guides',
        'report-generation'
      ],
      limitations: [
        'No direct access to phone operating-system internals',
        'No automatic hardware repair',
        'No destructive action without explicit user action'
      ]
    });
    return;
  }

  if (pathname === '/api/v1/devices') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }

    sendJson(res, 200, { ok: true, devices });
    return;
  }

  if (pathname === '/api/v1/issues') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      issues: issueCatalog.map(({ id, label }) => ({ id, label }))
    });
    return;
  }

  if (pathname === '/api/v1/diagnose') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'POST kullanılmalıdır.' });
      return;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      if (!res.writableEnded) {
        sendJson(res, error.statusCode || 400, {
          ok: false,
          error: error.statusCode === 413 ? 'payload_too_large' : 'invalid_request',
          message: error.message || 'İstek okunamadı.'
        });
      }
      return;
    }

    const deviceId = cleanText(body.deviceId, 100);
    const brand = cleanText(body.brand, 100);
    const model = cleanText(body.model, 150);
    const issueId = cleanText(body.issueId, 100);
    const issueText = cleanText(body.issue, 500);
    const details = cleanText(body.details || body.description || '', 1500);

    if (!deviceId && !brand && !model) {
      sendJson(res, 400, {
        ok: false,
        error: 'device_required',
        message: 'Lütfen telefon modelini seç.'
      });
      return;
    }

    if (!issueId && !issueText) {
      sendJson(res, 400, {
        ok: false,
        error: 'issue_required',
        message: 'Lütfen telefon sorununu seç veya açıkla.'
      });
      return;
    }

    const device = findDevice(deviceId, brand, model);
    const issue = findIssue(issueId, issueText);
    const assessment = buildAssessment(device, issue, details);

    const reportId = `PR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const report = {
      reportId,
      createdAt: new Date().toISOString()
    };

    sendJson(res, 200, {
      ok: true,
      report,
      device: {
        id: device.id,
        family: device.family,
        brand: device.brand,
        model: model || device.model
      },
      issue: {
        id: issue.id,
        label: issue.label,
        description: details || 'Kullanıcının verdiği bilgilerle ön inceleme oluşturuldu.'
      },
      assessment
    });
    return;
  }

  const guideMatch = pathname.match(/^\/api\/v1\/guides\/([a-zA-Z0-9_-]+)$/);

  if (guideMatch) {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }

    sendJson(res, 200, getGuide(guideMatch[1]));
    return;
  }

  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, {
      ok: false,
      error: 'api_route_not_found',
      message: 'API adresi bulunamadı.'
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  if (req.method === 'HEAD') {
    const filePath = pathname === '/' ? '/index.html' : pathname;
    const fullPath = path.resolve(ROOT, `.${filePath}`);

    if (!fullPath.startsWith(ROOT + path.sep) && fullPath !== ROOT) {
      res.writeHead(403);
      res.end();
      return;
    }

    fs.stat(fullPath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }

      res.writeHead(200, {
        'Content-Type': MIME_TYPES[path.extname(fullPath).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stats.size
      });
      res.end();
    });
    return;
  }

  serveStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    console.error('[PhoneRescue] Request error:', error.message);

    if (!res.headersSent && !res.writableEnded) {
      sendJson(res, 500, {
        ok: false,
        error: 'internal_server_error',
        message: 'Sunucuda beklenmeyen bir hata oluştu.'
      });
    } else if (!res.writableEnded) {
      res.destroy();
    }
  });
});

server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;

server.listen(PORT, HOST, () => {
  console.log('========================================');
  console.log(' PhoneRescue Ultra server is running');
  console.log(` Port: ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Health: http://localhost:${PORT}/api/health`);
  console.log('========================================');
});

function shutdown(signal) {
  console.log(`[PhoneRescue] ${signal} received; shutting down...`);

  server.close(error => {
    if (error) {
      console.error('[PhoneRescue] Shutdown error:', error);
      process.exitCode = 1;
    }
  });

  setTimeout(() => {
    console.error('[PhoneRescue] Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', error => {
  console.error('[PhoneRescue] Unhandled rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('[PhoneRescue] Uncaught exception:', error);
  process.exit(1);
});
