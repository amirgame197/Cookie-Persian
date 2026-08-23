import type { Claim, SignalMap } from '../types';

const claim = (c: Omit<Claim, 'confidence'> & Partial<Pick<Claim, 'confidence'>>): Claim => ({
  confidence: 'likely', ...c,
});

const num = (s: SignalMap, id: string): number | undefined => {
  const v = s[id]?.value;
  return typeof v === 'number' ? v : undefined;
};
const str = (s: SignalMap, id: string): string | undefined => {
  const v = s[id]?.value;
  return typeof v === 'string' ? v : undefined;
};

/**
 * Behavioural claims. Honesty policy baked into the confidence field:
 *   - device type / reading / motion → reliable → 'certain' or 'likely'
 *   - person-level guesses (mood, age, personality) → 'guess', and the copy
 *     says out loud that it's a guess. The OCEAN readout is deliberate theatre.
 */

/** Act 7-ish: "who you are, not what device." Reliable behavioural facts first. */
export function behavioralClaims(s: SignalMap): Claim[] {
  const out: Claim[] = [];

  // Input device. Mouse-vs-trackpad is inference, not an API, so we only assert
  // it when the scroll evidence is clear; otherwise we stay quiet rather than
  // guess wrong (calling a trackpad a "mouse" is the classic false positive).
  const pointer = str(s, 'bhv.pointer');
  const pointerSure = s['bhv.pointerSure']?.value === true;
  if (pointer && pointer !== 'none') {
    const label: Record<string, string> = {
      trackpad: `روی یک *ترک پد* هستید، تقریبا حتما لپ تاپ.`,
      mouse: `از یک *ماوس* استفاده میکنید، نه ترک پد.`,
      touchscreen: `روی یک *صفحه لمسی* هستید.`,
      stylus: `از یک *قلم* استفاده میکنید.`,
    };
    const isInferred = pointer === 'mouse' || pointer === 'trackpad';
    if (label[pointer] && (!isInferred || pointerSure)) {
      out.push(claim({
        id: 'pf.pointer', text: label[pointer], confidence: isInferred ? 'likely' : 'certain', act: 7, weight: 4,
        evidence: ['bhv.pointer'],
        how: `اختلاف های اسکرولتان لو داد. ترک پد مقدارهای کوچک، متغیر و معمولا کسری میفرستد؛ چرخ ماوس پله های بزرگ و تکراری (هرکدام حدود ۱۰۰ پیکسل). APIای نیست که فرقشان را بگوید؛ از شکل اسکرولتان حدس زدیم.`,
      }));
    }
  }

  // Reading vs skimming, lands hard, fully defensible.
  const skimmed = s['bhv.skimmed']?.value === true;
  const wpm = num(s, 'bhv.wpm');
  const depth = num(s, 'bhv.scrollDepth');
  if (skimmed && wpm) {
    out.push(claim({
      id: 'pf.skim',
      text: `واقعا این را نخواندید. با حدود *${wpm.toLocaleString('fa-IR')} کلمه در دقیقه* رد شدید؛ این ورق زدن است، نه خواندن.`,
      confidence: 'likely', act: 7, weight: 6,
      evidence: ['bhv.wpm', 'bhv.scrollDepth'],
      how: `سرعت رد شدن صفحه و تعداد کلماتش را مقایسه کردیم. خواندن واقعی حدود ۶۰۰ کلمه در دقیقه سقف دارد. شما خیلی از آن رد شدید؛ پایین صفحه را میخواستید، نه کلمه ها را.`,
    }));
  } else if (depth != null && depth > 0.85 && wpm && wpm < 500) {
    out.push(claim({
      id: 'pf.read',
      text: `واقعا این را تا آخر و با سرعت خواندن واقعی خواندید. ممنون. بیشتر آدم ها این کار را نمیکنند.`,
      confidence: 'likely', act: 7, weight: 3,
      evidence: ['bhv.wpm', 'bhv.scrollDepth'],
      how: `سرعت اسکرولتان در محدوده خواندن واقعی ماند و به پایین رسیدید. فقط از زمان بندی میفهمیم خواندن با ورق زدن فرق دارد.`,
    }));
  }

  // Keyboard-only navigation → accessibility signal, delivered respectfully.
  if (s['bhv.keyboardOnly']?.value === true) {
    out.push(claim({
      id: 'pf.keyboard',
      text: `کل این صفحه را با *کیبورد* جابه جا شدید، حتی یک بار هم با اشاره گر نه.`,
      confidence: 'certain', act: 7, weight: 4,
      evidence: ['bhv.keyboardNav', 'bhv.pointerNav'],
      how: `هر جابه جایی Tab یا کلید جهت بود، صفر کلیک. آدم هایی که به فناوری کمکی تکیه دارند اغلب این طور در صفحه حرکت میکنند و هر سایت بدون پرسیدن، کامل به عنوان سیگنال رفتاری میبیندش.`,
    }));
  }

  // Tab-away count, passive attention tracking.
  const tabAways = num(s, 'bhv.tabAways');
  if (tabAways != null && tabAways >= 2) {
    out.push(claim({
      id: 'pf.tabaway',
      text: `وقتی این باز بود *${tabAways} بار* نگاهتان را بردید جای دیگر و برگشتید. شمردیم.`,
      confidence: 'certain', act: 7, weight: 3,
      evidence: ['bhv.tabAways'],
      how: `API Page Visibility دقیق میگوید کی تب یا برنامه عوض میکنید و کی برمیگردید. هر سایتی که باز میگذارید بی سر و صدا میشمارد چند بار توجهتان را نگه داشته.`,
    }));
  }

  // Hesitation → soft "stress" framing, explicitly hedged.
  const hes = num(s, 'bhv.hesitationMs');
  if (hes != null && hes > 900) {
    out.push(claim({
      id: 'pf.hesitate',
      text: `قبل از کلیک حدود *${(hes / 1000).toFixed(1)} ثانیه* روی چیزها هاور میکنید. این خواندن برچسب نیست، مکث است.`,
      confidence: 'guess', act: 7, weight: 3,
      evidence: ['bhv.hesitationMs'],
      how: `فاصله رسیدن نشانگر به دکمه و کلیک واقعی را زمان گرفتیم. هاور طولانی کمی با تردید یا احتیاط همبستگی دارد؛ این یکی را خیلی جدی نگیرید.`,
    }));
  }

  return out;
}

