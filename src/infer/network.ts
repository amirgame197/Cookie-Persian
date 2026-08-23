import type { Claim, Inference, SignalMap } from '../types';

const claim = (c: Omit<Claim, 'confidence'> & Partial<Pick<Claim, 'confidence'>>): Claim => ({
  confidence: 'likely', ...c,
});

/** WebRTC IP leak → your real address, VPN or not. Act 6 (invasive). */
export const webrtcClaims: Inference = (s) => {
  if (s['webrtc.blocked']?.value === true) return [];
  const out: Claim[] = [];

  const publicIP = s['webrtc.publicIP']?.value as string | null | undefined;
  const localIPs = (s['webrtc.localIPs']?.value as string[] | undefined) ?? [];
  const edgeIP = s['edge.ip']?.value as string | undefined;

  if (publicIP) {
    const mismatch = edgeIP && edgeIP !== publicIP;
    out.push(claim({
      id: 'net.webrtcPublic',
      text: mismatch
        ? `WebRTC همین الان یک *آیپی عمومی متفاوت* از آیپی مرورگر شما لو داد. اگر VPN دارید، این همان آدرسی است که قرار بوده پنهان کند.`
        : `WebRTC مستقیم آیپی عمومی شما را داد: *${publicIP}*.`,
      confidence: 'likely', act: 6, weight: mismatch ? 9 : 6,
      evidence: ['webrtc.publicIP', 'edge.ip'],
      how: `یک اتصال پنهان WebRTC از سرور STUN میپرسد «آدرس من چیست؟» و مرورگر جواب میدهد؛ خارج از کنترل صفحه و در گذشته خارج از کنترل خیلی از VPNها هم. ${mismatch ? 'فرق داشتن این دو آیپی همان نشتی است.' : ''}`,
    }));
  }

  if (localIPs.length) {
    out.push(claim({
      id: 'net.webrtcLocal',
      text: `آدرس دستگاه شما در شبکه خودتان *${localIPs[0]}* است.`,
      confidence: 'certain', act: 6, weight: 6,
      evidence: ['webrtc.localIPs'],
      how: `WebRTC آیپی شبکه داخلی شما را لو داد (${localIPs.join('، ')}). این آدرسی است که روترتان به دستگاه داده؛ معمولا برای سایت ها نامرئی است، اما اینجا از همان سازوکار تماس ویدیویی بیرون آمد.`,
    }));
  } else if (s['webrtc.mdnsProtected']?.value === true) {
    out.push(claim({
      id: 'net.mdns',
      text: `مرورگر شما آیپی داخلی را پشت یک نام مستعار mDNS پنهان کرد، خوب است. محافظتش فعال است.`,
      confidence: 'certain', act: 6, weight: 2,
      evidence: ['webrtc.mdnsProtected'],
      how: `مرورگرهای جدید آیپی واقعی شبکه داخلی را در کاندیداهای WebRTC با یک نام تصادفی *.local جایگزین میکنند. مرورگر شما هم همین کار را کرد. این یکی از معدود دفاع های اثرانگشت است که پیش فرض فعال است.`,
    }));
  }

  return out;
};

/** Permission-state probing → "you already granted camera/mic/location." */
export const permissionClaims: Inference = (s) => {
  const granted = (s['perm.granted']?.value as string[] | undefined) ?? [];
  const paired = (s['perm.pairedDevices']?.value as string[] | undefined) ?? [];
  const caps = s['perm.capabilities']?.value as Record<string, boolean> | undefined;
  const out: Claim[] = [];

  const spicy = granted.filter((g) => ['camera', 'microphone', 'geolocation'].includes(g));
  if (spicy.length) {
    out.push(claim({
      id: 'net.granted',
      text: `قبلا در یک سایت به این مرورگر اجازه دسترسی به *${humanList(spicy)}* داده اید، و ما بدون پرسیدن میبینیمش.`,
      confidence: 'certain', act: 6, weight: 8,
      evidence: ['perm.granted', 'perm.states'],
      how: `navigator.permissions.query() میگوید یک اجازه داده شده، رد شده یا تنظیم نشده؛ و برای بررسی هرگز پیامی نشان نمیدهد. بیشتر آدم ها فکر میکنند سایت تا نپرسد نمیداند دوربینشان قبلا باز شده. اما میداند.`,
    }));
  }

  if (paired.length) {
    out.push(claim({
      id: 'net.paired',
      text: `قبلا یک دستگاه را با این سایت جفت کرده اید، هنوز هم میبینیمش: *${paired[0]}*.`,
      confidence: 'certain', act: 6, weight: 7,
      evidence: ['perm.pairedDevices'],
      how: `وقتی به یک سایت اجازه دسترسی به دستگاه USB، HID یا سریال بدهید، در هر بازدید بعدی میتواند بدون پیام و قبل از هر تعامل، همان دستگاه را دوباره فهرست کند. ${paired.length > 1 ? `${paired.length} تا پیدا کردیم.` : ''}`,
    }));
  }

  // The "what your browser refuses vs. allows" contrast, a thoughtful beat.
  if (caps) {
    const invasive = ['idle', 'pressure'].filter((k) => caps[k]);
    if (invasive.length) {
      out.push(claim({
        id: 'net.idle',
        text: caps.idle
          ? `مرورگر شما به سایت میگوید *کی از پشت میزتان بلند میشوید*. (Chrome این را دارد. Firefox و Safari رسما گفتند نظارت است و نساختندش.)`
          : `مرورگر شما همین الان و لحظه ای میگوید CPU چقدر درگیر است.`,
        confidence: 'certain', act: 6, weight: 5,
        evidence: ['perm.capabilities'],
        how: `APIهای Idle Detection و Compute Pressure فقط در Chrome هستند. Idle Detection به صفحه میگوید دیگر دستگاه را لمس نمیکنید؛ Mozilla و Apple دقیقا به خاطر امکان هایی که میدهد از ساختنش گذشتند. انتخاب مرورگر شما تعیین میکند سایت چقدر از این کارها میتواند بکند.`,
      }));
    }
  }

  return out;
};

