import type { SignalMap } from '../types';
import type { IntroSegment } from './intro';
import { classifyMacintosh } from '../infer/mac';

/**
 * Builds the intro narration. Static thesis lines are literal (they type while
 * the probes are still running); the spec call-out is a lazy segment that awaits
 * the gathered signals and splices in your real hardware.
 */
export function buildIntroSegments(signals: SignalMap, gather: Promise<unknown>): IntroSegment[] {
  const segments: IntroSegment[] = [];

  const ref = referrerLine();
  if (ref) segments.push(ref);

  segments.push(
    'سلام.',
    'سال هاست که همه افراد آنلاین این موضوع را میدانند: وبسایت ها می توانند شما را *اثر انگشت گذاری* کنند. شما را شناسایی کنند. شما را دنبال کنند.',
    "بنابراین ما بنرهای کوکی را رد میکنیم. ما به دنبال دکمه *رد کردن همه* میگردیم. و بعد کمی احساس امنیت بیشتری میکنیم.",
    'خبر های بدی دارم.',
    "مرورگرهای مدرن تقریبا دیگر به *کوکی* نیاز ندارند.",
    'این صفحه *صفر* کوکی تنظیم کرده است. *هیچ مجوزی* درخواست نکرده است. شما روی *هیچ چیزی* کلیک نکرده‌اید.',
    'و با این حال...',
  );

  // Lazy: wait for the probes, then narrate the machine we found.
  segments.push(async () => {
    await gather;
    return specLines(signals);
  });

  segments.push("به هر حال. بگذار بقیه چیزهایی که از قبل در موردت میدانم را نشان دهم.");
  return segments;
}

