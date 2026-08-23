import type { Probe, Signal } from '../types';

const sig = (id: string, label: string, value: unknown, extra: Partial<Signal> = {}): Signal => ({
  id, label, value, ...extra,
});

/** Platform, browser and locale, the mundane stuff, stated with uncomfortable precision. */
export const platformProbe: Probe = {
  id: 'platform',
  title: 'پلتفرم',
  tier: 0,
  async run() {
    const n = navigator as Navigator & {
      userAgentData?: {
        platform?: string;
        mobile?: boolean;
        brands?: Array<{ brand: string; version: string }>;
        getHighEntropyValues?: (h: string[]) => Promise<Record<string, unknown>>;
      };
      deviceMemory?: number;
      oscpu?: string;
    };

    const out: Signal[] = [
      sig('platform.ua', 'User-Agent', navigator.userAgent, { entropy: 10 }),
      sig('platform.platform', 'navigator.platform', navigator.platform, { entropy: 2 }),
      sig('platform.languages', 'زبان ها', navigator.languages, {
        display: navigator.languages?.join(', '),
        entropy: 4,
      }),
      sig('platform.dnt', 'ردیابی نشوید', navigator.doNotTrack ?? null),
      sig('platform.gpc', 'کنترل جهانی حریم خصوصی',
        (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl ?? null),
      sig('platform.cookieEnabled', 'کوکی ها فعالند', navigator.cookieEnabled),
      sig('platform.pdfViewer', 'نمایشگر PDF',
        (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled ?? null),
      sig('platform.webdriver', 'navigator.webdriver', navigator.webdriver ?? false),
    ];

    // High-entropy client hints: the browser will volunteer CPU architecture,
    // OS version and even device model, no permission required.
    if (n.userAgentData?.getHighEntropyValues) {
      try {
        const hints = await n.userAgentData.getHighEntropyValues([
          'architecture', 'bitness', 'model', 'platformVersion',
          'fullVersionList', 'uaFullVersion', 'wow64',
        ]);
        out.push(
          sig('platform.arch', 'معماری CPU', hints.architecture ?? null, { entropy: 1 }),
          sig('platform.bitness', 'تعداد بیت', hints.bitness ?? null),
          sig('platform.model', 'مدل دستگاه', hints.model || null, { entropy: 3 }),
          sig('platform.osVersion', 'نسخه سیستم عامل', hints.platformVersion ?? null, { entropy: 3 }),
          sig('platform.browserVersions', 'نسخه کامل مرورگر', hints.fullVersionList ?? null, {
            display: Array.isArray(hints.fullVersionList)
              ? (hints.fullVersionList as Array<{ brand: string; version: string }>)
                  .map((b) => `${b.brand} ${b.version}`).join(', ')
              : undefined,
            entropy: 4,
          }),
        );
      } catch { /* hint request rejected */ }
    }

    if (n.userAgentData?.platform) {
      out.push(sig('platform.uadPlatform', 'UA-CH platform', n.userAgentData.platform));
      out.push(sig('platform.mobile', 'موبایل', n.userAgentData.mobile ?? null));
    }

    return out;
  },
};

/** Screen geometry, pixel ratio, and, via rAF, the actual refresh rate. */
export const displayProbe: Probe = {
  id: 'display',
  title: 'نمایشگر',
  tier: 0,
  async run() {
    const s = screen;
    const out: Signal[] = [
      sig('display.resolution', 'وضوح صفحه', [s.width, s.height], {
        display: `${s.width} × ${s.height}`, entropy: 4.8,
      }),
      sig('display.available', 'فضای در دسترس', [s.availWidth, s.availHeight], {
        display: `${s.availWidth} × ${s.availHeight}`, entropy: 4,
      }),
      sig('display.pixelRatio', 'نسبت پیکسل دستگاه', devicePixelRatio, { entropy: 1.5 }),
      sig('display.colorDepth', 'عمق رنگ', s.colorDepth),
      sig('display.viewport', 'فضای دید', [innerWidth, innerHeight], {
        display: `${innerWidth} × ${innerHeight}`,
      }),
      sig('display.orientation', 'جهت صفحه', s.orientation?.type ?? null),
    ];

    // The gap between the browser window and the screen tells you roughly how
    // much OS chrome is present, menu bar, dock, taskbar position.
    out.push(sig('display.chromeHeight', 'ارتفاع نوارهای سیستم', s.height - s.availHeight));
    out.push(sig('display.chromeWidth', 'عرض نوارهای سیستم', s.width - s.availWidth));

    // Refresh rate: sample rAF deltas and take the median, which survives the
    // occasional dropped frame far better than a mean.
    const hz = await new Promise<number>((resolve) => {
      const times: number[] = [];
      let last = performance.now();
      let frames = 0;
      const tick = (now: number) => {
        times.push(now - last);
        last = now;
        if (++frames < 22) requestAnimationFrame(tick);
        else {
          const sorted = times.slice(2).sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)] || 16.7;
          resolve(Math.round(1000 / median));
        }
      };
      requestAnimationFrame(tick);
      setTimeout(() => resolve(0), 900);
    });
    out.push(sig('display.refreshHz', 'نرخ تازه سازی', hz, { display: hz ? `${hz} هرتز` : 'نامشخص', entropy: 1.2 }));

    return out;
  },
};