/** CPU architecture from the NaN sign-bit trick, a silent "creepy fact." */
export const deepClaims: Inference = (s) => {
  const out: Claim[] = [];
  // Prefer the browser's own UA-CH architecture hint, which is authoritative.
  // The NaN sign-bit trick is only a fallback, and we stay silent when the two
  // disagree rather than confidently telling an i9 owner they're on ARM.
  const hinted = (s['platform.arch']?.value as string | undefined)?.toLowerCase();
  const nanGuess = s['deep.archGuess']?.value as string | undefined;
  const hintedFamily = hinted ? (hinted.includes('arm') ? 'ARM-family' : hinted.includes('x86') ? 'x86-family' : undefined) : undefined;
  const agree = hintedFamily && nanGuess && hintedFamily === nanGuess;
  const arch = hintedFamily ?? (nanGuess && nanGuess !== 'unknown' ? nanGuess : undefined);

  if (arch && (!hintedFamily || !nanGuess || nanGuess === 'unknown' || agree)) {
    out.push(claim({
      id: 'net.arch',
      text: `CPU شما *${arch}* است.`,
      confidence: hintedFamily ? 'certain' : 'guess', act: 2, weight: 4,
      evidence: ['platform.arch', 'deep.archGuess', 'deep.nanArch'],
      how: hintedFamily
        ? `مرورگر معماری CPU را در client hint خودش میدهد، بدون نیاز به دسترسی.${agree ? ' با یک ترفند ریاضی دوباره چک کردیم: Infinity منهای Infinity، NaN میسازد که بیت علامتش بین x86 و ARM فرق دارد. هر دو یکی گفتند.' : ''}`
        : `Infinity منهای Infinity میشود NaN، یعنی «عدد نیست». اما NaN بیت علامت دارد و جهت آن بین پردازنده های x86 و ARM فرق میکند. با یک تفریق، خانواده CPU شما لو میرود. این یک روش حدسی است، پس در حد حدس ببینیدش.`,
    }));
  }
  if (s['deep.applePay']?.value === 'available') {
    out.push(claim({
      id: 'net.applePay',
      text: `روی این دستگاه یک *کارت پرداخت راه اندازی شده در Apple Pay* دارید.`,
      confidence: 'likely', act: 5, weight: 5,
      evidence: ['deep.applePay'],
      how: `ApplePaySession.canMakePayments() فقط وقتی true برمیگرداند که واقعا کارت تنظیم شده باشد. سایت میتواند بی سر و صدا و بدون پیام بررسی کند و بفهمد آماده پرداخت هستید.`,
    }));
  }
  const flavor = s['deep.vendorFlavor']?.value as string | undefined;
  if (flavor && flavor !== 'standard') {
    out.push(claim({
      id: 'net.vendor',
      text: `مرورگر واقعی شما *${flavor}* است، با اینکه موتور مشترکی با بقیه دارد و User-Agent خیلی چیزی نمیگوید.`,
      confidence: 'likely', act: 2, weight: 4,
      evidence: ['deep.vendorFlavor'],
      how: `مرورگرها متغیرهای سراسری مخصوص سازنده شان را جا میگذارند (Yandex، UC، Samsung Internet، Chrome-on-iOS). بررسیشان کردیم. مخصوصا در iOS همه مرورگرها زیرش Safari هستند، اما این ها از هم جداشان میکند.`,
    }));
  }
  return out;
};

function humanList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} و ${items[1]}`;
  return `${items.slice(0, -1).join('، ')} و ${items[items.length - 1]}`;
}