function referrerLine(): string | null {
  let host = '';
  try { host = document.referrer ? new URL(document.referrer).hostname : ''; } catch { host = ''; }
  if (!host) return null;
  if (/news\.ycombinator\.com/.test(host)) return 'شما از Hacker News آمده‌اید. بله، این بخش از قبل میداند که شما از کجا آمده‌اید.';
  if (/lobste\.rs/.test(host)) return 'شما از Lobsters آمده‌اید. انتخاب خوبی است.';
  if (/reddit\.com|redd\.it/.test(host)) return 'شما از Reddit آمده‌اید. کسی این را منتشر کرده و حالا شما اینجا هستید.';
  if (/(twitter|x)\.com|t\.co/.test(host)) return 'شما از X آمده‌اید. کسی این را در ایکس به اشتراک گذاشته است.';
  if (/linkedin\.com|lnkd\.in/.test(host)) return 'شما از LinkedIn آمده‌اید. امیدواریم این هم مصداقی از رهبری فکری محسوب شود.';
  if (/github\.com/.test(host)) return 'شما از GitHub آمده‌اید. پس شما هم یکی از خودمان هستید.';
  if (/producthunt/.test(host)) return 'شما از Product Hunt آمده‌اید. به دنیای پذیرندگان اولیه خوش آمدید.';
  if (/news\.google|google\./.test(host)) return 'شما از جست و جوی گوگل آمده‌اید. چه چیزی جست و جو کردید که به اینجا رسیدید؟';
  if (/bing\.com|duckduckgo\.com|search\.brave/.test(host)) return 'شما از یک موتور جست‌ و جو آمده‌اید. از نوعی که حتی به حریم خصوصی هم اهمیت می‌دهد.';
  if (/t\.me|telegram/.test(host)) return 'شما از Telegram آمده‌اید. کسی این را برایتان فرستاده است.';
  if (/mastodon|bsky|fosstodon|\.social/.test(host)) return 'شما از فدیورس آمده‌اید. البته که همین‌طور است.';
  if (/facebook\.com|fb\./.test(host)) return 'شما از Facebook آمده‌اید. جسارت میخواهد که هنوز آنجا باشید.';
  if (/instagram\.com/.test(host)) return 'شما از Instagram آمده‌اید. کسی این را از میان پست‌ های خود برایتان فرستاده است.';
  if (/threads\.net/.test(host)) return 'شما از Threads آمده‌اید. کسی حرفی برای گفتن داشته است.';
  if (/youtube\.com|youtu\.be/.test(host)) return 'شما از YouTube آمده‌اید. یک ویدیو شما را به اینجا رسانده است.';
  if (/tiktok\.com/.test(host)) return 'شما از TikTok آمده‌اید. الگوریتم شما را به اینجا رسانده است.';
  if (/snapchat\.com/.test(host)) return 'شما از Snapchat آمده‌اید. کسی این را قبل از ناپدید شدن برایتان فرستاده است.';
  if (/pinterest\.com|pin\.it/.test(host)) return 'شما از Pinterest آمده‌اید. به دنبال الهام بودید و به اینجا رسیدید.';
  if (/whatsapp\.com|wa\.me/.test(host)) return 'شما از WhatsApp آمده‌اید. کسی این را برایتان فوروارد کرده است.';
  if (/messenger\.com/.test(host)) return 'شما از Messenger آمده‌اید. کسی این را در گفت‌ و گو برایتان فرستاده است.';
  if (/signal\.org/.test(host)) return 'شما از Signal آمده‌اید. کسی به اندازه کافی به شما اعتماد داشته است که این را بفرستد.';
  if (/wechat\.com/.test(host)) return 'شما از WeChat آمده‌اید. کسی این را با شما به اشتراک گذاشته است.';
  if (/line\.me/.test(host)) return 'شما از LINE آمده‌اید. کسی این را برایتان فرستاده است.';
  if (/kakao\.com/.test(host)) return 'شما از Kakao آمده‌اید. کسی این را در گفت‌ و گو فرستاده است.';
  if (/slack\.com/.test(host)) return 'شما از Slack آمده‌اید. کسی این را در یک کانال به اشتراک گذاشته است.';
  if (/discord/.test(host)) return 'شما از Discord آمده‌اید. کسی این را در یک سرور منتشر کرده است.';
  if (/twitch\.tv/.test(host)) return 'شما از Twitch آمده‌اید. کسی در حین پخش زنده به این موضوع اشاره کرده است.';
  if (/spotify\.com/.test(host)) return 'شما از Spotify آمده‌اید. ظاهراً یک آهنگ شما را به اینجا رسانده است..؟';
  if (/soundcloud\.com/.test(host)) return 'شما از SoundCloud آمده‌اید. کسی یک قطعه موسیقی را با شما به اشتراک گذاشته است.';
  if (/stack(?:overflow|exchange)\.com/.test(host)) return 'شما از Stack Overflow آمده‌اید. چیزی درست کار نمی‌ کرد، مگر نه؟';
  if (/dev\.to/.test(host)) return 'شما از DEV آمده‌اید. کسی مشغول نوشتن کد بوده و شما را به اینجا فرستاده است.';
  if (/medium\.com/.test(host)) return 'شما از Medium آمده‌اید. به شما وعده یک مطلب جالب داده شده بود.';
  if (/substack\.com/.test(host)) return 'شما از Substack آمده‌اید. کسی حرف‌هایی برای گفتن داشته و آن‌ ها را با شما به اشتراک گذاشته است.';
  if (/quora\.com/.test(host)) return 'شما از Quora آمده‌اید. کسی سؤالی پرسیده است.';
  if (/patreon\.com/.test(host)) return 'شما از Patreon آمده‌اید. طبیعتاً در حال حمایت از سازندگان محتوا هستید.';
  if (/ko-fi\.com|buymeacoffee\.com/.test(host)) return 'شما از گوشه‌ای از اینترنت آمده‌اید که با قهوه کار می‌کند.';
  if (/letterboxd\.com/.test(host)) return 'شما از Letterboxd آمده‌اید. ظاهراً کسی درباره این موضوع نظری داشته است.';
  if (/goodreads\.com/.test(host)) return 'شما از Goodreads آمده‌اید. به دنبال چیزی ارزشمند برای خواندن بودید.';
  if (/chatgpt\.com|chat\.openai\.com/.test(host)) return 'شما از ChatGPT آمده‌اید. ظاهراً ربات‌ها شما را به اینجا فرستاده‌اند.';
  if (/openai\.com/.test(host)) return 'شما از OpenAI آمده‌اید. ظاهراً کسی ماشین‌ها را احضار کرده است.';
  if (/claude\.ai|anthropic\.com/.test(host)) return 'شما از Claude آمده‌اید. یک هوش مصنوعی متفکر شما را به اینجا فرستاده است.';
  if (/gemini\.google\.com/.test(host)) return 'شما از Gemini آمده‌اید. گوگل شما را به این سمت هدایت کرده است.';
  if (/perplexity\.ai/.test(host)) return 'شما از Perplexity آمده‌اید. سؤالی پرسیدید و در نهایت به اینجا رسیدید.';
  if (/copilot\.microsoft\.com/.test(host)) return 'شما از Copilot آمده‌اید. مایکروسافت شما را به یک مسیر فرعی فرستاده است.';
  if (/npmjs\.com/.test(host)) return 'شما از npm آمده‌اید. کسی به یک پکیج نیاز داشته و در نهایت شما را پیدا کرده است.';
  if (/pypi\.org/.test(host)) return 'شما از PyPI آمده‌اید. احتمالاً پای پایتون در میان بوده است.';
  if (/gitlab\.com/.test(host)) return 'شما از GitLab آمده‌اید. یک مخزن کد دیگر، یک روز دیگر.';
  if (/bitbucket\.org/.test(host)) return 'شما از Bitbucket آمده‌اید. کسی شما را به این سمت هدایت کرده است.';
  if (/dribbble\.com/.test(host)) return 'شما از Dribbble آمده‌اید. کسی این را به زیبایی طراحی کرده است.';
  if (/behance\.net/.test(host)) return 'شما از Behance آمده‌اید. کسی می‌خواسته کارش را به نمایش بگذارد.';
  if (/figma\.com/.test(host)) return 'شما از Figma آمده‌اید. کسی یک پیکسل را جابه‌جا کرده و شما را به اینجا رسانده است.';
  if (/notion\.so/.test(host)) return 'شما از Notion آمده‌اید. کسی همه‌چیز را در قالب یک صفحه مرتب کرده است.';
  if (/canva\.com/.test(host)) return 'شما از Canva آمده‌اید. کسی کاری کرده که اینجا ظاهر خوبی داشته باشد.';
  if (/theverge\.com|techcrunch\.com|wired\.com/.test(host)) return 'شما از رسانه‌های فناوری آمده‌اید. کسی حرفی برای گفتن داشته است.';
  // Fall back to the bare domain, minus the noise that makes it look like a log line.
  return `شما از ${host.replace(/^www\./, '')} آمده اید.`;
}

