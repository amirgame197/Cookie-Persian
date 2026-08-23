import type { Claim, Inference, SignalMap } from '../types';
import type { Visit } from '../persist';
import { deviceFingerprint, totalEntropy } from '../runner';

const claim = (c: Omit<Claim, 'confidence'> & Partial<Pick<Claim, 'confidence'>>): Claim => ({
  confidence: 'likely', ...c,
});

/** Map a User-Agent string to the OS family it claims, matching fonts.impliedOS. */
function osFromUA(ua: string): 'windows' | 'macos' | 'linux' | 'android' | 'ios' | null {
  if (/Windows/.test(ua)) return 'windows';
  if (/Android/.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Macintosh|Mac OS X/.test(ua)) return 'macos';
  if (/Linux|X11/.test(ua)) return 'linux';
  return null;
}

const cap = (s: string): string => (s === 'macos' ? 'macOS' : s === 'ios' ? 'iOS' : s.charAt(0).toUpperCase() + s.slice(1));

/** Collapse to a family so Apple(iOS/macOS) and Unix(Linux/Android) don't false-flag. */
function osFamily(os: string): 'windows' | 'apple' | 'unix' | null {
  if (os === 'windows') return 'windows';
  if (os === 'macos' || os === 'ios') return 'apple';
  if (os === 'linux' || os === 'android') return 'unix';
  return null;
}

/**
 * Independent OS read from the installed text-to-speech voices. Font detection
 * is measurement-based and can misfire (it once told a Windows 11 user their
 * fonts were Linux's), so we require this second opinion before accusing anyone
 * of spoofing their User-Agent.
 */
function osFromVoices(s: SignalMap): 'windows' | 'apple' | 'unix' | null {
  const names = s['voices.hash']?.value;
  if (!Array.isArray(names) || !names.length) return null;
  const joined = names.join(' ').toLowerCase();
  if (/microsoft /.test(joined)) return 'windows';
  if (/siri|com\.apple|samantha|daniel|moira|karen|fiona|alex\b/.test(joined)) return 'apple';
  if (/google |espeak|festival/.test(joined)) return 'unix';
  return null;
}

/**
 * The lie-detector claims. Catching the browser in a contradiction is the
 * "I can't hide" beat, it plays in Act 4 alongside the VPN mismatch.
 */
export const lieDetection: Inference = (s) => {
  const out: Claim[] = [];

  const tampered = (s['lies.tamperedApis']?.value as string[] | undefined) ?? [];
  if (tampered.length >= 2) {
    out.push(claim({
      id: 'lie.tampered',
      text: `چیزی روی دستگاهتان برای پنهان کردنتان *توابع خود مرورگر را بازنویسی میکند*؛ اثرانگشت دستکاری را روی ${tampered.length} تا میبینیم.`,
      confidence: 'certain', act: 4, weight: 8,
      evidence: ['lies.tamperedApis', 'lies.records'],
      how: `توابع اصلی مرورگر امضای ثابتی دارند: صدا زدن toString() رویشان «[native code]» برمیگرداند. افزونه حریم خصوصی یا مرورگر ضد تشخیص برای جعل اثرانگشت باید جایگزینشان کند و جایگزین ها جور درنمی آیند. بررسی کردیم و ${tampered.slice(0, 3).join('، ')} رد شدند. خود تلاش برای پنهان شدن یک سیگنال است.`,
    }));
  }

  // UA-spoof detection, but ONLY when the reliable font-based OS contradicts the
  // UA. The JS-feature-matrix guess (lies.featurePlatform) is too noisy, it
  // misreads ordinary Chrome-on-Mac as Windows, so we don't trust it alone.
  const uaOS = osFromUA((s['platform.ua']?.value as string) || '');
  const fontOS = s['fonts.impliedOS']?.value as string | undefined;
  const uaFam = uaOS ? osFamily(uaOS) : null;
  const fontFam = fontOS ? osFamily(fontOS) : null;
  // Only cry "spoofed" when a second, independent signal (the installed voice
  // list) also disagrees with the User-Agent. Fonts alone are too noisy.
  const voiceFam = osFromVoices(s);
  const corroborated = voiceFam != null && voiceFam !== uaFam;
  if (uaOS && fontOS && fontOS !== 'unknown' && uaFam && fontFam && uaFam !== fontFam && corroborated) {
    out.push(claim({
      id: 'lie.platform',
      text: `User-Agent شما میگوید *${cap(uaOS)}*، اما فونت های نصب شده مال *${cap(fontOS)}* هستند. یکی دارد دروغ میگوید و فونت ها نیستند.`,
      confidence: 'likely', act: 4, weight: 8,
      evidence: ['fonts.impliedOS', 'platform.ua'],
      how: `جعل رشته User-Agent خیلی ساده است، برای همین با چیز دیگر تاییدش میکنیم. بعضی فونت ها فقط با سیستم عامل های خاص می آیند و مال شما برای ${cap(fontOS)} است، نه ${cap(uaOS)}ای که User-Agent ادعا میکند.`,
    }));
  }

  if (s['lies.brave']?.value === true) {
    out.push(claim({
      id: 'lie.brave',
      text: `از *Brave* استفاده میکنید؛ نگفتید، اما مرورگر خودش لو داد.`,
      confidence: 'certain', act: 4, weight: 5,
      evidence: ['lies.brave'],
      how: `Brave یک API پنهان navigator.brave و رفتارهای مشخص ضد اثرانگشت دارد. طنز ماجرا اینجاست که دفاع های اثرانگشت خودشان اثرانگشتند.`,
    }));
  }

  const litter = (s['lies.clientLitter']?.value as string[] | undefined) ?? [];
  if (litter.length >= 3) {
    out.push(claim({
      id: 'lie.litter',
      text: `راستی افزونه هایتان همه جای صفحه *ردپا* میگذارند؛ ${litter.length} متغیر سراسری که مرورگر تمیز ندارد. انگار یک بادکنک قرمز روشن در اینترنت دست گرفته اید.`,
      confidence: 'likely', act: 4, weight: 5,
      evidence: ['lies.clientLitter'],
      how: `شی window شما را با یک نمونه تمیز داخل iframe تو در تو که افزونه هایتان به آن نمیرسند مقایسه کردیم. متغیرهای اضافه (${litter.slice(0, 3).join('، ')}…) را افزونه هایی که همین الان اجرا میشوند تزریق کرده اند.`,
    }));
  }

  return out;
};

