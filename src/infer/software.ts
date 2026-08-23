import type { Claim, Inference, SignalMap } from '../types';

const claim = (c: Omit<Claim, 'confidence'> & Partial<Pick<Claim, 'confidence'>>): Claim => ({
  confidence: 'likely', ...c,
});

interface SoftwareHit { name: string; fonts: string[]; confidence: Claim['confidence']; }

/** Installed software inferred from font presence. The LaTeX hit is the star. */
export const softwareFromFonts: Inference = (s) => {
  const hits = (s['fonts.software']?.value as SoftwareHit[] | undefined) ?? [];
  const out: Claim[] = [];

  for (const hit of hits) {
    const line = softwareLine(hit);
    if (!line) continue;
    out.push(claim({
      id: `sw.${slug(hit.name)}`,
      text: line.text,
      confidence: hit.confidence,
      act: 5, weight: line.weight,
      evidence: ['fonts.software', 'fonts.list'],
      how: `نمیتوانیم فایل های شما را فهرست کنیم، اما میتوانیم از مرورگر بپرسیم کدام فونت ها رندر میشوند. «${hit.fonts.slice(0, 3).join('»، «')}» نصب هستند و با ${hit.name} می آیند. ${line.aside}`,
    }));
  }
  return out;
};

const OS_NAMES: Record<string, string> = {
  windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android',
};

/** OS and OS-version from font tells, often more precise than the User-Agent. */
export const osFromFonts: Inference = (s) => {
  const ver = s['fonts.impliedOSVersion']?.value as string | undefined;
  const raw = s['fonts.impliedOS']?.value as string | undefined;
  const ua = (s['platform.ua']?.value as string | undefined) ?? '';
  const touch = typeof s['hw.touchPoints']?.value === 'number' ? (s['hw.touchPoints'].value as number) : 0;

  // iOS and iPadOS ship the SAME system fonts as macOS, so the font bucket
  // reports "macos" on an iPhone (which is how this used to announce "Macos" to
  // iPhone users). The UA is the honest tell here: an iPhone says so outright,
  // and an iPad has worn a desktop "Macintosh" UA since iPadOS 13 — the
  // touchscreen is what gives that one away, since no Mac has one.
  const isIphone = /iPhone|iPod/.test(ua);
  const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch > 1);

  // The version tell only exists for Windows (Segoe icon fonts); never for iOS.
  if (ver && !isIphone && !isIpad) {
    return [claim({
      id: 'sw.osVersion',
      text: `سیستم شما *${ver}* است.`,
      confidence: 'likely', act: 2, weight: 5,
      evidence: ['fonts.impliedOSVersion'],
      how: `${ver} یک فونت سیستمی دارد که نسخه های قبل ندارند. بررسیش کردیم و رندر شد، پس بدون پرسیدن نه فقط سیستم عامل، بلکه نسخه اش را هم میدانیم.`,
    })];
  }

  const os = isIphone ? 'iOS' : isIpad ? 'iPadOS' : (raw && raw !== 'unknown' ? OS_NAMES[raw] : undefined);
  if (!os) return [];

  const fontBased = !isIphone && !isIpad;
  return [claim({
    id: 'sw.os',
    text: `سیستم عامل شما *${os}* است.`,
    confidence: fontBased ? 'likely' : 'certain', act: 2, weight: 3,
    evidence: fontBased ? ['fonts.impliedOS'] : ['platform.ua', 'hw.touchPoints'],
    how: fontBased
      ? `بعضی فونت ها فقط روی ${os} وجود دارند. این فونت ها در سیستم شما نمایش داده شدند، بنابراین نتیجه می‌گیریم که از ${os} استفاده میکنید. مستقل از هر چیزی که User-Agent شما ادعا می‌کند.`
      : isIpad
        ? `${os} از فونت‌های macOS استفاده میکند، بنابراین ترفند تشخیص فونت به تنهایی آن را با مک اشتباه میگیرد. نشانه تعیین کننده: ترکیب User-Agent حاوی مکینتاش با صفحه نمایش لمسی نشان میدهد که دستگاه یک آیپد است، نه لپ‌تاپ.`
        : `${os} از فونت‌های macOS استفاده میکند، بنابراین ترفند تشخیص فونت به تنهایی آن را مک تشخیص میداد. User-Agent شما تکلیف را روشن میکند: همچنان می‌گوید آیفون.`,
  })];
};

/**
 * Speech-synthesis voices. We do NOT infer "languages you read" from these,
 * Windows and macOS ship dozens of language voices by default, so that's noise.
 * The honest signal is (a) the exact voice list as a fingerprint, and (b) the
 * languages the user actually *configured* in their browser, which is a real
 * preference, not a shipped default.
 */
