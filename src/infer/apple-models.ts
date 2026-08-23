/**
 * Physical render resolution -> Apple model. Keyed "WxH@dpr" on the RENDER
 * resolution (CSS points × devicePixelRatio), which is exactly what Safari
 * reports and what any page can read with zero permission.
 *
 * Deliberately Mac/iPad only. iPhones are left out on purpose: several models
 * share one panel, so the honest answer is a long "14 Pro / 15 / 15 Pro / 16"
 * list that reads as clutter, and Display Zoom shifts the reported size enough
 * to collide families anyway — so an iPhone just gets called "an iPhone". This
 * table also must only be consulted for an Apple user-agent (see deviceModel);
 * a non-Apple device whose screen happens to match a key would otherwise be
 * mislabeled, and plenty of Android panels land on these numbers.
 *
 * The earlier version lived in device.ts and was looked up with *logical* pixels
 * against *physical* keys, so it never matched anything. This resolver multiplies
 * by dpr first, which is the fix.
 */
export const APPLE_MODELS: Record<string, string> = {
  // --- Macs (native panel resolution; only matches at native/default 2× scaling) ---
  '2560x1664@2': 'یک مک بوک ایر (13-اینچ، مدلM)',
  '2880x1864@2': 'یک مک بوک ایر (15-اینچ، مدلM)',
  '2560x1600@2': 'یک مک بوک ایر (13-اینچ، مدلM)',
  '3024x1964@2': 'یک مک بوک پرو (14-اینچ)',
  '3456x2234@2': 'یک مک بوک پرو (16-اینچ)',
  '4480x2520@2': 'یک آی مک (24-اینچ، مدلM)',
  '5120x2880@2': 'یک نمایشگر 27-اینچ 5K (آی مک یا Studio Display)',

  // --- iPads (render resolution = CSS points × dpr) ---
  '1640x2360@2': 'یک آیپد (10 نسل) or آیپد ایر',
  '1668x2388@2': 'یک آیپد پرو (11-اینچ)',
  '2048x2732@2': 'یک آیپد پرو (12.9-اینچ)',
};

/** Resolve a model from logical screen pixels + devicePixelRatio, trying both
 *  orientations. Returns the label (already carrying its "a"/"an") or null.
 *  Callers MUST gate this on an Apple user-agent — the map has no such guard. */
export function resolveAppleModel(
  res: [number, number] | undefined,
  dpr: number | undefined,
): string | null {
  if (!res || !dpr) return null;
  const [w, h] = res;
  const d = Math.round(dpr);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  return APPLE_MODELS[`${pw}x${ph}@${d}`] ?? APPLE_MODELS[`${ph}x${pw}@${d}`] ?? null;
}