/** Claims from the interactive "type this sentence" step. */
export function typingClaims(s: SignalMap): Claim[] {
  // Caught a paste / autofill instead of real typing.
  if (s['key.pasted']?.value === true) {
    return [claim({
      id: 'pf.pasted',
      text: `آن را *پیست* کردید یا مرورگر خودکار پرش کرد. زمان کلیدها را میگرفتیم و هیچ کدام نبود.`,
      confidence: 'certain', act: 7, weight: 5,
      evidence: ['key.pasted'],
      how: `تایپ واقعی بین کلیدها ۸۰ تا ۲۰۰ میلی ثانیه فاصله دارد. مال شما سریع تر از حرکت دست انسان رسید، پس تایپ نشده بود. سایت ها دقیقا با همین زمان بندی کلید آدم ها را از اسکریپت ها جدا میکنند.`,
    })];
  }
  const wpm = num(s, 'key.wpm');
  if (!wpm) return [];
  const out: Claim[] = [];
  const dwell = num(s, 'key.meanDwell');
  const cv = num(s, 'key.rhythmCv');
  const corrections = num(s, 'key.corrections') ?? 0;

  out.push(claim({
    id: 'pf.typing',
    text: `حدود *${wpm} کلمه در دقیقه* تایپ میکنید${corrections > 2 ? ` و ${corrections} بار خودتان را اصلاح کردید` : ''}.`,
    confidence: 'certain', act: 7, weight: 5,
    evidence: ['key.wpm', 'key.corrections'],
    how: `زمان پایین و بالا رفتن هر کلید را ثبت کردیم. سرعت بخش آسان است؛ بخش ارزشمند ریتم بین کلیدهاست که برای هر نفر آنقدر ثابت است که شرکت های واقعی (TypingDNA، BioCatch) از آن برای ورود استفاده میکنند.`,
  }));

  if (cv != null) {
    const steady = cv < 0.6;
    out.push(claim({
      id: 'pf.rhythm',
      text: steady
        ? `ریتم تایپتان *ثابت و تمرین شده* است؛ وقت زیادی با کیبورد میگذرانید.`
        : `ریتم تایپتان *ناهموار* است؛ با دو انگشت تایپ میکنید یا حواستان پرت بوده.`,
      confidence: 'guess', act: 7, weight: 4,
      evidence: ['key.rhythmCv', 'key.meanDwell'],
      how: `تغییرپذیری زمان بین کلیدها (${cv.toFixed(2)}) تایپیست ده انگشتی را از تایپیست دو انگشتی جدا میکند. از یک پاراگراف کامل همین به تنهایی میتواند بین سایت ها دوباره شناسایی تان کند، اما از یک جمله فقط نشانه است.${dwell ? ` هر کلید را حدود ${dwell} میلی ثانیه نگه داشتید.` : ''}`,
    }));
  }
  return out;
}