/** Bot/VM detection, mostly relevant for the HN crowd testing with automation. */
export const automation: Inference = (s) => {
  const out: Claim[] = [];
  if (s['bot.headless']?.value === true) {
    const reasons = (s['bot.reasons']?.value as string[] | undefined) ?? [];
    out.push(claim({
      id: 'id.bot',
      text: `آدم نیستید، یک *مرورگر خودکار* هستید. تلاش خوبی بود.`,
      confidence: 'likely', act: 4, weight: 6,
      evidence: ['bot.score', 'bot.reasons'],
      how: `مرورگرهای headless و خودکار نشانه لو میدهند: ${reasons.slice(0, 2).join('؛ ') || 'فلگ های webdriver، نبودن chrome runtime، رندر نرم افزاری'}. ${reasons.length} تایش را فعال کردید.`,
    }));
  }
  if (s['bot.vm']?.value === true) {
    out.push(claim({
      id: 'id.vm',
      text: `داخل یک *ماشین مجازی* هستید.`,
      confidence: 'likely', act: 4, weight: 5,
      evidence: ['gpu.renderer', 'bot.vm'],
      how: `رشته رندر کننده GPU شما یک آداپتور نمایش مجازی را نام میبرد (VMware / VirtualBox / Parallels / رسترکننده نرم افزاری). سخت افزار واقعی چنین چیزی گزارش نمیدهد.`,
    }));
  }
  return out;
};

/** How they arrived, phrased for the return-visit beat. */
function arrivalFlavor(): { direct: string; source: string } {
  let host = '';
  try { host = document.referrer ? new URL(document.referrer).hostname : ''; } catch { host = ''; }
  if (!host) return { direct: 'و مستقیم آمدید اینجا؛ نه لینک، نه جستجو. URL را از حفظ بودید. تقریبا شیرین است.', source: '' };
  let name = host.replace(/^www\./, '');
  if (/news\.ycombinator/.test(host)) name = 'Hacker News';
  else if (/(twitter|x)\.com|t\.co/.test(host)) name = 'X';
  else if (/reddit/.test(host)) name = 'Reddit';
  else if (/linkedin/.test(host)) name = 'LinkedIn';
  else if (/github/.test(host)) name = 'GitHub';
  else if (/google\./.test(host)) name = 'جستجوی Google';
  return { direct: '', source: `و باز هم از ${name} برگشتید.` };
}