export const languagePacks: Inference = (s) => {
  const count = s['voices.count']?.value as number | undefined;
  const prefs = s['platform.languages']?.value as string[] | undefined;
  const out: Claim[] = [];

  // Real signal: extra configured languages beyond the primary one.
  if (prefs && prefs.length > 1) {
    const names = [...new Set(prefs.map((l) => languageName(l.split('-')[0])).filter(Boolean))];
    const nonEnglish = names.filter((n) => n !== 'English');
    if (names.length > 1) {
      out.push(claim({
        id: 'sw.langprefs',
        text: nonEnglish.length
          ? `شما مرورگر خود را تنظیم کرده اید تا ${list(names)} را ترجیح دهد، پس احتمالاً ${list(nonEnglish)} میخوانید.`
          : `شما چندین تنظیم زبانی را پیکربندی کرده اید: ${list(names)}.`,
        confidence: 'likely', act: 5, weight: 4,
        evidence: ['platform.languages'],
        how: `مرورگر شما در هر درخواست یک فهرست مرتب از زبان های مورد پسندتان (navigator.languages) میفرستد؛ خودتان تنظیمش کرده اید، پیش فرض نیست. سایت ها از آن حدس میزنند کجایی هستید و چه میخوانید.`,
      }));
    }
  }

  // Fingerprint signal: the voice list itself, not the languages.
  if (count && count > 0) {
    out.push(claim({
      id: 'sw.voices',
      text: `سیستم شما *${count} صدای تبدیل متن به گفتار* نصب دارد، مجموعه دقیقشان اثرانگشت قوی ای است.`,
      confidence: 'likely', act: 5, weight: 2,
      evidence: ['voices.count', 'voices.hash'],
      how: `speechSynthesis.getVoices() همه صداهای نصب شده را برمیگرداند. فهرست بر اساس سیستم عامل، نسخه آن و صداهایی که دانلود کرده اید فرق میکند؛ آنقدر که برای شناخت تنظیمات دقیق شما کمک کند، بدون نیاز به دسترسی.`,
    }));
  }
  return out;
};

/** Codec/DRM support → hardware generation and streaming setup. */
export const codecInference: Inference = (s) => {
  const support = s['codecs.support']?.value as Record<string, string> | undefined;
  if (!support) return [];
  const out: Claim[] = [];
  const has = (k: string) => support[k] && support[k] !== 'no' && support[k] !== '';

  if (has('hevc') && has('dolbyVision')) {
    out.push(claim({
      id: 'sw.appleHw',
      text: `سخت افزار شما *Dolby Vision* را دیکود میکند؛ یعنی Apple silicon یا یک سیستم رده بالا.`,
      confidence: 'likely', act: 3, weight: 4,
      evidence: ['codecs.support'],
      how: `Dolby Vision و دیکود سخت افزاری HEVC کنار هم به سخت افزار جدید Apple یا یک چیپ ممتاز دارای مجوز اشاره میکنند. از مرورگر پرسیدیم چه چیزی پخش میکند؛ خودش گفت.`,
    }));
  } else if (has('av1')) {
    out.push(claim({
      id: 'sw.av1',
      text: `میتوانید *AV1* را سخت افزاری دیکود کنید؛ یعنی سیلیکون جدید و توانمند.`,
      confidence: 'guess', act: 3, weight: 2,
      evidence: ['codecs.support'],
      how: `دیکود سخت افزاری AV1 فقط در GPU و SoCهای جدید وجود دارد (Intel نسل ۱۱ به بعد، RTX سری ۳۰ به بعد، Apple M). پس دستگاه شما قدیمی نیست.`,
    }));
  }
  return out;
};

// --- helpers ---------------------------------------------------------------

function softwareLine(hit: SoftwareHit): { text: string; weight: number; aside: string } | null {
  const name = hit.name.toLowerCase();
  if (name.includes('latex') || name.includes('tex')) {
    return {
      text: `*فونت های LaTeX* را نصب دارید. مقاله های دانشگاهی، یا یک کار پر از ریاضی.`,
      weight: 8,
      aside: `تقریبا هیچ کس بیرون از پژوهش و دانشگاه این ها را ندارد؛ یکی از لو دهنده ترین فونت هایی است که میتوانید نشت بدهید.`,
    };
  }
  if (name.includes('adobe')) {
    return { text: `*فونت های Adobe* را نصب دارید.`, weight: 5, aside: `نرم افزار طراحی یا عکاسی آن ها را آورده، هرچند فونت ها مدت ها بعد از پاک شدن برنامه میمانند.` };
  }
  if (name.includes('office')) {
    return { text: `*فونت های Microsoft Office* روی این دستگاه هستند.`, weight: 3, aside: `فونت ها از نرم افزاری که نصبشان کرده بیشتر میمانند، پس یعنی Office یک زمانی اینجا بوده، نه لزوما اینکه هنوز از آن استفاده میکنید.` };
  }
  if (name.includes('developer') || name.includes('coding')) {
    return { text: `فونت های برنامه نویسی نصب دارید، *کد میزنید*.`, weight: 6, aside: `این فونت ها با هیچ سیستم عاملی نمی آیند؛ خودتان رفتید نصبشان کردید.` };
  }
  if (name.includes('japanese') || name.includes('chinese') || name.includes('korean') || name.includes('asian') || name.includes('language')) {
    return { text: `پشتیبانی *${hit.name}* را نصب دارید.`, weight: 5, aside: `این نشانه قوی ای از زبانی است که میخوانید یا مینویسید.` };
  }
  return { text: `*${hit.name}* را نصب دارید.`, weight: 3, aside: '' };
}

const LANG: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', ru: 'Russian', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese', ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', pl: 'Polish',
  sv: 'Swedish', da: 'Danish', fi: 'Finnish', no: 'Norwegian', cs: 'Czech',
  el: 'Greek', he: 'Hebrew', th: 'Thai', vi: 'Vietnamese', id: 'Indonesian',
  uk: 'Ukrainian', ro: 'Romanian', hu: 'Hungarian', ta: 'Tamil', te: 'Telugu',
};

function languageName(code: string): string { return LANG[code] ?? ''; }
function list(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} و ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} و ${items[items.length - 1]}`;
}
function slug(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
