import type { Claim, Inference, SignalMap } from '../types';
import { resolveAppleModel } from './apple-models';

const claim = (c: Omit<Claim, 'confidence'> & Partial<Pick<Claim, 'confidence'>>): Claim => ({
  confidence: 'likely', ...c,
});

function num(s: SignalMap, id: string): number | undefined {
  const v = s[id]?.value;
  return typeof v === 'number' ? v : undefined;
}

/** Resolve the device family from screen geometry (physical px → Apple model). */
export const deviceModel: Inference = (s) => {
  const res = s['display.resolution']?.value as [number, number] | undefined;
  const dpr = num(s, 'display.pixelRatio');
  const out: Claim[] = [];
  if (!res || !dpr) return out;

  // Only ever match the Apple resolution table for an Apple user-agent. Plenty
  // of Android panels land on the same pixel geometry as an iPad/Mac, and
  // without this an Android could be told it's reading on a MacBook.
  const ua = (s['platform.ua']?.value as string | undefined) ?? '';
  const isApple = /iPhone|iPad|iPod|Macintosh|Mac OS X/.test(ua);

  const [w, h] = res;
  const model = isApple ? resolveAppleModel(res, dpr) : null;

  if (model) {
    out.push(claim({
      id: 'device.model',
      // The label already carries its own article ("an iPhone …").
      text: `این را روی ${model} میخوانید.`,
      confidence: 'likely',
      act: 3, weight: 8,
      evidence: ['display.resolution', 'display.pixelRatio'],
      how: `${w}×${h} پیکسل منطقی با نسبت پیکسل دستگاه ${dpr}×، یعنی ${physical(w, h, dpr)} پیکسل واقعی؛ وضوحی که Apple روی یک خط مدل (گاهی دو مدل با پنل مشترک) میدهد. نه کوکی خواستیم نه دسترسی؛ خود صفحه گفت.`,
    }));
  }

  // Fractional DPR means fractional UI scaling somewhere. Careful: DPR is
  // hardware density MULTIPLIED by scaling, so on a 2x HiDPI panel at 125% the
  // DPR is 2.5 — reporting that as "250%" was wrong. Factor out the likely base
  // density first, and only speak when the result looks like a real setting.
  if (dpr % 1 !== 0 && !model) {
    const scale = inferScaling(dpr);
    if (scale) {
      out.push(claim({
        id: 'device.winScale',
      text: `رابط شما حدود *${scale.pct}%* مقیاس دارد، پیش فرض نیست.`,
        confidence: 'guess', act: 3, weight: 4,
        evidence: ['display.pixelRatio'],
        how: `نسبت پیکسل دستگاه شما ${dpr} است. این تراکم سخت افزاری صفحه (${scale.base}×) ضرب در مقیاس رابط شماست و حدود ${scale.pct}% میشود. میتواند تنظیم مقیاس نمایش سیستم عامل یا زوم مرورگر باشد؛ میفهمیم پیش فرض نیست، اما نه اینکه کدام عوضش کرده.`,
      }));
    }
  }

  return out;
};

/** Turn the raw GPU string into a plain-English graphics-card call-out. */
export const gpuTier: Inference = (s) => {
  const raw = (s['gpu.renderer']?.value as string) || '';
  if (!raw) return [];
  const out: Claim[] = [];

  const pretty = prettifyGpu(raw);
  if (pretty) {
    out.push(claim({
      id: 'device.gpu',
      text: pretty.article
        ? `Your graphics is ${pretty.article} *${pretty.name}*.`
        : `Your graphics is *${pretty.name}*.`,
      confidence: pretty.exact ? 'certain' : 'likely',
      act: 3, weight: 9,
      evidence: ['gpu.renderer'],
      how: `WebGL رشته خام GPU را از WEBGL_debug_renderer_info بیرون میدهد، اینجا: «${truncate(raw, 90)}». Chrome بدون پیام دسترسی آن را میدهد. در همان فریم اول سخت افزار گرافیکی دقیق شما را نام میبرد.`,
    }));
  }

  // The worker/main-thread cross-check: a mismatch means the GPU string is spoofed.
  if (s['gpu.rendererMismatch']?.value === true) {
    out.push(claim({
      id: 'device.gpuSpoof',
      text: `و دارید *جعلش میکنید*، GPUای که صفحه میگوید همان نیست که تردهای پس زمینه مرورگر میگویند.`,
      confidence: 'certain', act: 4, weight: 9,
      evidence: ['gpu.renderer', 'gpu.workerRenderer'],
      how: `رشته GPU را دو بار خواندیم: یک بار در صفحه و یک بار داخل Web Worker. مرورگر واقعی هر دو بار یک مقدار میدهد. مال شما نه؛ یعنی ابزار حریم خصوصی یا مرورگر ضد تشخیص آن را در ترد اصلی بازنویسی کرده و Worker را فراموش کرده. همین دروغ اثرانگشت است.`,
    }));
  }

  return out;
};