/** The return-visit gotcha, the whole argument, made personal. */
export function returnVisit(visit: Visit): Claim[] {
  const wiped = visit.restored.length;
  const arrival = arrivalFlavor();

  // Storage is being blocked outright, so we genuinely cannot tell whether
  // you've been here before. Say that, rather than insisting it's your first
  // visit every single time (which is what people kept, correctly, calling out).
  if (!visit.persisted) {
    return [claim({
      id: 'id.nostore',
      text: `تلاش کردم نشانه تان بزنم تا دفعه بعد بشناسمتان. مرورگر *انداختش دور*. هر ذخیره سازی که سراغش رفتم خالی بود؛ پس برای من هر بازدید غریبه اید. تنظیماتتان دارد کار میکند و از چیزی که فکر میکنید کمیاب تر است.`,
      confidence: 'certain', act: 9, weight: 9,
      evidence: [],
      how: `یک نشانه تصادفی در localStorage، IndexedDB، Cache API و window.name مینویسیم و بی درنگ میخوانیم. هیچ چیز نماند، یعنی محافظت ردیابی سخت گیرانه، پنجره خصوصی یا پاک کردن هنگام بستن. این دوطرفه است: اگر مرورگر canvas و صدا را هم تصادفی کند (resistFingerprinting در Firefox همین کار را میکند)، اثرانگشتتان در هر بازدید عوض میشود و برای همین هر بار متفاوت دیده میشود.`,
    })];
  }

  // First-time visitor still gets a line, foreshadowing the persistence.
  if (visit.count <= 1) {
    return [claim({
      id: 'id.return',
      text: arrival.direct
        ? `اولین بارتان اینجاست و خودتان لینک را تایپ کردید، جسورید. در هر حال از حالا *یادتان میماند*. کل ماجرا همین است.`
        : `بار اولتان است؟ از حالا *یادتان میماند*، بدون نیاز به کوکی. برگردید تا ثابت کنم.`,
      confidence: 'certain', act: 9, weight: 8,
      evidence: [],
      how: `همین الان یک نشانه تصادفی را نه در کوکی، بلکه همزمان در localStorage، IndexedDB، Cache API و window.name ذخیره کردم. کوکی ها را پاک کنید، برگردید و باز هم میشناسمتان. کل دمو همین است.`,
    })];
  }

  const daysAgo = Math.max(0, Math.round((Date.now() - visit.first) / 86400000));
  const when = daysAgo === 0 ? 'اوایل امروز' : daysAgo === 1 ? 'دیروز' : `${daysAgo} روز پیش`;
  const lede = visit.count >= 4
    ? `واقعا این سایت را *خیلی* دوست دارید، نه؟ این بازدید شماره *${visit.count}* است.`
    : `قبلا دیده بودمتان؛ اولین بار *${when}* پیدایتان شد. این بازدید شماره *${visit.count}* است.`;

  const out: Claim[] = [claim({
    id: 'id.return',
    text: `${lede} ${arrival.direct || arrival.source}`.trim(),
    confidence: 'certain', act: 9, weight: 8,
    evidence: [],
    how: `در بازدید اول یک نشانه تصادفی را نه در کوکی، بلکه همزمان در localStorage، IndexedDB، Cache API و window.name ذخیره کردم. هرگز اسمتان را نفهمیدم؛ فقط نشانه را شناختم و شمردم.`,
  })];

  if (wiped > 0) {
    out.push(claim({
      id: 'id.evercookie',
      text: `و *بخشی از آن را پاک کردید*؛ وقتی رسیدید ${wiped} تا از مخفیگاه ها خالی بود. از آن هایی که جا انداختید برگرداندمشان. ردیابی بدون کوکی همین شکلی است.`,
      confidence: 'certain', act: 9, weight: 10,
      evidence: [],
      how: `${visit.restored.join('، ')} را پاک کردید، اما ${visit.survivors.join('، ')} هنوز نشانه را داشتند. دوباره در جاهای خالی کپی اش کردم. برای فراموش کردنتان همه ذخیره سازی ها باید همان لحظه پاک شوند، برای همین «پاک کردن کوکی ها» هرگز کافی نبود. (پایین دکمه فراموشم کن هست؛ واقعا کار میکند.)`,
    }));
  }
  return out;
}

/** The receipt: uniqueness, entropy, and the fingerprint hash. */
export function verdict(s: SignalMap): { claims: Claim[]; fingerprint: string; bits: number } {
  const fingerprint = deviceFingerprint(s);
  const bits = totalEntropy(s);
  // 2^bits people share your bucket; invert for "1 in N".
  const oneIn = Math.round(Math.pow(2, bits));

  const claims: Claim[] = [claim({
    id: 'id.entropy',
    text: `جمع بندی: تقریبا *۱ در ${format(oneIn)}* مرورگر شبیه مال شماست. هیچ کدام از این ها کوکی استفاده نکرد.`,
    confidence: 'likely', act: 10, weight: 9,
    evidence: ['gpu.renderer', 'canvas.hash', 'fonts.hash', 'audio.hash'],
    how: `اطلاعات شناسایی کننده همه سیگنال ها را جمع کردیم (${bits.toFixed(1)} بیت آنتروپی) و به کمیابی تبدیل کردیم. عدد دقیق تخمینی است؛ حرف این است که مرور ناشناس واقعا ناشناس نیست.`,
  })];

  return { claims, fingerprint, bits };
}

function format(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} میلیارد`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} میلیون`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)},000`;
  return String(n);
}
