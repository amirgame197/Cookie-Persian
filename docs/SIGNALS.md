# قرارداد شناسه سیگنال

هر کاوشگر (probe) اشیاء `Signal` منتشر میکند (رجوع به `src/types.ts`). ماژول های استنتاج آنها را با **شناسه دقیق** میخوانند. هر دو طرف مستقل نوشته شده اند، بنابراین این فایل قرارداد است. اگر کاوشگری نتواند چیزی را اندازه بگیرد، به سادگی سیگنال را حذف میکند (یا آن را با `error` تنظیم شده منتشر می کند) - استنتاج باید نبود هر شناسه ای را تحمل کند.

## پیاده سازی شده (`src/probes/core.ts`)

| id | معنا |
|---|---|
| `platform.ua` | رشته User-Agent |
| `platform.platform` | `navigator.platform` |
| `platform.languages` | آرایه `navigator.languages` |
| `platform.arch` / `platform.bitness` | معماری / بیتی UA-CH |
| `platform.model` | مدل دستگاه UA-CH (اندروید) |
| `platform.osVersion` | نسخه پلتفرم UA-CH |
| `platform.browserVersions` | فهرست نسخه کامل UA-CH |
| `platform.uadPlatform` | نام پلتفرم UA-CH |
| `platform.mobile` | بولی موبایل UA-CH |
| `platform.webdriver` | `navigator.webdriver` |
| `platform.dnt` / `platform.gpc` | عدم ردیابی / کنترل حریم خصوصی سراسری |
| `platform.pdfViewer` | `navigator.pdfViewerEnabled` |
| `display.resolution` | `[width, height]` |
| `display.available` | `[availWidth, availHeight]` |
| `display.pixelRatio` | `devicePixelRatio` |
| `display.colorDepth`, `display.viewport`, `display.orientation` | |
| `display.chromeHeight` / `display.chromeWidth` | screen منهای avail - اندازه حاشیه سیستم عامل |
| `display.refreshHz` | نرخ نوسازی اندازه گیری شده |
| `hw.cores` | `hardwareConcurrency` |
| `hw.memory` | `deviceMemory` (گیگابایت، دسته بندی شده) |
| `hw.touchPoints`, `hw.pointerCoarse`, `hw.hover` | |
| `hw.netType`, `hw.downlink`, `hw.rtt`, `hw.saveData` | Network Information API |
| `hw.cameras`, `hw.microphones`, `hw.speakers` | تعداد دستگاه ها (بدون اجازه) |
| `hw.deviceLabels` | آیا برچسب ها خوانا بودند |
| `hw.batteryLevel`, `hw.charging` | فقط کروم |
| `env.timezone`, `env.tzOffset`, `env.locale` | |
| `env.calendar`, `env.numbering`, `env.currency`, `env.localTime` | |
| `env.colorScheme`, `env.reducedMotion`, `env.reducedTransparency` | |
| `env.contrast`, `env.forcedColors`, `env.invertedColors` | |
| `env.monochrome`, `env.dynamicRange`, `env.colorGamut` | |
| `codecs.support` | نگاشت کدک به نتیجه canPlayType |
| `codecs.widevine`, `codecs.hash` | |
| `voices.count`, `voices.langs`, `voices.hash`, `voices.local` | صداهای سنتز گفتار |

## در دست پیاده سازی

### `src/probes/render.ts`
| id | معنا |
|---|---|
| `gpu.vendor` | `UNMASKED_VENDOR_WEBGL` در WebGL |
| `gpu.renderer` | `UNMASKED_RENDERER_WEBGL` در WebGL - رشته خام |
| `gpu.workerRenderer` | همان مقدار خوانده شده درون یک Worker (بررسی متقابل جعل) |
| `gpu.rendererMismatch` | بولی: نخ اصلی و Worker اختلاف دارند |
| `gpu.webgpuVendor`, `gpu.webgpuArch`, `gpu.webgpuDesc` | فیلدهای `GPUAdapterInfo` |
| `gpu.params` | نگاشت پارامترهای انتخابی WebGL (حداکثر اندازه بافت و غیره) |
| `gpu.extensions` | فهرست افزونه های پشتیبانی شده WebGL |
| `canvas.hash` | هش رندر بوم دوبعدی |
| `canvas.emojiHash` | هش رندر فقط ایموجی (سیگنال نسخه سیستم عامل) |
| `canvas.textMetrics` | `TextMetrics` برای رشته مرجع |
| `audio.hash` | هش OfflineAudioContext نوسان ساز + فشرده ساز |
| `audio.sampleRate` | |
| `domrect.hash` | هش هندسه `getBoundingClientRect` |

### `src/probes/fonts.ts`
| id | معنا |
|---|---|
| `fonts.list` | آرایه نام فونت های شناسایی شده |
| `fonts.count` | چند فونت شناسایی شد |
| `fonts.hash` | هش پایدار فهرست |
| `fonts.impliedOS` | `'windows' \| 'macos' \| 'linux' \| 'android' \| 'unknown'` |
| `fonts.impliedOSVersion` | مثلا `'Windows 11'` وقتی فونت مختص نسخه حاضر باشد |
| `fonts.software` | آرایه `{ name, fonts, confidence }` نرم افزار نصب شده استنباط شده |

