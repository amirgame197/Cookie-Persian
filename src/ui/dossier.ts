import type { Claim, SignalMap } from '../types';
import type { KeyEvent } from '../probes/interactive';
import { follow } from './autoscroll';

export const ACTS: Record<number, { label: string; invasive?: boolean }> = {
  0: { label: '' },
  1: { label: 'موقعیت مکانی شما' },
  2: { label: 'دستگاهی که از آن استفاده میکنید' },
  3: { label: 'آنچه در دستگاه شماست' },
  4: { label: "موارد غیر منتظره!" },
  5: { label: 'چیز هایی که نصب دارید' },
  6: { label: 'مسیر هایی که میتوانیم در دستگاه شما ببینیم', invasive: true },
  7: { label: 'جدای از دستگاه شما، خودتان چه هستید', invasive: true },
  8: { label: 'چقدر ارزش دارید؟' },
  9: { label: "قبلا با هم ملاقات داشته ایم؟" },
  10: { label: 'معنی همه این ها' },
};

const HEDGE: Record<Claim['confidence'], string> = {
  certain: '',
  likely: '',
  guess: '',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Dossier {
  private root: HTMLElement;
  private acts = new Map<number, HTMLElement>();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /** The page opens as a bare blinking cursor, nothing has "loaded" yet. */
  async boot(): Promise<void> {
    const el = document.createElement('p');
    el.className = 'boot';
    el.innerHTML = '<span class="caret"></span>';
    this.root.append(el);
    await sleep(reduceMotion() ? 0 : 900);
    el.remove();
  }

  private act(n: number): HTMLElement {
    let el = this.acts.get(n);
    if (el) return el;
    const meta = ACTS[n] ?? { label: '' };
    el = document.createElement('section');
    el.className = meta.invasive ? 'act invasive' : 'act';
    // Empty label (e.g. the opening hook) gets no label paragraph.
    el.innerHTML = meta.label ? `<p class="act-label">${escape(meta.label)}</p>` : '';
    this.root.append(el);
    this.acts.set(n, el);
    return el;
  }

  /**
   * Render one claim. Pacing is deliberate: heavier claims get a longer beat
   * before them, so the reveal lands rather than dumping.
   */
  async reveal(claim: Claim, signals: SignalMap): Promise<void> {
    const beat = reduceMotion() ? 0 : Math.min(120 + claim.weight * 55, 900);
    await sleep(beat);

    const host = this.act(claim.act);
    const p = document.createElement('p');
    p.className = claim.act === 0 ? 'claim hook' : `claim ${claim.confidence}`;
    p.innerHTML = markup(claim.text) + `${HEDGE[claim.confidence]}`;

    const btn = document.createElement('button');
    btn.className = 'how-toggle';
    btn.type = 'button';
    btn.textContent = 'چطور؟';
    btn.setAttribute('aria-expanded', 'false');

    const drawer = document.createElement('div');
    drawer.className = 'how';
    drawer.hidden = true;
    drawer.innerHTML = evidenceHtml(claim, signals);

    btn.addEventListener('click', () => {
      drawer.hidden = !drawer.hidden;
      btn.setAttribute('aria-expanded', String(!drawer.hidden));
    });

    p.append(btn);
    host.append(p, drawer);
    follow(p, { smooth: true, ratio: 0.78 });
  }

  /** The consent gate between the passive acts and the invasive ones. */
  gate(prompt: string, cta: string): Promise<boolean> {
    return new Promise((resolve) => {
      const wrap = document.createElement('section');
      wrap.className = 'act gate';
      const p = document.createElement('p');
      p.textContent = prompt;
      const yes = document.createElement('button');
      yes.className = 'go';
      yes.textContent = cta;
      const no = document.createElement('button');
      no.className = 'go ghost';
      no.textContent = 'نه ممنون';
      no.style.marginLeft = '0.6rem';
      yes.addEventListener('click', () => { wrap.remove(); resolve(true); });
      no.addEventListener('click', () => { wrap.remove(); resolve(false); });
      wrap.append(p, yes, no);
      this.root.append(wrap);
    });
  }

  section(html: string): HTMLElement {
    const el = document.createElement('section');
    el.className = 'act';
    el.innerHTML = html;
    this.root.append(el);
    return el;
  }

  /** A live "scanning…" placeholder shown while slow probes run. Caller removes it. */
  scanning(text: string): HTMLElement {
    const el = document.createElement('section');
    el.className = 'act';
    el.innerHTML = `<p class="scanning">${escape(text)}<span class="dots"></span></p>`;
    this.root.append(el);
    return el;
  }

  /**
   * The interactive typing step. Shows a target sentence and an input; resolves
   * with the input element (whose keystrokes a probe has been recording) once
   * the user has typed enough, or immediately if they skip.
   */
  typingPrompt(target: string): Promise<{ events: KeyEvent[]; value: string; skipped: boolean }> {
    return new Promise((resolve) => {
      const wrap = document.createElement('section');
      wrap.className = 'act invasive';
      wrap.innerHTML = `
        <p class="act-label">حالا بیایید شما را معرفی کنیم، نه دستگاه تان را</p>
        <p class="claim likely" style="opacity:1;transform:none">این جمله را تایپ کنید. ما نحوه تایپ شما را خواهیم خواند، نه فقط آنچه را که تایپ میکنید...</p>
        <p class="type-target">${escape(target)}</p>
      `;
      const input = document.createElement('input');
      input.className = 'type-input';
      input.type = 'text';
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-label', 'جمله بالا را تایپ کنید');

      // Record keystroke timing from the very first key, this is the whole point.
      const events: KeyEvent[] = [];
      const downAt = new Map<string, number>();
      input.addEventListener('keydown', (e) => {
        if (!downAt.has(e.key)) downAt.set(e.key, performance.now());
      });
      input.addEventListener('keyup', (e) => {
        const d = downAt.get(e.key);
        if (d != null) { events.push({ key: e.key, down: d, up: performance.now() }); downAt.delete(e.key); }
      });

      const hint = document.createElement('p');
      hint.className = 'type-hint';
      hint.textContent = 'ادامه دهید...';

      const done = document.createElement('button');
      done.className = 'go';
      done.textContent = 'تایپ کردن من را بخوان';
      done.style.marginTop = '1rem';
      done.disabled = true;

      const skip = document.createElement('button');
      skip.className = 'go ghost';
      skip.textContent = 'رد کردن این مرحله';
      skip.style.marginLeft = '0.6rem';

      let settled = false;
      const finish = (skipped: boolean) => {
        if (settled) return; settled = true;
        const value = input.value;
        input.disabled = true; done.remove(); skip.remove();
        resolve({ events: skipped ? [] : events, value, skipped });
      };

      // Never cut the user off, only enable Done once there's enough to analyse.
      const MIN = 18;
      input.addEventListener('input', () => {
        const n = input.value.trim().length;
        done.disabled = n < MIN;
        if (n < MIN) { hint.textContent = 'ادامه دهید...'; hint.className = 'type-hint'; }
        else if (n < target.length - 2) { hint.textContent = 'همینقدر برای خواندن شما کافیست. این خط را تمام کن یا دکمه را بزن.'; hint.className = 'type-hint ready'; }
        else { hint.textContent = 'عالی. دکمه اینتر را بزن.'; hint.className = 'type-hint ready'; }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim().length >= MIN) finish(false);
      });
      done.addEventListener('click', () => finish(false));
      skip.addEventListener('click', () => finish(true));

      wrap.append(input, hint, done, skip);
      this.root.append(wrap);
      // preventScroll: focusing must NOT yank the page down to the box, the
      // user is still reading above it.
      input.focus({ preventScroll: true });
    });
  }

  /** The rarity funnel, each attribute narrows you, with a running "1 in N". */
  async rarityFunnel(rows: Array<{ label: string; value: string; pct: number; cumulative: number }>): Promise<void> {
    const el = document.createElement('section');
    el.className = 'act';
    el.innerHTML = `<p class="act-label">چقدر شما را کمیاب میکند؟</p>
      <p class="claim likely" style="opacity:1;transform:none">هر چیزی به خودی خود رایج است. اما ببینید چقدر سریع تکثیر میشوند.</p>
      <div class="funnel"></div>`;
    this.root.append(el);
    const host = el.querySelector('.funnel')!;
    const reduce = reduceMotion();
    for (const r of rows) {
      await sleep(reduce ? 0 : 320);
      const line = document.createElement('div');
      line.className = 'funnel-row';
      const pct = r.pct >= 0.01 ? `${Math.round(r.pct * 100)}%` : `${(r.pct * 100).toFixed(1)}%`;
      line.innerHTML = `
        <div class="funnel-head"><span class="funnel-label">${escape(r.label)}</span><span class="funnel-val">${escape(r.value)}</span></div>
        <div class="funnel-bar"><span style="width:${Math.max(2, Math.min(100, r.pct * 100))}%"></span></div>
        <div class="funnel-meta"><span>${pct} of people</span><span class="funnel-cum">1 in ${r.cumulative.toLocaleString()}</span></div>`;
      host.append(line);
    }
  }

  /** Render the OpenRTB receipt: a syntax-lit JSON block with a caption. */
  adReceipt(bidRequest: unknown, pixels: Array<{ name: string; value: string; means: string }>): void {
    const json = JSON.stringify(bidRequest, null, 2);
    const el = document.createElement('section');
    el.className = 'act';
    const pixelHtml = pixels.length
      ? `<p class="claim likely" style="opacity:1;transform:none">مرورگر شما هم اکنون هم درحال حمل شناسه های ردیابی ست:</p>` +
        pixels.map((p) => `<div class="how" style="margin-bottom:.6rem"><b>${escape(p.name)}</b> = ${escape(p.value)}\n${escape(p.means)}</div>`).join('')
      : '';
    el.innerHTML = `
      <p class="act-label">چقدر ارزش دارید</p>
      <p class="claim likely" style="opacity:1;transform:none">هر صفحه تبلیغاتی که باز میکنید، شما را در عرض حدود یک دهم ثانیه به ده‌ ها پیشنهاد دهنده پیشنهاد میدهد. این یک نمونه پیام واقعی است که شما را توصیف می‌کند، که همین الان، از داده‌های واقعی شما، در قالب واقعی (OpenRTB 2.6) ساخته شده است:</p>
      <pre class="raw json-receipt">${escape(json)}</pre>
      <p class="how" style="border:0;margin:.4rem 0 1.4rem;padding:0">همه چیز اینجا واقعی است، به جز <b>user.data.segment</b>. اینجاست که یک دلال داده، علایق استنباطی شما (مثلاً "در بازار خودرو"، "والدین جدید"، "دارنده کارت") را ضمیمه میکند. ما نمی‌توانیم علایق شما را نشان دهیم چون ما خریدار نیستیم. پیشنهاد دهندگان می‌توانند.</p>
      ${pixelHtml}
    `;
    this.root.append(el);
  }
}

/** `*emphasis*` in claim text becomes the highlighted span. */
function markup(text: string): string {
  return escape(text).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function evidenceHtml(claim: Claim, signals: SignalMap): string {
  const lines = claim.evidence.map((id) => {
    const s = signals[id];
    if (!s) return `${id} = <i>در دسترس نیست</i>`;
    const v = s.display ?? stringify(s.value);
    return `${escape(s.label)} = <b>${escape(truncate(v, 220))}</b>`;
  });
  return `${escape(claim.how)}\n\n${lines.join('\n')}`;
}

function stringify(v: unknown): string {
  if (v == null) return String(v);
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
