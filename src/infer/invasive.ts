import type { Claim, Inference, SignalMap } from '../types';

const claim = (c: Omit<Claim, 'confidence'> & Partial<Pick<Claim, 'confidence'>>): Claim => ({
  confidence: 'likely', ...c,
});

function humanList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} و ${items[1]}`;
  return `${items.slice(0, -1).join('، ')} و ${items[items.length - 1]}`;
}

interface OpenPort { port: number; service: string; ms: number; }

/** The headline of the invasive act: services running on your own machine. */
export const localServices: Inference = (s) => {
  const ports = (s['localnet.openPorts']?.value as OpenPort[] | undefined) ?? [];
  if (s['localnet.blocked']?.value === true || !ports.length) return [];
  const out: Claim[] = [];

  // Call out the juiciest finds by name first.
  const named: Record<number, { text: string; weight: number }> = {
    11434: { text: `*Ollama* درحال اجراست، روی این دستگاه مدل های هوش مصنوعی محلی اجرا میکنید.`, weight: 10 },
    1234: { text: `*LM Studio* درحال اجراست، مدل های زبانی محلی اجرا میکنید.`, weight: 9 },
    7860: { text: `یک رابط وب *Stable Diffusion* به صورت محلی درحال اجرا دارید.`, weight: 9 },
    2375: { text: `*Docker* روی دستگاه شما درحال اجراست.`, weight: 7 },
    8888: { text: `یک سرور نوت بوک *Jupyter* درحال اجرا دارید.`, weight: 8 },
    5432: { text: `یک دیتابیس *PostgreSQL* روی دستگاه شما درحال اجراست.`, weight: 7 },
    3306: { text: `یک دیتابیس *MySQL* به صورت محلی درحال اجرا دارید.`, weight: 7 },
    6379: { text: `*Redis* روی localhost درحال اجراست.`, weight: 7 },
    27017: { text: `یک سرور *MongoDB* روی دستگاه شما درحال اجراست.`, weight: 7 },
    32400: { text: `یک سرور رسانه *Plex* اجرا میکنید.`, weight: 8 },
    8096: { text: `یک سرور رسانه *Jellyfin* اجرا میکنید.`, weight: 8 },
  };

  const highlights = ports.filter((p) => named[p.port]).slice(0, 4);
  for (const p of highlights) {
    out.push(claim({
      id: `net.${p.port}`,
      text: named[p.port].text,
      confidence: 'likely', act: 6, weight: named[p.port].weight,
      evidence: ['localnet.openPorts', 'localnet.method'],
      how: `مرورگر شما نمیتواند پاسخ های localhost را بخواند، اما میتواند زمان اتصال را *اندازه بگیرد*. پورت ${p.port} یک اتصال TCP را به شکلی پذیرفت که یک پورت بسته هرگز نمیپذیرد (${Math.round(p.ms)} میلی ثانیه در برابر رد شدن فوری پورت مرده). این یعنی ${p.service} روی کامپیوتر شما درحال اجراست؛ چیزی که یک سایت عمومی فهمید.`,
    }));
  }

  // A dev-server sweep as a group, if we found the usual suspects.
  const devPorts = ports.filter((p) => [3000, 5173, 8080, 8000, 5000, 4200, 3001].includes(p.port));
  if (devPorts.length >= 2 && !highlights.length) {
    out.push(claim({
      id: 'net.dev',
      text: `شما یک *توسعه دهنده* هستید، همین الان سرورهای توسعه محلی روی ${devPorts.map((p) => p.port).join('، ')} درحال اجرا دارید.`,
      confidence: 'likely', act: 6, weight: 7,
      evidence: ['localnet.openPorts'],
      how: `این ها پورت های پیش فرض React، Vite، Django، Flask و بقیه هستند. یک سایت با زمان گرفتن اتصال ها، رابط loopback شما را پورت اسکن کرد و کارتان را پیدا کرد.`,
    }));
  }

  return out;
};

/** Installed desktop apps via protocol-handler probing. */
export const installedApps: Inference = (s) => {
  const apps = (s['apps.installed']?.value as string[] | undefined) ?? [];
  if (!apps.length) return [];
  return [claim({
    id: 'apps.list',
    text: `${humanList(apps)} را نصب دارید.`,
    confidence: 'guess', act: 6, weight: 6,
    evidence: ['apps.installed', 'apps.probed'],
    how: `هرکدام از این برنامه ها یک اسکیم URL در سیستم عامل شما ثبت کرده اند (مثل slack:// و discord://). بی سر و صدا بررسی کردیم که مرورگر شما آن را به یک برنامه نصب شده میسپارد یا نه؛ این ها پاسخ دادند.`,
  })];
};

/** Browser extensions and the ad blocker. */
export const extensions: Inference = (s) => {
  const detected = (s['ext.detected']?.value as Array<{ name: string; id: string }> | undefined) ?? [];
  const out: Claim[] = [];

  if (detected.length) {
    const names = detected.map((d) => d.name);
    const spicy = names.find((n) => /metamask|wallet|lastpass|bitwarden|1password/i.test(n));
    out.push(claim({
      id: 'ext.list',
      text: spicy
        ? `*${spicy}* را نصب دارید${names.length > 1 ? `، به اضافه ${names.length - 1} افزونه دیگر` : ''}.`
        : `این افزونه های مرورگر را دارید: ${humanList(names)}.`,
      confidence: 'likely', act: 6, weight: spicy ? 8 : 5,
      evidence: ['ext.detected'],
      how: `افزونه ها فایل هایی با برچسب "web-accessible" دارند. تلاش کردیم یک فایل شناخته شده از هر افزونه محبوب را بارگیری کنیم؛ آن هایی که بارگذاری شدند نصب هستند. ${spicy ? 'لو رفتن کیف پول رمزارز یا مدیر رمز عبور، خیلی واضح است.' : ''}`,
    }));
  }

  if (s['ext.adblock']?.value === true) {
    const name = s['ext.adblockName']?.value as string | undefined;
    out.push(claim({
      id: 'ext.adblock',
      text: name && name !== 'unknown'
        ? `تبلیغ ها را با *${name}* مسدود میکنید.`
        : `یک *مسدود کننده تبلیغ* دارید.`,
      confidence: 'certain', act: 6, weight: 4,
      evidence: ['ext.adblock', 'ext.adblockName'],
      how: `یک عنصر طعمه با نام کلاس هایی که مسدود کننده های تبلیغ دنبالشان هستند گذاشتیم. ناپدید شد، پس چیزی صفحه شما را فیلتر میکند. ${name && name !== 'unknown' ? `امضایش با ${name} جور است.` : ''}`,
    }));
  }

  return out;
};
