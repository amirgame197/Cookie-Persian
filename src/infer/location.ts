import type { Claim, Inference, SignalMap } from '../types';

const claim = (c: Omit<Claim, 'confidence'> & Partial<Pick<Claim, 'confidence'>>): Claim => ({
  confidence: 'likely', ...c,
});

const str = (s: SignalMap, id: string): string | undefined => {
  const v = s[id]?.value;
  return typeof v === 'string' && v ? v : undefined;
};

/** Where the edge placed you, before a single byte of JavaScript ran. */
export const geolocation: Inference = (s) => {
  const city = str(s, 'edge.city');
  const region = str(s, 'edge.region');
  const country = str(s, 'edge.country');
  const org = str(s, 'edge.asOrg');
  const out: Claim[] = [];

  const place = [city, region].filter(Boolean).join(', ') || country;
  if (place) {
    out.push(claim({
      id: 'loc.city',
      text: `شما در *${place}*${country && place !== country ? `، ${country}` : ''} یا اطرافش هستید.`,
      confidence: city ? 'likely' : 'guess',
      act: 1, weight: 7,
      evidence: ['edge.city', 'edge.region', 'edge.country', 'edge.ip'],
      how: `آیپی شما به این مکان میرسد. این موضوع در لایه شبکه، قبل از رندر صفحه و قبل از هر کوکی معلوم است. هر سایتی که میبینید آیپی شما را دارد و فوری میتواند پیدایش کند.`,
    }));
  }

  if (org && !isPlaceholderOrg(org)) {
    const isp = cleanOrg(org);
    out.push(claim({
      id: 'loc.isp',
      text: isCorporate(org)
        ? `روی شبکه *${isp}* هستید؛ شبیه یک اتصال شرکتی یا سازمانی است.`
        : `ارائه دهنده اینترنت شما *${isp}* است.`,
      confidence: 'likely', act: 1, weight: 5,
      evidence: ['edge.asOrg', 'edge.asn'],
      how: `هر آیپی به یک Autonomous System ثبت شده برای یک سازمان تعلق دارد. مال شما «${org}» است. در شبکه شرکت یا دانشگاه معمولا نام کارفرماست.`,
    }));
  }

  return out;
};

/**
 * The contradiction engine. IP geo vs. browser timezone is the single most
 * legible "your VPN doesn't hide you" moment, and almost nobody demos it.
 */
/** Actual UTC offset (minutes) a named timezone is at right now, handles DST. */
function tzOffsetMinutes(tz: string): number | null {
  try {
    const d = new Date();
    const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(d.toLocaleString('en-US', { timeZone: tz }));
    return Math.round((local.getTime() - utc.getTime()) / 60000);
  } catch { return null; }
}

export const vpnContradiction: Inference = (s) => {
  const ipTz = str(s, 'edge.timezone');           // timezone derived from the IP
  const browserTz = str(s, 'env.timezone');        // timezone the browser reports
  const out: Claim[] = [];

  // Compare real UTC OFFSETS, not zone-name strings, Asia/Calcutta and
  // Asia/Kolkata are the same place, and only the offset difference is a VPN.
  const ipOff = ipTz ? tzOffsetMinutes(ipTz) : null;
  const browserOff = browserTz
    ? tzOffsetMinutes(browserTz)
    : (typeof s['env.tzOffset']?.value === 'number' ? (s['env.tzOffset'].value as number) : null);
  const offsetMismatch = ipOff != null && browserOff != null && Math.abs(ipOff - browserOff) > 20;

  if (ipTz && browserTz && offsetMismatch) {
    const ipCity = ipTz.split('/').pop()?.replace(/_/g, ' ');
    const realCity = browserTz.split('/').pop()?.replace(/_/g, ' ');
    out.push(claim({
      id: 'loc.vpn',
      text: `آیپی شما را در *${ipCity}* (${fmtOffset(ipOff!)}) میگذارد. ساعت کامپیوتر روی *${realCity}* (${fmtOffset(browserOff!)}) است. یکی از این ها VPN است و ساعتتان راست میگوید.`,
      confidence: 'likely', act: 4, weight: 9,
      evidence: ['edge.timezone', 'env.timezone', 'edge.city'],
      how: `شبکه خروجی VPN شما را میبیند (${ipTz}، ${fmtOffset(ipOff!)}). اما منطقه زمانی خود سیستم عامل (${browserTz}، ${fmtOffset(browserOff!)}) با شما از تونل رد شده و VPN نمیتواند عوضش کند. اختلاف واقعی است، پس تونل زده اید و منطقه زمانی سیستم عامل جایی که واقعا هستید را نشان میدهد.`,
    }));
  }

  // Language vs. country → the "multilingual, travelling, or VPN" tell.
  const langs = s['platform.languages']?.value as string[] | undefined;
  const country = str(s, 'edge.country');
  if (langs?.length && country && !langMatchesCountry(langs, country)) {
    const langName = languageName(langs[0].split('-')[0]) || langs[0];
    // If the timezone offset ALSO disagrees, VPN jumps to the top of the list.
    const tzMismatch = offsetMismatch;
    out.push(claim({
      id: 'loc.langMismatch',
      text: tzMismatch
        ? `مرورگر شما *${langName}* حرف میزند، آیپی در *${country}* است و ساعت در جای سوم. این مسافر نیست؛ *VPN* است.`
        : `مرورگر شما *${langName}* حرف میزند، اما آیپی در *${country}* است که آن زبان محلی نیست. پس یکی از این سه حالتید: *چند زبانه، در سفر، یا روی VPN*؛ و میفهمیم یکی از آن هاست.`,
      confidence: tzMismatch ? 'likely' : 'guess', act: 4, weight: tzMismatch ? 7 : 5,
      evidence: ['platform.languages', 'edge.country', 'edge.timezone', 'env.timezone'],
      how: `زبان تنظیم شده شما (${langs.join('، ')}) با کشوری که آیپی به آن میرسد (${country}) جور نیست. به تنهایی نشانه ضعیفی است؛ با منطقه زمانی متفاوت، تقریبا حتمی است که VPN دارید. هر سایت در همان ورود هر دو را میبیند و همین نتیجه را میگیرد.`,
    }));
  }

  return out;
};

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', ru: 'Russian', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese', ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', pl: 'Polish',
  sv: 'Swedish', da: 'Danish', fi: 'Finnish', no: 'Norwegian', cs: 'Czech',
  he: 'Hebrew', th: 'Thai', vi: 'Vietnamese', id: 'Indonesian', uk: 'Ukrainian',
};
function languageName(code: string): string { return LANG_NAMES[code.toLowerCase()] ?? ''; }