function specLines(s: SignalMap): string[] {
  const str = (id: string) => (typeof s[id]?.value === 'string' ? (s[id].value as string) : '');
  const numOf = (id: string) => (typeof s[id]?.value === 'number' ? (s[id].value as number) : undefined);

  const ua = str('platform.ua');
  const gpu = str('gpu.renderer');
  const gpuL = gpu.toLowerCase();
  const cores = numOf('hw.cores');
  const hz = numOf('display.refreshHz');
  const res = s['display.resolution']?.value as [number, number] | undefined;
  const dpr = numOf('display.pixelRatio') ?? 1;
  // Physical pixels (CSS × DPR), what people actually recognise as their
  // resolution (e.g. 1080×2400), not the logical 420×934 the browser reports.
  const phys = res ? ([Math.round(res[0] * dpr), Math.round(res[1] * dpr)] as [number, number]) : undefined;

  const { headline, tier } = deviceProfile(s, ua, gpuL, str('platform.model'), res, cores);

  // A VM gets no spec brag, the fact that it's fake IS the punchline.
  if (tier === 'vm') return [`صبر کن... این اصلا یک سخت افزار واقعی نیست! این یک *ماشین مجازی*‌ست. پس با همین پیش میرویم.`];

  const out: string[] = [`دستگاه خوبی دارید: *${headline}*.`];

  // Graphics first (per the brag order), then cores, screen, resolution.
  const bits: string[] = [];
  const gpuName = prettyGpu(gpu);
  if (gpuName && !/apple m/i.test(headline)) bits.push(gpuName);
  // Browsers cap/round hardwareConcurrency (Firefox tops out, Safari and
  // resistFingerprinting under-report hard), so we never state it as fact.
  if (cores) bits.push(`${cores} هسته پردازنده`);
  if (hz && hz >= 118) bits.push(`که اعتراف گر یک نمایشگر ${hz} هرتزی ${/apple|iphone|ipad|mac/i.test(ua) ? '(ProMotion)' : ''}`);
  if (phys) bits.push(`با اندازه ${phys[0]}×${phys[1]} است`);

  if (bits.length >= 2) {
    const closer = tier === 'high' ? 'همه امکانات خاص و جذاب.' : tier === 'low' ? 'صادقانه، تمام تلاشش را میکند.' : 'یک سیستم کاملاً توانمند.';
    out.push(`${cap(list(bits))}. ${closer}`);
  } else if (bits.length === 1) {
    out.push(`${cap(bits[0])}، و نه کمتر.`);
  }

  if (tier === 'high') out.push("اما یکم گران نبود؟");
  else if (tier === 'low') out.push("یه ذره قدیمی، شاید زمان آپگرید کردن رسیده، اما در این اوضاع اقتصادی...");

  return out;
}