/** "You've done this before", the cheeky callback when they retype. */
export function repeatTyping(timesBefore: number): Claim[] {
  if (timesBefore < 1) return [];
  const nth = timesBefore + 1;
  return [claim({
    id: 'pf.repeat',
    text: `راستی، *قبلا هم این تست تایپ را انجام داده اید*. این بار *${nth}* است. یادمان مانده. راستش تماشای دوباره اش سرگرم کننده است.`,
    confidence: 'certain', act: 7, weight: 8,
    evidence: [],
    how: `بار اول که تایپ کردید یک یادداشت نگه داشتیم؛ نه در کوکی (آن را پاک میکردید)، بلکه همزمان در localStorage، IndexedDB، Cache API و window.name. پاک کردن کوکی ها به آن کاری نکرد، پس همان لحظه شروع تایپ فهمیدیم قبلا اینجا بوده اید.`,
  })];
}

/**
 * The OCEAN readout, the demo's thesis made literal. We generate a Big Five
 * profile from a single session, then immediately admit it's astrology. The
 * honesty IS the payload: real personality prediction (Kosinski et al., 2013)
 * needed hundreds of data points per person; we have a few seconds of mouse.
 */
export function personalityTheatre(s: SignalMap): Claim[] {
  const efficiency = num(s, 'bhv.pathEfficiency') ?? 0.9;
  const hes = num(s, 'bhv.hesitationMs') ?? 0;
  const skimmed = s['bhv.skimmed']?.value === true;
  const corrections = num(s, 'key.corrections') ?? num(s, 'bhv.backspaces') ?? 0;
  const dwell = num(s, 'bhv.dwellSec') ?? 0;
  const tabAways = num(s, 'bhv.tabAways') ?? 0;
  const depth = num(s, 'bhv.scrollDepth') ?? 0;
  const scrollWpm = num(s, 'bhv.wpm') ?? 0;
  const keyWpm = num(s, 'key.wpm') ?? 0;
  const rhythmCv = num(s, 'key.rhythmCv');
  const clamp = (x: number) => Math.max(0, Math.min(1, x));

  // Deliberately flimsy Big Five scores, the point is that they're flimsy. Each
  // is centred at 0.5 so an unremarkable session sits in the middle and only
  // real behaviour pushes a trait to an extreme, so we don't hand everyone the
  // same "methodical, relaxed" readout. Signals only nudge when they're actually
  // present (a default 0.9 efficiency, meaning "no wandering measured", must NOT
  // read as decisive), which is why every bump is gated on a real reading.
  let openness = 0.5;
  if (skimmed) openness += 0.35;
  openness += Math.min(tabAways, 3) * 0.07;
  if (scrollWpm > 700) openness += 0.12;
  if (depth > 0 && depth < 0.5) openness += 0.1;
  if (!skimmed && depth > 0.9 && scrollWpm > 0 && scrollWpm < 350) openness -= 0.28;

  let consc = 0.5;
  consc += Math.min(corrections, 5) * 0.06;
  if (depth > 0.9) consc += 0.15;
  else if (depth > 0 && depth < 0.4) consc -= 0.2;
  if (hes > 700) consc += 0.1;
  if (skimmed) consc -= 0.2;

  let extra = 0.5;
  if (hes > 0 && hes < 250) extra += 0.2;
  if (hes > 900) extra -= 0.2;
  if (keyWpm > 65) extra += 0.15;
  if (efficiency < 0.6) extra -= 0.2;
  if (skimmed) extra += 0.1;

  let agree = 0.5;
  if (hes > 800) agree += 0.2;
  if (rhythmCv != null && rhythmCv < 0.55) agree += 0.12;
  if (corrections > 3) agree += 0.1;
  if (hes > 0 && hes < 250) agree -= 0.15;

  let neuro = 0.5;
  if (hes > 1200) neuro += 0.25; else if (hes > 700) neuro += 0.1;
  neuro += Math.min(corrections, 6) * 0.05;
  neuro += Math.min(tabAways, 3) * 0.06;
  if (rhythmCv != null && rhythmCv > 0.85) neuro += 0.12;
  if (dwell > 0 && dwell < 8 && !skimmed) neuro += 0.08;
  if (hes > 0 && hes < 300 && corrections === 0) neuro -= 0.2;

  // Three phrases per trait, low → high. Each is a clean, self-contained
  // descriptor (no internal commas or "and") so any two combine as a readable
  // "you're X and Y" instead of a jumbled list.
  const PHRASES: Record<string, [string, string, string]> = {
    Openness: ['روش مند', 'متمرکز', 'بی قرار و کنجکاو'],
    Conscientiousness: ['راحت گیر', 'منظم', 'موشکاف'],
    Extraversion: ['درون گرا', 'سنجیده', 'قاطع'],
    Agreeableness: ['رک', 'خونسرد', 'دیپلماتیک'],
    Neuroticism: ['خونسرد و آرام', 'کمی مضطرب', 'مضطرب و ناآرام'],
  };
  const tier = (x: number) => (x < 0.42 ? 0 : x < 0.66 ? 1 : 2);

  const scores = [
    { key: 'گشودگی', score: clamp(openness) },
    { key: 'وظیفه شناسی', score: clamp(consc) },
    { key: 'برون گرایی', score: clamp(extra) },
    { key: 'توافق پذیری', score: clamp(agree) },
    { key: 'روان رنجوری', score: clamp(neuro) },
  ];
  const traits: Record<string, string> = {};
  for (const { key, score } of scores) traits[key] = PHRASES[key][tier(score)];

  // Headline the two traits furthest from the middle, not always the same pair,
  // so people stop all reading "methodical, relaxed". A per-session seed (fonts
  // / GPU) breaks ties, so even a no-signal visit varies which two show.
  const seedStr = str(s, 'fonts.hash') ?? str(s, 'gpu.renderer') ?? str(s, 'platform.ua') ?? '';
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed + seedStr.charCodeAt(i)) % 97;
  const ranked = scores
    .map((sc, i) => ({ ...sc, rank: Math.abs(sc.score - 0.5) + ((seed + i) % 5) / 1000 }))
    .sort((a, b) => b.rank - a.rank);
  const a = traits[ranked[0].key];
  const b = traits[ranked[1].key];

  const summary = scores.map(({ key }) => `${key}: ${traits[key]}`).join(' · ');

  return [claim({
    id: 'pf.ocean',
    text: `با ${dwell} ثانیه تماشا، نتیجه این است: شما *${a}* و *${b}* هستید. تقریبا به اندازه فال علمی است و با این حال انجامش دادیم؛ دقیقا نکته همین است.`,
    confidence: 'guess', act: 7, weight: 7,
    evidence: ['bhv.pathEfficiency', 'bhv.hesitationMs', 'bhv.dwellSec'],
    how: `حدس کامل Big Five: ${summary}. استنتاج شخصیت از رفتار دیجیتال واقعا زمینه پژوهشی است؛ مطالعه Kosinski در ۲۰۱۳ با صدها داده از ده ها هزار نفر ویژگی ها را پیش بینی کرد. ما فقط چند ثانیه از یک نشست داریم که تقریبا هیچ سیگنالی نیست. فناوری تبلیغات با داده بسیار بیشتر همیشه همین حدس را درباره شما میزند و نتیجه را نشان نمیدهد. ما نتیجه خودمان را نشان میدهیم و میگوییم بیشترش بی معناست. مال آن ها بهتر است و هرگز نمیبینیدش.`,
  })];
}