### `src/probes/lies.ts`
| id | معنا |
|---|---|
| `lies.records` | آرایه `{ api, reason }` یافته های دستکاری |
| `lies.count` | مجموع |
| `lies.tamperedApis` | آرایه نام API هایی که بررسی های بومی را رد کردند |
| `lies.clientLitter` | متغیرهای سراسری window حاضر که یک iframe تودرتو تمیز فاقد آنها است |
| `lies.timerCoarsened` | دقت تایمر گرد شده است (Firefox RFP / Tor) |
| `lies.brave` | شناسایی Brave |
| `lies.braveMode` | `'standard' \| 'aggressive'` در صورت امکان تعیین |
| `lies.pluginInconsistency` | بررسی متقابل plugins/mimeTypes شکست خورد |
| `lies.uaPlatformMismatch` | پلتفرم ادعاشده توسط UA با پلتفرم استنباط شده از ویژگی ها ناسازگار است |
| `lies.featurePlatform` | پلتفرم استنباط شده توسط ماتریس ویژگی های JS |
| `lies.jsEngine` | `'v8' \| 'spidermonkey' \| 'javascriptcore'` از متن پیام خطا |

### `src/probes/localnet.ts` - سطح ۲
| id | معنا |
|---|---|
| `localnet.openPorts` | آرایه `{ port, service, ms }` که به عنوان در دسترس پاسخ دادند |
| `localnet.scanned` | چند پورت کاوش شد |
| `localnet.method` | کدام روش زمان بندی استفاده شد |
| `localnet.blocked` | true اگر مرورگر به کلی کاوش را مسدود کند |

### `src/probes/apps.ts` - سطح ۲
| id | معنا |
|---|---|
| `apps.installed` | آرایه نام برنامه های شناسایی شده از طریق کنترل کننده های پروتکل |
| `apps.probed` | آرایه طرح هایی که تلاش شد |
| `apps.reliable` | بولی - false جایی که مرورگر کاوش را محدود می کند |

### `src/probes/extensions.ts` - سطح ۲
| id | معنا |
|---|---|
| `ext.detected` | آرایه `{ name, id }` |
| `ext.adblock` | مسدودکننده تبلیغ حاضر |
| `ext.adblockName` | کدام یک، وقتی قابل تعیین باشد |

### `src/probes/incognito.ts`
| id | معنا |
|---|---|
| `incognito.private` | بولی |
| `incognito.method` | کدام اکتشافی تصمیم گرفت |
| `incognito.quota` | سهمیه `navigator.storage.estimate()` |

### `src/probes/automation.ts`
| id | معنا |
|---|---|
| `bot.headless` | بولی |
| `bot.score` | 0..1 |
| `bot.reasons` | آرایه رشته ها |
| `bot.vm` | ماشین مجازی شناسایی شده (از GPU renderer) |

### `src/probes/behavior.ts` - جریان ها در طول زمان
| id | معنا |
|---|---|
| `behavior.pointer` | `'mouse' \| 'trackpad' \| 'touch' \| 'none'` |
| `behavior.dwellMs` | زمان حضور در صفحه تاکنون |
| `behavior.scrollDepth` | 0..1 |
| `behavior.moveEntropy` | معیار لرزش مسیر اشاره گر |
| `behavior.idle` | آیا کاربر بیکار بوده است |

### Edge-injected (`edge.*`، تنظیم شده توسط `src/main.ts` از `/api/context`)
`edge.ip`, `edge.city`, `edge.region`, `edge.country`, `edge.postalCode`,
`edge.latitude`, `edge.longitude`, `edge.timezone`, `edge.asn`, `edge.asOrg`,
`edge.colo`, `edge.tlsVersion`, `edge.tlsCipher`, `edge.tlsHelloLength`,
`edge.httpProtocol`, `edge.acceptLanguage`, `edge.headerOrder`, `edge.clientHints`,
`edge.tcpRtt`

## قراردادهای ادعا

- دوم شخص، زمان حال، انگلیسی ساده. بدون اصطلاح فنی در `text`.
- تنها عبارت اسمی غافلگیر کننده را برای برجسته سازی در `*asterisks*` قرار دهید.
- `act` بخش را انتخاب می کند (رجوع به `src/ui/dossier.ts` `ACTS`).
- `weight` از ۰ تا ۱۰؛ وزن بالاتر دیرتر در همان پرده قرار می گیرد و ضرباهنگ طولانی تری می گیرد.
- `how` تکنیک را در یک یا دو جمله برای کاربر توضیح می دهد.
- هرگز یک ادعای `certain` را از سیگنال با درجه `guess` ارائه ندهید.

<br>
##### This section is translated by AI.