function fmtOffset(min: number): string {
  const sign = min >= 0 ? '+' : '-';
  const a = Math.abs(min);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** The local-time emotional beat, measured, never usually spoken aloud. */
export const localTimeBeat: Inference = (s) => {
  const hour = s['env.hour']?.value;
  if (typeof hour !== 'number') return [];
  const local = str(s, 'env.localTime') || '';
  const m = local.match(/(\d{1,2}):(\d{2})/);
  const clock = m ? to12h(+m[1], m[2]) : `${hour}:00`;

  if (hour >= 0 && hour <= 4) {
    return [claim({
      id: 'loc.time',
      text: `آنجا که هستید ساعت *${clock}* است. باید خواب باشید. به کسی نمیگوییم، ولی دستگاهتان همین الان گفت.`,
      confidence: 'certain', act: 1, weight: 6,
      evidence: ['env.localTime', 'env.hour'],
      how: `ساعت شما محلی تنظیم شده و مرورگر آزادانه گزارشش میکند. الان ${clock} است. ساعت روز یکی از بی سر و صداترین چیزهایی است که سایت از شما میفهمد، و یکی از گویاترین ها.`,
    })];
  }
  if (hour === 5 || hour === 6) {
    return [claim({
      id: 'loc.time',
      text: `آنجا که هستید ساعت *${clock}* است؛ یا زود بیدارید یا اصلا نخوابیده اید.`,
      confidence: 'certain', act: 1, weight: 5,
      evidence: ['env.localTime', 'env.hour'],
      how: `مرورگر زمان محلی دقیق شما (${clock}) را گزارش میکند. نپرسیدیم؛ خودش به هر صفحه ای که بارگیری شود میگوید.`,
    })];
  }
  return [];
};

/** Cloudflare colo + TCP RTT → a network-only location fix. (Cloudflare deploy only.) */
export const coloTriangulation: Inference = (s) => {
  const colo = str(s, 'edge.colo');
  const city = colo ? COLO[colo] : undefined;
  if (!colo || !city) return [];
  const rtt = s['edge.tcpRtt']?.value;
  const rttStr = typeof rtt === 'number' ? `, about *${rtt} ms* away` : '';
  return [claim({
    id: 'loc.colo',
    text: `در سطح شبکه از *${city}*${rttStr} به ما رسیدید. این موقعیتی است که آیپی نمیتواند جعلش کند؛ اندازه گیری شده، نه ادعا شده.`,
    confidence: 'likely', act: 1, weight: 4,
    evidence: ['edge.colo', 'edge.tcpRtt'],
    how: `از دیتاسنتر ${colo} وصل شدید و زمان رفت و برگشت حدود فاصله فیزیکی شما تا آن را مشخص میکند. VPN میتواند آیپی ظاهری را جابه جا کند، اما نمیتواند بسته ها را سریع تر از نور ببرد؛ پس این موقعیتتان را تایید یا رد میکند.`,
  })];
};

// Common Cloudflare edge locations (IATA code → city).
const COLO: Record<string, string> = {
  FRA: 'Frankfurt', LHR: 'London', CDG: 'Paris', AMS: 'Amsterdam', MAD: 'Madrid',
  MXP: 'Milan', ARN: 'Stockholm', WAW: 'Warsaw', VIE: 'Vienna', ZRH: 'Zurich',
  DUB: 'Dublin', EWR: 'Newark', IAD: 'Ashburn', ORD: 'Chicago', DFW: 'Dallas',
  LAX: 'Los Angeles', SJC: 'San Jose', SEA: 'Seattle', ATL: 'Atlanta', MIA: 'Miami',
  YYZ: 'Toronto', GRU: 'São Paulo', SCL: 'Santiago', NRT: 'Tokyo', KIX: 'Osaka',
  ICN: 'Seoul', SIN: 'Singapore', HKG: 'Hong Kong', BOM: 'Mumbai', DEL: 'Delhi',
  MAA: 'Chennai', BLR: 'Bengaluru', SYD: 'Sydney', MEL: 'Melbourne', JNB: 'Johannesburg',
  DXB: 'Dubai', TLV: 'Tel Aviv', IST: 'Istanbul', CPT: 'Cape Town',
};

function to12h(h: number, min: string): string {
  const ampm = h >= 12 ? 'بعد از ظهر' : 'صبح';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${ampm}`;
}

/** TLS/HTTP fingerprint captured during the handshake, before any JS. */
export const handshake: Inference = (s) => {
  const tls = str(s, 'edge.tlsVersion');
  const cipher = str(s, 'edge.tlsCipher');
  const proto = str(s, 'edge.httpProtocol');
  if (!tls && !proto) return [];
  const bits = [tls, proto].filter(Boolean).join(' over ');
  return [claim({
    id: 'loc.handshake',
    text: `اتصال شما را *هنگام handshake* اثرانگشت گرفتیم، ${bits}${cipher ? `، ${cipher}` : ''}، پیش از اینکه مرورگر یک خط از کد ما را اجرا کند.`,
    confidence: 'certain', act: 1, weight: 6,
    evidence: ['edge.tlsVersion', 'edge.tlsCipher', 'edge.httpProtocol', 'edge.tlsHelloLength'],
    how: `مذاکره TLS که این صفحه را امن میکند، مرورگر شما را هم معرفی میکند: فهرست cipherها، نسخه پروتکل و اندازه ClientHello. این در همان ابتدای اتصال رخ میدهد. تا وقتی «رسیدید»، از قبل توصیف شده بودید.`,
  })];
};

// --- helpers ---------------------------------------------------------------

function cleanOrg(org: string): string {
  // Registry org fields often carry a postal address ("Airtel Ltd.,224, Okhla
  // industrial Area..."). Keep the leading name-ish segments, drop the address.
  const parts = org.split(',').map((p) => p.trim()).filter(Boolean);
  const kept: string[] = [];
  for (const p of parts) {
    if (/\d{2,}/.test(p) || /\b(road|street|area|phase|sector|floor|block|po box|district)\b/i.test(p)) break;
    kept.push(p);
    if (kept.join(' ').length > 40) break;
  }
  return (kept.join(', ') || parts[0] || org)
    .replace(/,?\s*(inc|llc|ltd|gmbh|s\.a\.|co\.|corp)\.?$/i, '').trim();
}

/** Geo APIs sometimes return junk placeholders instead of a real ISP name. */
function isPlaceholderOrg(org: string): boolean {
  return /^(internet service provider|isp|unknown|n\/?a|none|null|private|reserved|-)$/i.test(org.trim());
}

const CONSUMER_ISP = /comcast|verizon|at&t|t-mobile|spectrum|charter|cox|xfinity|vodafone|telekom|orange|jio|airtel|bt\b|sky|virgin|telus|rogers|bell|frontier|centurylink|starlink|deutsche telekom/i;

function isCorporate(org: string): boolean {
  if (CONSUMER_ISP.test(org)) return false;
  return /university|institute|corp|technolog|systems|solutions|bank|google|amazon|microsoft|apple|meta|labs|ltd|inc|gmbh/i.test(org);
}

function langMatchesCountry(langs: string[], country: string): boolean {
  // Cheap allowlist of common language↔country pairs to suppress obvious non-mismatches.
  const map: Record<string, string[]> = {
    US: ['en'], GB: ['en'], AU: ['en'], CA: ['en', 'fr'], IE: ['en'], NZ: ['en'],
    DE: ['de'], AT: ['de'], CH: ['de', 'fr', 'it'], FR: ['fr'], ES: ['es'],
    MX: ['es'], AR: ['es'], IT: ['it'], NL: ['nl'], BR: ['pt'], PT: ['pt'],
    JP: ['ja'], KR: ['ko'], CN: ['zh'], TW: ['zh'], IN: ['en', 'hi', 'ta', 'te', 'bn'],
    RU: ['ru'], SE: ['sv'], NO: ['no', 'nb'], DK: ['da'], FI: ['fi'], PL: ['pl'],
  };
  const allowed = map[country];
  if (!allowed) return true; // unknown country → don't cry mismatch
  return langs.some((l) => allowed.includes(l.split('-')[0].toLowerCase()));
}