/** Multiple monitors, detected with no permission (Chrome's screen.isExtended). */
export const multiMonitor: Inference = (s) => {
  if (s['meta.multiMonitor']?.value !== true) return [];
  return [claim({
    id: 'device.screens',
      text: `*بیشتر از یک نمایشگر* دارید.`,
    confidence: 'certain', act: 3, weight: 4,
    evidence: ['meta.multiMonitor'],
    how: `وقتی نمایشگر دوم وصل باشد screen.isExtended مقدار true میدهد؛ بدون پیام دسترسی، فقط یک boolean که هر سایتی میخواند. نمیگوید روی نمایشگر دیگر چیست. فعلا.`,
  })];
};

/** Refresh rate → ProMotion / gaming-monitor inference. */
export const displayInference: Inference = (s) => {
  const hz = num(s, 'display.refreshHz');
  if (!hz) return [];
  const out: Claim[] = [];
  if (hz >= 118 && hz <= 122) {
    out.push(claim({
      id: 'device.promotion',
      text: `نمایشگر شما *۱۲۰ بار در ثانیه* تازه میشود، پنل ProMotion یا نرخ تازه سازی بالا.`,
      confidence: 'likely', act: 3, weight: 5,
      evidence: ['display.refreshHz'],
      how: `شمردیم مرورگر چند بار میتواند فریم بکشد. روی ${hz}Hz ثابت شد؛ برای نمایشگر خوب پول داده اید.`,
    }));
  } else if (hz >= 140) {
    out.push(claim({
      id: 'device.gamingMonitor',
      text: `نمایشگر شما با *${hz}Hz* کار میکند. این یک نمایشگر گیمینگ است.`,
      confidence: 'likely', act: 3, weight: 6,
      evidence: ['display.refreshHz'],
      how: `زمان بندی کشیدن فریم، نمایشگر را ${hz}Hz نشان داد. غیر از مانیتور مخصوص گیم چیزی اینقدر سریع کار نمیکند.`,
    }));
  }
  return out;
};

/** Cameras/mics attached, reads as more invasive than it is (counts need no permission). */
export const peripherals: Inference = (s) => {
  const cams = num(s, 'hw.cameras');
  const mics = num(s, 'hw.microphones');
  if (cams == null && mics == null) return [];

  // Without camera/mic permission the browser collapses enumerateDevices() to a
  // single placeholder entry per kind, so the numbers are NOT real counts, they
  // only prove a device of that kind exists. Claiming "1 microphone" to someone
  // with three is the kind of confident-and-wrong we refuse to ship.
  const exact = s['hw.deviceLabels']?.value === true;

  if (exact) {
    const parts: string[] = [];
    if (cams != null) parts.push(`*${cams}* camera${cams === 1 ? '' : 's'}`);
    if (mics != null) parts.push(`*${mics}* microphone${mics === 1 ? '' : 's'}`);
    if (!parts.length) return [];
    return [claim({
      id: 'device.peripherals',
      text: `همین الان ${parts.join(' و ')} وصل دارید.`,
      confidence: 'certain', act: 3, weight: 6,
      evidence: ['hw.cameras', 'hw.microphones', 'hw.speakers', 'hw.deviceLabels'],
      how: `enumerateDevices() همه دوربین ها، میکروفون ها و اسپیکرهای وصل را فهرست میکند. یک زمانی به مرورگر اجازه دستگاه داده اید، پس تعداد واقعی و اسم هایشان را هم میگیریم.`,
    })];
  }

  // Presence only, which is all the browser will honestly tell us.
  const kinds: string[] = [];
  if (cams) kinds.push('a camera');
  if (mics) kinds.push('a microphone');
  if (!kinds.length) return [];
  return [claim({
    id: 'device.peripherals',
    text: `${kinds.join(' و ')} وصل دارید.`,
    confidence: 'likely', act: 3, weight: 5,
    evidence: ['hw.cameras', 'hw.microphones', 'hw.speakers', 'hw.deviceLabels'],
    how: `enumerateDevices() بدون پیام دسترسی نشان میدهد چه *نوع* دستگاهی دارید. تا دسترسی ندهید تعداد واقعی یا اسم ها را نمیدهد، پس وانمود نمیکنیم چند تا هستند؛ فقط میدانیم وجود دارند.`,
  })];
};