/** CPU, memory, input capability, and connected media device counts. */
export const hardwareProbe: Probe = {
  id: 'hw',
  title: 'سخت افزار',
  tier: 0,
  async run() {
    const n = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean; type?: string };
      getBattery?: () => Promise<{ level: number; charging: boolean; chargingTime: number; dischargingTime: number }>;
    };

    const out: Signal[] = [
      sig('hw.cores', 'هسته های CPU', navigator.hardwareConcurrency ?? null, { entropy: 2.4 }),
      sig('hw.memory', 'حافظه دستگاه (گیگابایت)', n.deviceMemory ?? null, { entropy: 1.8 }),
      sig('hw.touchPoints', 'بیشترین نقطه لمس', navigator.maxTouchPoints ?? 0),
      sig('hw.pointerCoarse', 'اشاره گر درشت', matchMedia('(pointer: coarse)').matches),
      sig('hw.hover', 'توانایی هاور', matchMedia('(hover: hover)').matches),
    ];

    if (n.connection) {
      out.push(
        sig('hw.netType', 'نوع اتصال', n.connection.effectiveType ?? n.connection.type ?? null),
        sig('hw.downlink', 'سرعت دانلود (مگابیت)', n.connection.downlink ?? null),
        sig('hw.rtt', 'زمان رفت و برگشت (میلی ثانیه)', n.connection.rtt ?? null),
        sig('hw.saveData', 'Save-Data', n.connection.saveData ?? null),
      );
    }

    // Device counts require no permission at all; only the *labels* are gated.
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const count = (kind: string) => devices.filter((d) => d.kind === kind).length;
      out.push(
        sig('hw.cameras', 'دوربین های وصل شده', count('videoinput'), { entropy: 1.2 }),
        sig('hw.microphones', 'میکروفون های وصل شده', count('audioinput'), { entropy: 1.2 }),
        sig('hw.speakers', 'خروجی های صدا وصل شده', count('audiooutput'), { entropy: 1.2 }),
        sig('hw.deviceLabels', 'اسم دستگاه ها خواندنی است', devices.some((d) => d.label !== '')),
      );
    } catch { /* enumerateDevices unavailable */ }

    if (n.getBattery) {
      try {
        const b = await n.getBattery();
        out.push(
          sig('hw.batteryLevel', 'شارژ باتری', b.level, { display: `${Math.round(b.level * 100)}%`, entropy: 2 }),
          sig('hw.charging', 'درحال شارژ', b.charging),
        );
      } catch { /* battery gated */ }
    }

    return out;
  },
};

