import type { Claim, Inference, SignalMap } from '../types';
import { classifyMacintosh, MAC_EVIDENCE } from './mac';

/**
 * The opening hook: a snarky one-line judgement of your hardware, shown before
 * anything else. It reads the GPU, CPU, screen and platform in the first frame
 * and reacts like a person glancing at your machine. Every device class is
 * covered, Apple Silicon, Intel Macs, gaming rigs, work-laptop potatoes,
 * Android (with Samsung/Pixel exceptions), old and new iPhones, iPads, Linux,
 * Chromebooks and VMs.
 */

const str = (s: SignalMap, id: string): string => {
  const v = s[id]?.value;
  return typeof v === 'string' ? v : '';
};
const num = (s: SignalMap, id: string): number | undefined => {
  const v = s[id]?.value;
  return typeof v === 'number' ? v : undefined;
};

function hook(text: string, how: string, evidence: string[]): Claim {
  return { id: 'hook.device', text, confidence: 'guess', act: 0, weight: 10, evidence, how };
}

/** Where you came from, the fourth-wall opener, before the device judgement. */
const REFERRERS: Array<{ match: RegExp; text: string }> = [
  { match: /news\.ycombinator\.com/, text: 'شما از Hacker News آمده‌اید. بله، این بخش از قبل میداند که شما از کجا آمده‌اید.' },
  { match: /lobste\.rs/, text: 'شما از Lobsters آمده‌اید. انتخاب خوبی است.' },
  { match: /reddit\.com|redd\.it/, text: 'شما از Reddit آمده‌اید. کسی این را منتشر کرده و حالا شما اینجا هستید.' },
  { match: /(twitter|x)\.com|t\.co/, text: 'شما از X آمده‌اید. کسی این را در ایکس به اشتراک گذاشته است.' },
  { match: /linkedin\.com|lnkd\.in/, text: 'شما از LinkedIn آمده‌اید. امیدواریم این هم مصداقی از رهبری فکری محسوب شود.' },
  { match: /github\.com/, text: 'شما از GitHub آمده‌اید. پس شما هم یکی از خودمان هستید.' },
  { match: /producthunt/, text: 'شما از Product Hunt آمده‌اید. به دنیای پذیرندگان اولیه خوش آمدید.' },
  { match: /news\.google|google\./, text: 'شما از جست و جوی گوگل آمده‌اید. چه چیزی جست و جو کردید که به اینجا رسیدید؟' },
  { match: /bing\.com|duckduckgo\.com|search\.brave/, text: 'شما از یک موتور جست‌ و جو آمده‌اید. از نوعی که حتی به حریم خصوصی هم اهمیت می‌دهد.' },
  { match: /t\.me|telegram/, text: 'شما از Telegram آمده‌اید. کسی این را برایتان فرستاده است.' },
  { match: /mastodon|bsky|fosstodon|\.social/, text: 'شما از فدیورس آمده‌اید. البته که همین‌طور است.' },
  { match: /facebook\.com|fb\./, text: 'شما از Facebook آمده‌اید. جسارت میخواهد که هنوز آنجا باشید.' },
  { match: /instagram\.com/, text: 'شما از Instagram آمده‌اید. کسی این را از میان پست‌ های خود برایتان فرستاده است.' },
  { match: /threads\.net/, text: 'شما از Threads آمده‌اید. کسی حرفی برای گفتن داشته است.' },
  { match: /youtube\.com|youtu\.be/, text: 'شما از YouTube آمده‌اید. یک ویدیو شما را به اینجا رسانده است.' },
  { match: /tiktok\.com/, text: 'شما از TikTok آمده‌اید. الگوریتم شما را به اینجا رسانده است.' },
  { match: /snapchat\.com/, text: 'شما از Snapchat آمده‌اید. کسی این را قبل از ناپدید شدن برایتان فرستاده است.' },
  { match: /pinterest\.com|pin\.it/, text: 'شما از Pinterest آمده‌اید. به دنبال الهام بودید و به اینجا رسیدید.' },
  { match: /whatsapp\.com|wa\.me/, text: 'شما از WhatsApp آمده‌اید. کسی این را برایتان فوروارد کرده است.' },
  { match: /messenger\.com/, text: 'شما از Messenger آمده‌اید. کسی این را در گفت‌ و گو برایتان فرستاده است.' },
  { match: /signal\.org/, text: 'شما از Signal آمده‌اید. کسی به اندازه کافی به شما اعتماد داشته است که این را بفرستد.' },
  { match: /wechat\.com/, text: 'شما از WeChat آمده‌اید. کسی این را با شما به اشتراک گذاشته است.' },
  { match: /line\.me/, text: 'شما از LINE آمده‌اید. کسی این را برایتان فرستاده است.' },
  { match: /kakao\.com/, text: 'شما از Kakao آمده‌اید. کسی این را در گفت‌ و گو فرستاده است.' },
  { match: /slack\.com/, text: 'شما از Slack آمده‌اید. کسی این را در یک کانال به اشتراک گذاشته است.' },
  { match: /discord/, text: 'شما از Discord آمده‌اید. کسی این را در یک سرور منتشر کرده است.' },
  { match: /twitch\.tv/, text: 'شما از Twitch آمده‌اید. کسی در حین پخش زنده به این موضوع اشاره کرده است.' },
  { match: /spotify\.com/, text: 'شما از Spotify آمده‌اید. ظاهراً یک آهنگ شما را به اینجا رسانده است..؟' },
  { match: /soundcloud\.com/, text: 'شما از SoundCloud آمده‌اید. کسی یک قطعه موسیقی را با شما به اشتراک گذاشته است.' },
  { match: /stack(?:overflow|exchange)\.com/, text: 'شما از Stack Overflow آمده‌اید. چیزی درست کار نمی‌ کرد، مگر نه؟' },
  { match: /dev\.to/, text: 'شما از DEV آمده‌اید. کسی مشغول نوشتن کد بوده و شما را به اینجا فرستاده است.' },
  { match: /medium\.com/, text: 'شما از Medium آمده‌اید. به شما وعده یک مطلب جالب داده شده بود.' },
  { match: /substack\.com/, text: 'شما از Substack آمده‌اید. کسی حرف‌هایی برای گفتن داشته و آن‌ ها را با شما به اشتراک گذاشته است.' },
  { match: /quora\.com/, text: 'شما از Quora آمده‌اید. کسی سؤالی پرسیده است.' },
  { match: /patreon\.com/, text: 'شما از Patreon آمده‌اید. طبیعتاً در حال حمایت از سازندگان محتوا هستید.' },
  { match: /ko-fi\.com|buymeacoffee\.com/, text: 'شما از گوشه‌ای از اینترنت آمده‌اید که با قهوه کار می‌کند.' },
  { match: /letterboxd\.com/, text: 'شما از Letterboxd آمده‌اید. ظاهراً کسی درباره این موضوع نظری داشته است.' },
  { match: /goodreads\.com/, text: 'شما از Goodreads آمده‌اید. به دنبال چیزی ارزشمند برای خواندن بودید.' },
  { match: /chatgpt\.com|chat\.openai\.com/, text: 'شما از ChatGPT آمده‌اید. ظاهراً ربات‌ها شما را به اینجا فرستاده‌اند.' },
  { match: /openai\.com/, text: 'شما از OpenAI آمده‌اید. ظاهراً کسی ماشین‌ها را احضار کرده است.' },
  { match: /claude\.ai|anthropic\.com/, text: 'شما از Claude آمده‌اید. یک هوش مصنوعی متفکر شما را به اینجا فرستاده است.' },
  { match: /gemini\.google\.com/, text: 'شما از Gemini آمده‌اید. گوگل شما را به این سمت هدایت کرده است.' },
  { match: /perplexity\.ai/, text: 'شما از Perplexity آمده‌اید. سؤالی پرسیدید و در نهایت به اینجا رسیدید.' },
  { match: /copilot\.microsoft\.com/, text: 'شما از Copilot آمده‌اید. مایکروسافت شما را به یک مسیر فرعی فرستاده است.' },
  { match: /npmjs\.com/, text: 'شما از npm آمده‌اید. کسی به یک پکیج نیاز داشته و در نهایت شما را پیدا کرده است.' },
  { match: /pypi\.org/, text: 'شما از PyPI آمده‌اید. احتمالاً پای پایتون در میان بوده است.' },
  { match: /gitlab\.com/, text: 'شما از GitLab آمده‌اید. یک مخزن کد دیگر، یک روز دیگر.' },
  { match: /bitbucket\.org/, text: 'شما از Bitbucket آمده‌اید. کسی شما را به این سمت هدایت کرده است.' },
  { match: /dribbble\.com/, text: 'شما از Dribbble آمده‌اید. کسی این را به زیبایی طراحی کرده است.' },
  { match: /behance\.net/, text: 'شما از Behance آمده‌اید. کسی می‌خواسته کارش را به نمایش بگذارد.' },
  { match: /figma\.com/, text: 'شما از Figma آمده‌اید. کسی یک پیکسل را جابه‌جا کرده و شما را به اینجا رسانده است.' },
  { match: /notion\.so/, text: 'شما از Notion آمده‌اید. کسی همه‌چیز را در قالب یک صفحه مرتب کرده است.' },
  { match: /canva\.com/, text: 'شما از Canva آمده‌اید. کسی کاری کرده که اینجا ظاهر خوبی داشته باشد.' },
  { match: /theverge\.com|techcrunch\.com|wired\.com/, text: 'شما از رسانه‌های فناوری آمده‌اید. کسی حرفی برای گفتن داشته است.' },
];