// --- helpers ---------------------------------------------------------------

function physical(w: number, h: number, dpr: number): string {
  return `${Math.round(w * dpr)}×${Math.round(h * dpr)}`;
}

function startsWithArticle(s: string): boolean {
  return /^(a|an|the)\s/i.test(s);
}

/**
 * Split a device pixel ratio into (hardware density × UI scaling). A 2x retina
 * panel at 125% reports dpr 2.5, which is 125% scaling, not 250%. We try each
 * plausible base density and keep the one whose implied scaling matches a real
 * setting people actually pick; if nothing matches, we say nothing.
 */
// Scaling factors people actually choose. 200%+ is deliberately absent: an
// integer DPR never reaches here, and reading dpr 2.5 as "250% on a 1x screen"
// (rather than 125% on a 2x screen) is exactly the bug this function exists to
// avoid. Ties prefer the larger base, i.e. the more modest scaling factor.
const COMMON_SCALES = [1.1, 1.25, 1.4, 1.5, 1.75];
function inferScaling(dpr: number): { pct: number; base: number } | null {
  let best: { pct: number; base: number; err: number } | null = null;
  for (const base of [1, 2, 3]) {
    const scale = dpr / base;
    if (scale < 1.05 || scale > 1.9) continue;
    for (const c of COMMON_SCALES) {
      const err = Math.abs(scale - c);
      if (err < 0.02 && (!best || err <= best.err)) {
        best = { pct: Math.round(c * 100), base, err };
      }
    }
  }
  return best ? { pct: best.pct, base: best.base } : null;
}

interface GpuGuess { name: string; article: string; exact: boolean; }

function prettifyGpu(raw: string): GpuGuess | null {
  const r = raw.toLowerCase();
  // Apple Silicon
  const apple = raw.match(/Apple\s+(M\d+(?:\s*(?:Pro|Max|Ultra))?)/i);
  if (apple) return { name: `Apple ${apple[1]}`, article: 'an', exact: true };
  // NVIDIA
  const nv = raw.match(/(?:GeForce\s+)?(RTX\s*\d{4}\s*(?:Ti)?|GTX\s*\d{3,4}\s*(?:Ti)?)/i);
  if (nv) return { name: `NVIDIA ${nv[1].replace(/\s+/g, ' ').toUpperCase()}`, article: 'an', exact: true };
  // AMD
  const amd = raw.match(/(Radeon\s+RX\s*\d{3,4}\s*(?:XT)?)/i);
  if (amd) return { name: amd[1], article: 'an', exact: true };
  // Intel integrated
  if (r.includes('intel')) {
    const iris = raw.match(/(Iris\s+Xe|UHD\s+Graphics\s*\d*|HD\s+Graphics\s*\d*)/i);
    return { name: iris ? `Intel ${iris[1]}` : 'Intel integrated graphics', article: 'an', exact: !!iris };
  }
  // Mobile
  const adreno = raw.match(/Adreno\s*\(TM\)\s*(\d+)/i);
  if (adreno) return { name: `Qualcomm Adreno ${adreno[1]}`, article: 'a', exact: true };
  const mali = raw.match(/Mali-(\w+)/i);
  if (mali) return { name: `ARM Mali-${mali[1]}`, article: 'an', exact: true };
  // Software renderer / VM
  if (/swiftshader|llvmpipe|basic render/i.test(raw)) {
    return { name: 'a software renderer (no real GPU, a VM, or a headless browser)', article: '', exact: true };
  }
  return null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
