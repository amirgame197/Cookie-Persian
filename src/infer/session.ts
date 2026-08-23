import type { Claim, Inference, SignalMap } from '../types';

const claim = (c: Omit<Claim, 'confidence'> & Partial<Pick<Claim, 'confidence'>>): Claim => ({
  confidence: 'likely', ...c,
});

const num = (s: SignalMap, id: string): number | undefined => {
  const v = s[id]?.value;
  return typeof v === 'number' ? v : undefined;
};

/** "You asked not to be tracked. We saw it. We ignored it.", act 4. */
export const trackingHypocrisy: Inference = (s) => {
  const dnt = s['platform.dnt']?.value;
  const gpc = s['platform.gpc']?.value === true;
  const on = dnt === '1' || dnt === 'yes' || dnt === true || gpc;
  if (!on) return [];
  const which = gpc && dnt === '1' ? 'عدم ردیابی و کنترل حریم خصوصی جهانی' : gpc ? 'کنترل حریم خصوصی جهانی' : 'عدم ردیابی';
  return [claim({
    id: 'ses.dnt',
    text: `*${which}* را روشن کرده اید و از سایت ها میخواهید ردیابی تان نکنند. درخواست را دیدیم. نادیده گرفتیم. تقریبا همه همین کار را میکنند.`,
    confidence: 'certain', act: 4, weight: 5,
    evidence: ['platform.dnt', 'platform.gpc'],
    how: `مرورگر شما در هر درخواست یک هدر میفرستد که میخواهد ردیابی نشوید. تقریبا هیچ کس رعایتش نمیکند چون هرگز الزام قانونی نداشت (GPC در قانون کالیفرنیا کمی قدرت دارد؛ DNT عملا هیچ). سیگنال میرسد، سایت انتخاب میکند اهمیت بدهد یا نه. بیشترشان نمیدهند.`,
  })];
};

/** Battery state → "you're not plugged in.", act 3. */
export const batteryState: Inference = (s) => {
  const level = num(s, 'hw.batteryLevel');
  const charging = s['hw.charging']?.value;
  if (level == null) return [];
  // A desktop with NO battery reports exactly level 1.0 + charging:true, which
  // is indistinguishable from a plugged-in laptop at full charge. Saying "your
  // battery is at 100%" to someone with no battery is the tell we avoid, so we
  // only speak when there's something a battery-less machine can't produce.
  if (level >= 1 && charging !== false) return [];
  const pct = Math.round(level * 100);
  return [claim({
    id: 'ses.battery',
    text: charging === false
      ? `باتری شما *${pct}%* است و همین الان *به برق وصل نیست*.`
      : `باتری شما *${pct}%* است.`,
    confidence: 'certain', act: 3, weight: 3,
    evidence: ['hw.batteryLevel', 'hw.charging'],
    how: `API وضعیت باتری، میزان دقیق شارژ و اینکه به برق وصلید یا نه را بدون دسترسی به هر سایتی میدهد. Firefox و Safari دقیقا چون اثرانگشت خوبی بود حذفش کردند؛ Chrome هنوز داردش.`,
  })];
};

/**
 * The one honest piece of good news, a rare "this got better" beat. Login
 * detection genuinely died around 2020 (SameSite cookies), so we say so rather
 * than fake a "you're logged into X" moment that would be all false positives.
 */
export const loginDetectionDead: Inference = () => {
  return [{
    id: 'ses.logindead',
    text: `ده سال پیش میتوانستم همه سایت هایی را که همین الان واردشانید فهرست کنم؛ Gmail، GitHub، بانک. مرورگرها حدود ۲۰۲۰ بالاخره *این ترفند را کشتند*. تنها چیز این صفحه که واقعا بهتر شد.`,
    confidence: 'certain', act: 4, weight: 2,
    evidence: [],
    how: `حمله از هر سایت یک تصویر مخصوص کاربران واردشده بارگذاری میکرد و میدید باز میشود یا نه. جواب میداد چون کوکی نشست شما با درخواست بین سایتی میرفت. بعد مرورگرها SameSite=Lax را پیش فرض کردند، پس دیگر نمیرود و مسیرهای نشت هم بسته شدند. در ۲۰۲۶ بررسی کردیم: همه جا مرده است. از این برد نادر لذت ببرید.`,
  }];
};

/** DevTools open + free disk, the developer-audience "gotcha.", act 6. */
export const sessionMeta: Inference = (s) => {
  const out: Claim[] = [];

  if (s['incognito.private']?.value === true) {
    out.push(claim({
      id: 'ses.incognito',
    text: `*احتمالا در پنجره خصوصی* هستید. فکر کردید چیزی که میبینیم عوض میشود. *هیچ چیز* عوض نشد. بامزه است.`,
      confidence: 'guess', act: 6, weight: 7,
      evidence: ['incognito.private', 'incognito.method'],
      how: `حالت خصوصی فقط جلوی نوشتن تاریخچه و کوکی مرورگر خودتان روی دیسک را میگیرد. به آیپی، GPU، فونت، صفحه یا هیچ چیز این صفحه دست نمیزند و همه همان طور کار کردند. پنجره خصوصی Safari، Origin Private File System را خاموش میکند و مال شما خاموش است. چون دیسک واقعا پر هم همین خطا را میدهد، میگوییم «احتمالا».`,
    }));
  } else if (s['incognito.attempted']?.value === false) {
    out.push(claim({
      id: 'ses.incognitoUnknown',
    text: `راستی پنجره خصوصی *هیچ کدام* از این ها را عوض نمیکرد. همه چیز بالا در آن هم دقیقا همین طور کار میکند.`,
      confidence: 'certain', act: 6, weight: 2,
      evidence: ['incognito.attempted'],
      how: `حالت خصوصی فقط جلوی نوشتن تاریخچه و کوکی روی دیسک را میگیرد و به آیپی، GPU، فونت، صفحه یا منطقه زمانی دست نمیزند. نمیگوییم حتما در آن هستید؛ در مرورگر شما عمدا حدس نمیزنیم: Chrome شکاف سهم ذخیره سازی را بست و تست زمان جایگزین روی دستگاه های عادی با حافظه سریع اشتباه میکند، ضمن اینکه نشانه باقی مانده Firefox از محافظت ردیابی سخت گیرانه در پنجره عادی قابل تشخیص نیست.`,
    }));
  }


  // Note: we deliberately do NOT claim "free disk space" here. storage.estimate()
  // returns a quota the browser scales and heavily buckets, so it's a poor proxy
  // for real free space (often off by tens of GB). We keep it only as raw signal.

  return out;
};