/** Timezone, locale formatting quirks, and the accessibility media queries. */
export const environmentProbe: Probe = {
  id: 'env',
  title: 'محیط',
  tier: 0,
  async run() {
    const dtf = Intl.DateTimeFormat().resolvedOptions();
    const mq = (q: string) => matchMedia(q).matches;

    return [
      sig('env.timezone', 'منطقه زمانی', dtf.timeZone, { entropy: 3.2 }),
      sig('env.tzOffset', 'اختلاف با UTC (دقیقه)', -new Date().getTimezoneOffset()),
      sig('env.locale', 'منطقه', dtf.locale, { entropy: 2 }),
      sig('env.calendar', 'تقویم', dtf.calendar),
      sig('env.numbering', 'سیستم شماره گذاری', dtf.numberingSystem),
      sig('env.currency', 'فرمت حدسی پول',
        new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(1234.5)),
      sig('env.localTime', 'زمان محلی', new Date().toString()),
      sig('env.hour', 'ساعت محلی (۰ تا ۲۳)', new Date().getHours()),

      sig('env.colorScheme', 'رنگ مورد پسند', mq('(prefers-color-scheme: dark)') ? 'تیره' : 'روشن'),
      sig('env.reducedMotion', 'انیمیشن کمتر را ترجیح میدهد', mq('(prefers-reduced-motion: reduce)'), { entropy: 1 }),
      sig('env.reducedTransparency', 'شفافیت کمتر را ترجیح میدهد', mq('(prefers-reduced-transparency: reduce)')),
      sig('env.contrast', 'کنتراست مورد پسند',
        mq('(prefers-contrast: more)') ? 'more' : mq('(prefers-contrast: less)') ? 'less' : 'no-preference'),
      sig('env.forcedColors', 'رنگ های اجباری', mq('(forced-colors: active)'), { entropy: 1.5 }),
      sig('env.invertedColors', 'رنگ های برعکس', mq('(inverted-colors: inverted)')),
      sig('env.monochrome', 'نمایشگر تک رنگ', mq('(monochrome: 1)')),
      sig('env.dynamicRange', 'توانایی HDR', mq('(dynamic-range: high)')),
      sig('env.colorGamut', 'گستره رنگ',
        mq('(color-gamut: rec2020)') ? 'rec2020' : mq('(color-gamut: p3)') ? 'p3' : 'srgb', { entropy: 1 }),
    ];
  },
};

/** Codec support, a decent proxy for OS version and hardware tier. */
export const codecProbe: Probe = {
  id: 'codecs',
  title: 'کدک ها',
  tier: 0,
  async run() {
    const v = document.createElement('video');
    const a = document.createElement('audio');
    const CANDIDATES: Array<[string, string, HTMLMediaElement]> = [
      ['h264', 'video/mp4; codecs="avc1.42E01E"', v],
      ['hevc', 'video/mp4; codecs="hvc1.1.6.L93.B0"', v],
      ['av1', 'video/mp4; codecs="av01.0.08M.08"', v],
      ['vp9', 'video/webm; codecs="vp9"', v],
      ['dolbyVision', 'video/mp4; codecs="dvh1.05.07"', v],
      ['aac', 'audio/mp4; codecs="mp4a.40.2"', a],
      ['flac', 'audio/flac', a],
      ['opus', 'audio/webm; codecs="opus"', a],
      ['eac3', 'audio/mp4; codecs="ec-3"', a],
    ];

    const support: Record<string, string> = {};
    for (const [name, type, el] of CANDIDATES) support[name] = el.canPlayType(type) || 'no';

    // NOTE: we deliberately do NOT call requestMediaKeySystemAccess() to probe
    // Widevine. It makes Firefox show a "allow DRM content?" prompt, which would
    // make this page's central claim ("it asked for zero permissions") a lie.
    // canPlayType() alone is passive and prompts nothing.

    return [
      sig('codecs.support', 'پشتیبانی کدک', support, {
        display: Object.entries(support).filter(([, r]) => r !== 'no').map(([k]) => k).join(', '),
        entropy: 2.5,
      }),
      sig('codecs.hash', 'اثرانگشت کدک', JSON.stringify(support)),
    ];
  },
};

/** Installed speech voices: a surprisingly loud signal about OS and language packs. */
export const voiceProbe: Probe = {
  id: 'voices',
  title: 'صداهای گفتار',
  tier: 1,
  async run() {
    const voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const got = speechSynthesis.getVoices();
      if (got.length) return resolve(got);
      const t = setTimeout(() => resolve(speechSynthesis.getVoices()), 600);
      speechSynthesis.onvoiceschanged = () => { clearTimeout(t); resolve(speechSynthesis.getVoices()); };
    });

    const names = voices.map((v) => `${v.name}|${v.lang}`);
    const langs = [...new Set(voices.map((v) => v.lang))].sort();

    return [
      sig('voices.count', 'صداهای نصب شده', voices.length, { entropy: 3 }),
      sig('voices.langs', 'زبان صداها', langs, { display: langs.join(', '), entropy: 4 }),
      sig('voices.hash', 'فهرست صداها', names, { display: names.slice(0, 8).join(', '), entropy: 6 }),
      sig('voices.local', 'صداهای ساخته شده محلی', voices.filter((v) => v.localService).length),
    ];
  },
};