type Tier = 'high' | 'mid' | 'low' | 'vm';
function deviceProfile(s: SignalMap, ua: string, gpuL: string, model: string, res: [number, number] | undefined, cores?: number): { headline: string; tier: Tier } {
  if (/swiftshader|llvmpipe|vmware|virtualbox|parallels|basic render/.test(gpuL)) {
    return { headline: 'a virtual machine', tier: 'vm' };
  }
  if (/iPhone/.test(ua)) {
    const minDim = res ? Math.min(res[0], res[1]) : 0;
    // Small logical width (SE / X-era) reads as the budget/older tier.
    if (minDim && minDim <= 375) return { headline: 'یک آیفون قدیمی (ولی هنوز کار میکنه، پس دوستش داشته باش)', tier: 'low' };
    return { headline: 'an iPhone', tier: 'high' };
  }
  if (/iPad/.test(ua)) return { headline: 'یک آیپد', tier: 'high' };
  if (/Android/.test(ua)) {
    // Adreno 7xx/8xx and Mali-G7xx/G78+ (and Immortalis) are flagship tiers.
    const adr = gpuL.match(/adreno\D*(\d{3,4})/);
    const mali = gpuL.match(/mali-g(\d{2,3})/);
    const flagship = (adr && +adr[1] >= 700) || (mali && +mali[1] >= 70) || /immortalis/.test(gpuL);
    if (/SM-/.test(model) || /SamsungBrowser/.test(ua)) return { headline: 'یک سامسونگ، فرد خوش انتخابی هستی!', tier: flagship ? 'high' : 'mid' };
    if (/Pixel/i.test(model)) return { headline: 'یک پیکسل', tier: flagship ? 'high' : 'mid' };
    if (flagship) return { headline: 'یک اندروید رده بالا', tier: 'high' };
    return { headline: 'یک اندروید..؟', tier: 'mid' };
  }
  if (/Macintosh|Mac OS X/.test(ua)) {
    const mac = classifyMacintosh(s);
    if (mac.kind === 'ipad') return { headline: 'یک آیپد که سعی میکند شبیه مک باشد (صفحه لسمی اش این را لو داد)', tier: 'high' };
    if (mac.kind === 'apple-silicon') {
      return { headline: mac.chip ? `an Apple ${mac.chip}` : 'یک مک سیلیکون (ولی مشخص نیست کدام چیپ)', tier: 'high' };
    }
    if (mac.kind === 'intel') return { headline: 'یک مک اینتل (یک نسخه مرغوب)', tier: 'low' };
    return { headline: 'یک مک', tier: 'mid' };
  }
  if (/CrOS/.test(ua)) return { headline: 'یک کروم بوک', tier: 'low' };
  if (/rtx\s*(30|40|50)|radeon\s*rx\s*(6|7|9)\d{2}/.test(gpuL)) return { headline: 'یک ریگ گیمینگ مناسب', tier: 'high' };
  if (/Windows/.test(ua)) {
    if (/intel|uhd|iris|hd graphics/.test(gpuL) && cores != null && cores <= 4) return { headline: 'یک سیستم ویندوزی', tier: 'low' };
    if (cores != null && cores >= 12) return { headline: 'یک سیستم ویندوزی', tier: 'high' };
    return { headline: 'یک سیستم ویندوزی', tier: 'mid' };
  }
  if (/Linux|X11/.test(ua)) return { headline: 'یک لینوکس (اصلا مشخص بود)', tier: 'mid' };
  return { headline: 'یک دستگاه که هیچ حدسی براش ندارم', tier: 'mid' };
}

function prettyGpu(raw: string): string {
  const nv = raw.match(/(RTX\s*\d{3,4}\s*(?:Ti)?|GTX\s*\d{3,4})/i);
  if (nv) return `یک انویدیا ${nv[1].replace(/\s+/g, ' ').toUpperCase()}`;
  const amd = raw.match(/(Radeon\s+RX\s*\d{3,4}\s*(?:XT)?)/i);
  if (amd) return amd[1];
  const apple = raw.match(/Apple\s+M\d+(\s*(Pro|Max|Ultra))?/i);
  if (apple) return `یک اپل ${apple[0].replace(/Apple\s+/i, '')}`;
  if (/intel/i.test(raw)) return 'Intel graphics';
  const adreno = raw.match(/Adreno\D*(\d{3,4})/i);
  if (adreno) return `یک ارنو ${adreno[1]}`;
  const mali = raw.match(/Mali-\w+/i);
  if (mali) return mali[0];
  return '';
}

function list(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} و ${items[1]}`;
  return `${items.slice(0, -1).join('، ')}، و ${items[items.length - 1]}`;
}
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