export const referrerHook: Inference = (s) => {
  const host = str(s, 'nav.referrerHost');
  if (!host) return [];
  const known = REFERRERS.find((r) => r.match.test(host));
  const text = known ? known.text : `You came from *${host}*.`;
  return [{
    id: 'hook.referrer', text, confidence: 'certain', act: 0, weight: 0,
    evidence: ['nav.referrerHost', 'nav.referrer'],
    how: `هر لینکی که میزنید، صفحه ای که ترک کردید را در هدر Referer میفرستد و document.referrer آن را به هر اسکریپتی میدهد. تقریبا کسی نگاهش نمیکند. ما قبل از هرچیز خواندیمش، برای همین خط اول است.`,
  }];
};

export const deviceHook: Inference = (s) => {
  const ua = str(s, 'platform.ua');
  const gpu = str(s, 'gpu.renderer').toLowerCase();
  const model = str(s, 'platform.model');            // UA-CH device model (Android)
  const cores = num(s, 'hw.cores') ?? 0;
  const hz = num(s, 'display.refreshHz') ?? 0;
  const res = s['display.resolution']?.value as [number, number] | undefined;
  const minDim = res ? Math.min(res[0], res[1]) : 0;
  const ev = ['gpu.renderer', 'hw.cores', 'platform.ua', 'display.resolution'];
  const HOW = `We read your GPU string, CPU core count, screen and platform in the first frame, enough to size up your hardware before you'd scrolled a pixel. It's a vibe, not a spec sheet, so don't @ us.`;
  const H = (t: string) => hook(t, HOW, ev);

  // 0) Not real hardware.
  if (/swiftshader|llvmpipe|vmware|virtualbox|parallels|basic render|microsoft basic/.test(gpu)) {
    return [H(`Hold on, this isn't real hardware. You're in a *virtual machine* or a headless browser. Respect the hustle, but I see you.`)];
  }

  // 1) iPhone / iPad.
  if (/iPhone/.test(ua)) {
    // Small logical width ⇒ older/SE-class device.
    if (minDim && minDim <= 375) {
      return [H(`That is an *ancient iPhone*. It still boots, which is honestly more than I expected. Museum-adjacent.`)];
    }
    if (minDim && minDim >= 428) {
      return [H(`An *iPhone Pro Max*. The big one. Compensating for nothing, I'm sure.`)];
    }
    return [H(`An *iPhone*. Of course it is. Predictable, expensive, fine.`)];
  }
  if (/iPad/.test(ua)) {
    return [H(`You opened this on an *iPad*. Browsing the real web on a tablet, living dangerously, I respect it.`)];
  }

  // 2) Android, with taste-based exceptions.
  if (/Android/.test(ua)) {
    if (/SM-/.test(model) || /SamsungBrowser/.test(ua) || /samsung/i.test(model)) {
      return [H(`*Samsung?* Okay, a person of taste. Unexpected, but I respect it.`)];
    }
    if (/Pixel/i.test(model)) {
      return [H(`A *Pixel*. The Android for people who are quietly ashamed of Android. Clever.`)];
    }
    if (/Adreno\s*7|Adreno\s*8|Mali-G7|Mali-G8|immortalis/i.test(gpu)) {
      return [H(`A *flagship Android*. Powerful. Still Android. We contain multitudes.`)];
    }
    return [H(`Ew, you opened this on an *Android*? …okay. I guess. No judgement. (Some judgement.)`)];
  }

  // 3) Mac, or an iPad wearing the desktop "Macintosh" UA. Safari masks the
  // GPU string to a bare "Apple GPU", so absence of an M-chip there proves
  // nothing — classifyMacintosh folds in the CPU-arch and touchscreen signals.
  if (/Macintosh|Mac OS X/.test(ua)) {
    const mac = classifyMacintosh(s);
    const M = (t: string) => hook(t, HOW, [...ev, ...MAC_EVIDENCE]);
    if (mac.kind === 'ipad') {
      return [M(`An *iPad* pretending to be a Mac. The desktop user-agent was a nice try, but Macs don't have touchscreens.`)];
    }
    if (mac.kind === 'apple-silicon' && mac.chip) {
      const highEnd = /pro|max|ultra/i.test(mac.chip);
      return [M(highEnd
        ? `*Nice machine.* Apple ${mac.chip}, that's the expensive one. Taste and disposable income, a lethal combo.`
        : `*Nice machine.* Apple Silicon (${mac.chip}). Tasteful. Slightly smug. It suits you.`)];
    }
    if (mac.kind === 'apple-silicon') {
      return [M(`*Nice machine.* Apple Silicon. Your browser hides which chip, but the CPU itself told on you.`)];
    }
    if (mac.kind === 'intel') {
      return [M(`An *Intel Mac*. You've held onto this one a while, haven't you? Loyalty, or inertia, either way, respect.`)];
    }
    return [M(`A *Mac*. Beyond that it's keeping quiet, which, honestly, fair.`)];
  }

  // 4) ChromeOS.
  if (/CrOS/.test(ua)) {
    return [H(`A *Chromebook*. Bold. Frugal. Bold. We'll make it work.`)];
  }

  // 5) Windows and other desktop, tier by GPU, then CPU.
  const gaming = /rtx\s*(30|40|50)|rtx\s*(20)[6-9]|radeon\s*rx\s*(6|7|9)\d{2}/i.test(gpu);
  const midGpu = /gtx\s*1[06]|rtx\s*20[0-5]|radeon\s*rx\s*5\d{2}/i.test(gpu);
  const weakGpu = /intel|uhd|hd graphics|iris/.test(gpu);
  const isWindows = /Windows/.test(ua);

  if (gaming || (isWindows && cores >= 12)) {
    const card = (gpu.match(/(rtx\s*\d{3,4}\s*(ti)?|radeon\s*rx\s*\d{3,4}\s*(xt)?)/i)?.[0] || '').toUpperCase().replace(/\s+/g, ' ').trim();
    return [H(`Okay, *nice rig*.${card ? ` That ${card} isn't for spreadsheets` : ` That's a gaming machine`}, and we both know it.${hz >= 120 ? ` A ${hz}Hz screen too. Show-off.` : ''}`)];
  }
  if (isWindows && weakGpu && cores <= 4) {
    return [H(`Wow. This is an *old machine*, or the work laptop IT handed you in 2018. Either way, my condolences.`)];
  }
  if (midGpu) {
    return [H(`A perfectly *respectable PC*. Not a beast, not a potato. The Toyota Corolla of computers.`)];
  }
  if (/Linux|X11/.test(ua)) {
    return [H(`*Linux* on the desktop. Of course it is. We're genuinely honored, say hi to your window manager.`)];
  }
  if (isWindows) {
    return [H(`A *Windows PC*. The people's choice. Statistically, this is most of you, and that's beautiful.`)];
  }

  // 6) Fallback.
  return [H(`Some kind of machine. Unusual enough that I can't place it at a glance, which is its own kind of flex.`)];
};
