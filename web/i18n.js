/* Miqyas -- English and Arabic, from one set of views.
 *
 * Egypt reads Arabic. The data here is Egyptian, the source is Egyptian, and
 * every word of the site around it was English. That is not a localisation
 * nicety, it is most of the audience.
 *
 * ---------- the mechanism ----------
 *
 * `t()` is keyed on the English string itself, not on an invented identifier.
 * Two reasons, and the second is the real one:
 *
 *   - the views build their markup by string concatenation, so a key like
 *     `home.hero.title` would replace readable prose with an opaque token in
 *     five thousand lines that are currently readable straight through;
 *   - a missing translation then falls back to correct English rather than to
 *     the word "home.hero.title", which is what a reader sees when a key is
 *     wrong and nobody noticed. On a site with 370 strings and one translator,
 *     failing soft in the right language matters more than tidiness.
 *
 * So: `t("Egypt's economy in numbers. Free.")` returns the Arabic under /ar/
 * and returns its own argument everywhere else. An untranslated string is
 * English on an Arabic page, which is visibly unfinished and harmless, rather
 * than broken.
 *
 * ---------- what is not translated ----------
 *
 * **Digits stay Western.** Egyptian financial media, CBE's own English-language
 * releases, and every bank statement in the country set figures in 0-9 rather
 * than ٠-٩. Arabic-Indic digits would also break `font-variant-numeric:
 * tabular-nums`, which is what keeps a column of rates aligned.
 *
 * **Charts stay left to right.** Time runs left to right in every chart anyone
 * reads, including in Arabic publications. Mirroring the axis would be a
 * localisation of the convention rather than of the language.
 *
 * **Series titles are CBE's.** Where CBE published an Arabic title it is used.
 * Where it did not -- which is every FX, price, policy rate and treasury bill
 * series, the ones on the front page -- the Arabic is ours, and the series page
 * says so rather than passing it off as the Bank's.
 */

const LANG = typeof MIQYAS_LANG === "string" ? MIQYAS_LANG : "en";
const RTL = LANG === "ar";

const AR = {
  /* ---------- chrome ---------- */
  "Unofficial": "غير رسمي",
  "Search": "بحث",
  "Menu": "القائمة",
  "Skip to content": "تخطَّ إلى المحتوى",
  "Overview": "نظرة عامة",
  "Work it out": "احسبها",
  "Series": "السلاسل",
  "Favourites": "المفضلة",
  "Rates": "أسعار الفائدة",
  "Documents": "الوثائق",
  "Data": "البيانات",
  "About": "عن الموقع",
  "Auto": "تلقائي",
  "Light": "فاتح",
  "Dark": "داكن",
  "Search series, topics, documents and pages": "ابحث في السلاسل والموضوعات والوثائق والصفحات",
  "Search series, topics, documents, pages…": "ابحث في السلاسل والموضوعات والوثائق والصفحات…",
  "↑ ↓ to move · return to open · esc to close": "↑ ↓ للتنقل · Enter للفتح · Esc للإغلاق",
  "Nothing matches that. Try a broader word.": "لا توجد نتائج. جرّب كلمة أعمّ.",
  "Switch between light, dark and system theme":
    "التبديل بين الوضع الفاتح والداكن وإعداد النظام",

  /* ---------- the freshness strip ----------
   * On every page, and the only route to the change log, so it is the one
   * piece of chrome that cannot be left in English. */
  "Miqyas: Egypt's economy in numbers": "مقياس: اقتصاد مصر بالأرقام",
  "Every series the Central Bank of Egypt publishes, cleaned, charted and free to download. Exchange rates since 2005, treasury auctions since 2004, inflation since 2000, every rate decision since June 2005.":
    "كل سلسلة ينشرها البنك المركزي المصري، منقّاة ومرسومة ومتاحة للتحميل مجانًا. أسعار الصرف منذ 2005، وعطاءات الخزانة منذ 2004، والتضخم منذ 2000، وكل قرار فائدة منذ يونيو 2005.",
  "Rebuilt": "أُعيد البناء",
  "Last rebuilt": "آخر إعادة بناء",
  "CBE last read": "آخر قراءة من البنك المركزي",
  "series": "سلسلة",
  "observations": "مشاهدة",
  "documents": "وثيقة",
  "the daily job may not have run": "ربما لم تُشغَّل المهمة اليومية",
  "restated by CBE": "عدّلها البنك المركزي",
  "numbers moved": "رقمًا تحرّك",
  "This is what it looks closest to.": "هذا أقرب ما يشبهه.",
  "The numbers this page needs did not arrive. Reloading usually fixes it. If it keeps happening, the rest of the site may still work: try the":
    "لم تصل الأرقام التي تحتاجها هذه الصفحة. غالبًا ما يحلّ التحديث المشكلة. وإن تكرّر الأمر فقد يعمل باقي الموقع: جرّب",
  "overview": "النظرة العامة",
  "Theme": "المظهر",
  "follows your system": "يتبع إعداد نظامك",

  /* ---------- footer ---------- */
  "Egypt's macroeconomic record, rebuilt from the Central Bank's own publications every morning.":
    "سجل الاقتصاد الكلي المصري، يُعاد بناؤه من منشورات البنك المركزي نفسها كل صباح.",
  "Work out what yours is worth": "احسب قيمة أموالك",
  "Find or browse series": "ابحث في السلاسل أو تصفّحها",
  "Your favourites": "مفضلتك",
  "Rate decisions": "قرارات أسعار الفائدة",
  "Downloads and API": "التنزيلات وواجهة البيانات",
  "This project": "عن المشروع",
  "What changed, and what CBE restated": "ما الذي تغيّر، وما الذي عدّله البنك المركزي",
  "What is and is not here": "ما هو موجود هنا وما هو غير موجود",
  "Source on GitHub ↗": "الكود على GitHub ↗",
  "The Central Bank of Egypt ↗": "البنك المركزي المصري ↗",
  "Not affiliated with, endorsed by, or connected to the Central Bank of Egypt.":
    "هذا الموقع غير تابع للبنك المركزي المصري ولا معتمد منه ولا مرتبط به.",
  "The CBE is the source of every number here. Any error in the cleaning is ours. For official figures go to":
    "البنك المركزي المصري هو مصدر كل رقم هنا. أي خطأ في المعالجة مسؤوليتنا. للأرقام الرسمية انتقل إلى",

  /* ---------- the overview ---------- */
  "Egypt's economy in numbers. Free.": "اقتصاد مصر بالأرقام. مجانًا.",
  "series from the Central Bank, cleaned, charted and searchable. Rebuilt every morning. No key, no account, no paywall.":
    "سلسلة من البنك المركزي، منقّاة ومرسومة وقابلة للبحث. يُعاد بناؤها كل صباح. بلا مفتاح ولا حساب ولا اشتراك.",
  "Starting with the one everybody asks about: the official dollar rate has moved":
    "ونبدأ بالسؤال الذي يطرحه الجميع: سعر الدولار الرسمي تحرّك",
  "since January 2005.": "منذ يناير 2005.",
  "EGP per US dollar, CBE selling rate": "جنيه مقابل الدولار، سعر بيع البنك المركزي",
  "Start here": "ابدأ من هنا",
  "Seven questions, already answered": "سبعة أسئلة، أُجيب عنها بالفعل",
  "Every number below is the latest CBE has published. Click one to see its whole history.":
    "كل رقم بالأسفل هو آخر ما نشره البنك المركزي. اضغط على أيٍّ منها لترى تاريخه كاملًا.",
  "At a glance": "نظرة سريعة",
  "Headline indicators": "المؤشرات الرئيسية",
  "Browse": "تصفّح",
  "Everything, by subject": "كل شيء، حسب الموضوع",
  "No search box required. Pick a subject and read down.":
    "لا حاجة لمربع بحث. اختر موضوعًا واقرأ من أعلى لأسفل.",
  "The name": "الاسم",
  "Cairo read the flood against a marble column": "القاهرة كانت تقرأ الفيضان على عمود من الرخام",
  "What is your salary actually worth?": "كم تساوي أموالك اليوم فعلًا؟",
  "See what changed →": "شاهد ما تغيّر ←",
  "Work it out →": "احسبها ←",
  "Try it →": "جرّبها ←",
  "Search the archive →": "ابحث في الأرشيف ←",
  "Downloads and API →": "التنزيلات وواجهة البيانات ←",
  "Open your favourites →": "افتح مفضلتك ←",

  /* ---------- the seven questions ---------- */
  "What is a dollar worth?": "بكم الدولار؟",
  "CBE's official selling rate, every business day since 2005.":
    "سعر البيع الرسمي للبنك المركزي، في كل يوم عمل منذ 2005.",
  "Where are interest rates?": "أين أسعار الفائدة؟",
  "The overnight deposit rate, the floor of the CBE corridor.":
    "سعر الإيداع لليلة واحدة، وهو أرضية كوريدور البنك المركزي.",
  "How fast are prices rising?": "بأي سرعة ترتفع الأسعار؟",
  "Headline consumer prices against the same month a year earlier.":
    "الأسعار الاستهلاكية العامة مقارنة بالشهر نفسه قبل عام.",
  "How big are the reserves?": "كم يبلغ الاحتياطي؟",
  "Net international reserves, read out of CBE's monthly press release.":
    "صافي الاحتياطي الأجنبي، مُستخرج من البيان الصحفي الشهري للبنك المركزي.",
  "What is the government paying to borrow?": "كم تدفع الحكومة لتقترض؟",
  "Weighted average yield at the 12-month treasury bill auction.":
    "متوسط العائد المرجح في عطاء أذون الخزانة لأجل 12 شهرًا.",
  "What are Egyptians abroad sending home?": "كم يرسل المصريون بالخارج؟",
  "Workers' remittances, cumulative across the fiscal year.":
    "تحويلات العاملين بالخارج، تراكميًا خلال السنة المالية.",
  "What did overnight money actually cost?": "كم كلّف المال ليلة واحدة فعلًا؟",
  "CONIA, the overnight fixing. Opens the money market page: where the pound funded inside the CBE corridor, the interbank tenors with their volumes, and the EGP bill curve with bid to cover.":
    "كونيا، تثبيتة الليلة الواحدة. تفتح صفحة سوق النقد: أين تموّل الجنيه داخل كوريدور البنك المركزي، وآجال ما بين البنوك بأحجامها، ومنحنى أذون الخزانة بالجنيه مع نسبة التغطية.",

  "Latest reading, the change since the one before it, and where that sits between the series' own record low and high.":
    "آخر قراءة، والتغيّر عن القراءة السابقة، وموقع ذلك بين أدنى وأعلى مستوى سجّلته السلسلة نفسها.",
  "Star any row to keep it on your desk: one screen of the numbers you read every morning, with no prose in the way.":
    "ضع نجمة على أي صف لتبقيه على مكتبك: شاشة واحدة بالأرقام التي تقرؤها كل صباح، بلا كلام يعترض الطريق.",
  "Thirteen topics over": "ثلاثة عشر موضوعًا تغطي",
  "series. No search box required. Pick a subject and read down.":
    "سلسلة. لا حاجة لمربع بحث. اختر موضوعًا واقرأ من أعلى لأسفل.",
  "The miqyas on Rhoda Island is a graduated shaft in a stone well, in service by 861 AD. The height the Nile reached against it forecast the harvest and set that year's tax rate: Egypt's first macroeconomic indicator, and the reason a graduated gauge runs through this site.":
    "مقياس النيل بجزيرة الروضة عمود مدرّج داخل بئر حجرية، دخل الخدمة قبل عام 861 ميلاديًا. الارتفاع الذي يبلغه النيل عليه كان يتنبأ بالمحصول ويحدّد ضريبة ذلك العام: أول مؤشر اقتصادي كلي في مصر، وسبب تكرار التدرّج المدرّج في هذا الموقع.",
  "The money market": "سوق النقد",
  "Overnight money inside the CBE corridor, the interbank tenors and their volumes, and the EGP bill curve with bid to cover.":
    "المال لليلة واحدة داخل كوريدور البنك المركزي، وآجال ما بين البنوك وأحجامها، ومنحنى أذون الخزانة بالجنيه مع نسبة التغطية.",
  "A made-up screen, not a CBE table": "شاشة من تجميعنا، لا جدول للبنك المركزي",
  "Take it with you": "خذها معك",
  "Parquet, SQLite, CSV, and a keyless API": "Parquet وSQLite وCSV وواجهة بلا مفتاح",
  "All": "كل",
  "series in whichever shape suits you, rebuilt every morning. No key, no account, no rate limit, and a SHA-256 for every file so a mirror can check itself.":
    "سلسلة بالشكل الذي يناسبك، يُعاد بناؤها كل صباح. بلا مفتاح ولا حساب ولا حدّ للاستخدام، ومع بصمة SHA-256 لكل ملف حتى تتحقق أي نسخة من نفسها.",
  "1,478 publications, read cover to cover": "1,478 منشورًا، مقروءة من الغلاف إلى الغلاف",
  "Every statistical bulletin, circular, annual report and press release CBE has put out as a PDF, 53,006 pages of it. Search inside the text and a result lands you on a page number, in English or Arabic.":
    "كل نشرة إحصائية ومنشور دوري وتقرير سنوي وبيان صحفي أصدره البنك المركزي بصيغة PDF، 53,006 صفحة. ابحث داخل النص لتصل النتيجة إلى رقم الصفحة، بالعربية أو الإنجليزية.",
  "The same numbers, asked in the second person. A salary from a year you remember, priced in today's money. Savings kept as pounds against the same money swapped for dollars on day one. The dollar rate on any date since 2005.":
    "الأرقام نفسها، مطروحة بصيغة المخاطب. راتب من عام تتذكره، مُقوَّم بنقود اليوم. مدخرات بقيت بالجنيه مقابل المال نفسه لو حُوِّل إلى دولار من اليوم الأول. وسعر الدولار في أي تاريخ منذ 2005.",
  "The Central Bank does not keep a changelog. This does.":
    "البنك المركزي لا يحتفظ بسجل للتغييرات. هذا الموقع يحتفظ.",
  "CBE overwrites its files in place when it revises a figure, so there is no way to ask what a number read last month. Every copy fetched here is kept, which makes this the only record of what was quietly restated. It began on 20 August 2026 and fills up from there.":
    "يستبدل البنك المركزي ملفاته عند تعديل أي رقم، فلا سبيل لمعرفة ماذا كان الرقم الشهر الماضي. كل نسخة جُلبت هنا محفوظة، وهو ما يجعل هذا السجل الوحيد لما عُدّل في صمت. بدأ في 20 أغسطس 2026 ويمتلئ من هناك.",

  /* ---------- the calculators ---------- */
  "Three questions about your own money": "ثلاثة أسئلة عن أموالك أنت",
  "What is your salary worth?": "كم تساوي راتبك اليوم؟",
  "What happened to your savings?": "ماذا حدث لمدخراتك؟",
  "What was a dollar worth that day?": "بكم كان الدولار في ذلك اليوم؟",
  "Monthly salary, in pounds": "الراتب الشهري بالجنيه",
  "Amount, in pounds": "المبلغ بالجنيه",
  "Which month": "أي شهر",
  "Set aside on": "ادُّخر بتاريخ",
  "Pick a date": "اختر تاريخًا",
  "Look it up": "ابحث عنه",
  "Copy a link to this answer": "انسخ رابط هذه الإجابة",
  "Link copied": "تم نسخ الرابط",
  /* The answers. Kept as short fragments joined around a figure, because an
     Arabic sentence cannot be assembled from an English one word for word and
     these are the sentences people screenshot. */
  "then is": "وقتها تساوي",
  "now": "الآن",
  "A salary of": "راتب قدره",
  "that never changed has lost": "لم يتغيّر قط فقد",
  "of what it could buy. To be worth what it was, it would have to be":
    "من قدرته الشرائية. ولكي يساوي ما كان يساويه، عليه أن يكون",
  "today.": "اليوم.",
  "what": "ما يشتريه",
  "from": "من",
  "buys, in the money of the day": "بنقود كل فترة",
  "The index runs from": "يمتد الرقم القياسي من",
  "kept as pounds now buys": "بقيت بالجنيه تشتري اليوم",
  "of": "من تسوّق",
  "shopping": "",
  "Prices have risen": "ارتفعت الأسعار",
  "since then, so the cash lost": "منذ ذلك الحين، فخسر المبلغ النقدي",
  "of what it could buy.": "من قدرته الشرائية.",
  "The same money swapped for dollars that day would be": "المال نفسه لو حُوِّل إلى دولار في ذلك اليوم لكان",
  "which is": "أي",
  "today, and buys": "اليوم، ويشتري",
  "of that same shopping.": "من التسوّق نفسه.",
  "What you did with it": "ماذا فعلت به",
  "Pounds today": "بالجنيه اليوم",
  "What it buys": "ما يشتريه",
  "Kept it as pounds": "أبقيته بالجنيه",
  "Swapped it for dollars on day one": "حوّلته إلى دولار من اليوم الأول",
  "A dollar costs": "الدولار يكلّف",
  "more today, at": "أكثر اليوم، عند",
  "Put the other way round,": "وبالعكس،",
  "was": "كانت",
  "then and is": "وقتها وهي الآن",
  "Any date from": "أي تاريخ من",
  "onwards.": "فصاعدًا.",
  "“What it buys” is in the money of": "“ما يشتريه” مُقوَّم بنقود",
  "so both rows can be compared with the number you started from. The dollar row is the CBE official selling rate on both dates and ignores what a bank would have charged you on either side of it.":
    "حتى يمكن مقارنة الصفّين بالرقم الذي بدأت منه. صفّ الدولار يستخدم سعر البيع الرسمي للبنك المركزي في التاريخين، ولا يحسب ما كان البنك سيتقاضاه منك في أي من الطرفين.",
  "Where these numbers come from, and where they are soft":
    "من أين تأتي هذه الأرقام، وأين تكون غير دقيقة",
  "On this day": "في مثل هذا اليوم",
  "The whole series": "السلسلة كاملة",

  "The same numbers as the rest of the site, asked in the second person. Nothing you type leaves your browser: the arithmetic happens on this page, and the only thing that travels is the link, which carries what you typed so you can send someone the answer rather than the form.":
    "الأرقام نفسها الموجودة في باقي الموقع، مطروحة بصيغة المخاطب. لا شيء مما تكتبه يغادر متصفحك: الحساب يجري على هذه الصفحة، والشيء الوحيد الذي ينتقل هو الرابط، وهو يحمل ما كتبته حتى ترسل لأحدهم الإجابة لا الاستمارة.",
  "Put in a salary and the month you were earning it. This prices the same number in today's money, using CBE's own inflation.":
    "أدخل الراتب والشهر الذي كنت تتقاضاه فيه. هذه الأداة تُقوّم الرقم نفسه بنقود اليوم، باستخدام تضخم البنك المركزي نفسه.",
  "Put in an amount and the day you set it aside. This says what it still buys, and what the same money would have been worth had you swapped it for dollars that day and done nothing else.":
    "أدخل مبلغًا واليوم الذي ادّخرته فيه. هذه الأداة تقول ماذا يشتري اليوم، وكم كان سيساوي المال نفسه لو حوّلته إلى دولار في ذلك اليوم ولم تفعل شيئًا آخر.",
  "A birthday, a wedding, the day you started a job. CBE has published an official rate every business day since January 2005.":
    "عيد ميلاد، أو زفاف، أو يوم بدأت فيه عملًا. ينشر البنك المركزي سعرًا رسميًا كل يوم عمل منذ يناير 2005.",
  "A salary that has not changed since a year you remember, priced in today's money.":
    "راتب لم يتغيّر منذ عام تتذكره، مُقوَّمًا بنقود اليوم.",
  "Pounds kept as pounds against the same pounds swapped for dollars on day one.":
    "جنيهات بقيت جنيهات، مقابل الجنيهات نفسها لو حُوِّلت إلى دولار من اليوم الأول.",
  "The CBE rate on any date since 2005, and on the same date in every year since.":
    "سعر البنك المركزي في أي تاريخ منذ 2005، وفي التاريخ نفسه من كل عام منذ ذلك الحين.",

  /* ---------- rate decisions ---------- */
  "Next rate decision": "قرار الفائدة القادم",
  "Latest rate decision": "آخر قرار للفائدة",
  "Monetary Policy Committee": "لجنة السياسة النقدية",
  "Every rate decision since June 2005": "كل قرارات الفائدة منذ يونيو 2005",
  "Eight meetings a year, on dates the Central Bank publishes in advance. What do you think they will do?":
    "ثماني اجتماعات في العام، بمواعيد يعلنها البنك المركزي مسبقًا. برأيك ماذا سيقرّرون؟",
  "Cut": "خفض",
  "Hold": "تثبيت",
  "Raise": "رفع",
  "Held": "ثبّتت",
  "Raised": "رفعت",
  "Nothing called yet.": "لم تتوقّع بعد.",
  "Meeting": "الاجتماع",
  "You said": "توقّعك",
  "They did": "القرار",
  "Kept in this browser and nowhere else. There is no server behind this site to send it to.":
    "محفوظ في هذا المتصفح فقط. لا يوجد خادم خلف هذا الموقع لإرساله إليه.",
  "Call the next one →": "توقّع القرار القادم ←",
  "today": "اليوم",
  "tomorrow": "غدًا",

  /* ---------- what changed ---------- */
  "What changed": "ما الذي تغيّر",
  "The revision record": "سجل التعديلات",
  "What CBE published, and what it quietly restated":
    "ما نشره البنك المركزي، وما عدّله في صمت",
  "readings published": "قراءة منشورة",
  "figures CBE restated": "رقمًا عدّله البنك المركزي",
  "after first publishing them": "بعد نشرها أول مرة",
  "same-day conflicts": "تعارضات في اليوم نفسه",
  "two values for one date": "قيمتان لتاريخ واحد",
  "The Central Bank overwrites its files when it revises a figure. There is no changelog and no way to ask what a number read last month. This site keeps every copy it has ever fetched, so its own history answers that question, and nothing else does.":
    "يستبدل البنك المركزي ملفاته عند تعديل أي رقم. لا سجل للتغييرات ولا وسيلة لمعرفة ماذا كان الرقم الشهر الماضي. هذا الموقع يحتفظ بكل نسخة جلبها، فيجيب تاريخه هو عن هذا السؤال، ولا يجيب عنه شيء آخر.",
  "These do not need a history to find: the same figure appears twice, differently, inside one of CBE's own files. The parser keeps one and records both.":
    "هذه لا تحتاج تاريخًا لاكتشافها: الرقم نفسه يظهر مرتين، مختلفًا، داخل ملف واحد من ملفات البنك المركزي. المعالج يحتفظ بواحد ويسجّل كليهما.",
  "since": "منذ",
  "Caught in the act": "بالدليل",
  "Where CBE published two different values for one date":
    "حيث نشر البنك المركزي قيمتين مختلفتين لتاريخ واحد",
  "Day by day": "يومًا بيوم",
  "For": "عن",
  "Kept": "المحفوظة",
  "Discarded": "المستبعدة",

  /* ---------- the workhorse table ---------- */
  "Latest": "الأحدث",
  "Change": "التغيّر",
  "Lowest": "الأدنى",
  "Highest": "الأعلى",
  "Where it sits": "موقعه في المدى",
  "As of": "حتى",
  "Period": "الفترة",
  "Series|one row of a table": "السلسلة",
  "flat": "بلا تغيّر",
  "Policy rates": "أسعار السياسة النقدية",
  "Prices": "الأسعار",
  "External": "القطاع الخارجي",
  "Treasury bills": "أذون الخزانة",
  "Money market": "سوق النقد",

  /* ---------- frequency and change labels ---------- */
  "Daily": "يومي",
  "Weekly": "أسبوعي",
  "Every two weeks": "كل أسبوعين",
  "Monthly": "شهري",
  "Quarterly": "ربع سنوي",
  "Yearly": "سنوي",
  "Only when it changes": "عند التغيّر فقط",
  "on the day": "خلال اليوم",
  "on the week": "خلال الأسبوع",
  "on the month": "خلال الشهر",
  "on the quarter": "خلال الربع",
  "on the year": "خلال العام",
  "since it moved": "منذ آخر تحرّك",

  /* ---------- the thirteen subjects ----------
   * The labels a reader picks a direction from, so the most load-bearing
   * prose on the site after the hero. */
  "Foreign exchange": "الصرف الأجنبي",
  "Official, market and interbank exchange rates, against the dollar and twelve other currencies.":
    "أسعار الصرف الرسمية والسوقية وبين البنوك، مقابل الدولار واثنتي عشرة عملة أخرى.",
  "Interest rates": "أسعار الفائدة",
  "The CBE corridor, overnight money, and what treasury bills pay at auction.":
    "كوريدور البنك المركزي، وسوق ما بين البنوك ليوم واحد، وعائد أذون الخزانة في العطاءات.",
  "Inflation": "التضخم",
  "Headline and core inflation, the basket underneath them, and producer prices.":
    "التضخم العام والأساسي، ومكوّنات السلة تحتهما، وأسعار المنتجين.",
  "Reserves and remittances": "الاحتياطي والتحويلات",
  "Two headline numbers, read out of CBE's monthly press release rather than published as a table: net international reserves, and what Egyptians abroad send home.":
    "رقمان رئيسيان يُستخرجان من البيان الصحفي الشهري للبنك المركزي لا من جدول منشور: صافي الاحتياطي الأجنبي، وما يرسله المصريون بالخارج.",
  "Balance of payments": "ميزان المدفوعات",
  "The current account, trade in goods and services, and how the gap is financed.":
    "الحساب الجاري، وتجارة السلع والخدمات، وكيف تُموَّل الفجوة.",
  "Foreign trade": "التجارة الخارجية",
  "Exports and imports, by commodity and by trading partner.":
    "الصادرات والواردات، حسب السلعة وحسب الشريك التجاري.",
  "Debt": "الدين",
  "Domestic and external debt, by holder, by instrument and by maturity.":
    "الدين المحلي والخارجي، حسب الحائز والأداة وأجل الاستحقاق.",
  "The state budget": "الموازنة العامة",
  "Revenue, spending, the deficit, and where the financing comes from.":
    "الإيرادات والمصروفات والعجز، ومن أين يأتي التمويل.",
  "Growth and investment": "النمو والاستثمار",
  "GDP by sector at current and constant prices, and investment by sector.":
    "الناتج المحلي الإجمالي حسب القطاع بالأسعار الجارية والثابتة، والاستثمار حسب القطاع.",
  "Banks": "البنوك",
  "Deposits, lending, the banking survey, and the payment systems CBE runs.":
    "الودائع والائتمان، والمسح المصرفي، ونظم الدفع التي يديرها البنك المركزي.",
  "The stock market": "البورصة",
  "EGX indicators, turnover, and who is doing the buying.":
    "مؤشرات البورصة المصرية، وحجم التداول، ومن يشتري.",
  "Foreign investment": "الاستثمار الأجنبي",
  "Net foreign direct investment, by source country and by sector.":
    "صافي الاستثمار الأجنبي المباشر، حسب بلد المصدر وحسب القطاع.",
  "Tourism": "السياحة",
  "Arrivals and nights, by nationality and by region.":
    "أعداد الوافدين والليالي السياحية، حسب الجنسية وحسب المنطقة.",

  /* ---------- time and change, in running text ---------- */
  "on two weeks": "خلال أسبوعين",
  "on the previous reading": "مقارنة بالقراءة السابقة",
  "days ago": "يومًا مضت",
  "weeks ago": "أسبوعًا مضت",
  "months ago": "شهرًا مضت",
  "years ago": "سنوات مضت",
  "in": "بعد",
  "days": "يومًا",
  "weeks": "أسبوعًا",
  "months": "شهرًا",

  /* ---------- the series page ---------- */
  "As published": "كما نُشرت",
  "Change on a year earlier": "التغيّر عن العام السابق",
  "Rebased, first reading = 100": "معادة الأساس، أول قراءة = 100",
  "Translated by Miqyas. CBE publishes no Arabic name for this series.":
    "ترجمة مقياس. البنك المركزي لا ينشر اسمًا عربيًا لهذه السلسلة.",
  "In your favourites": "في مفضلتك",
  "Add to your favourites": "أضف إلى مفضلتك",
  "Remove from favourites": "أزل من المفضلة",
  "Add to favourites": "أضف إلى المفضلة",
  "Today's reading is": "قراءة اليوم",
  "the median.": "ضعف الوسيط.",
  "above the median.": "أعلى من الوسيط.",
  "below the median.": "أدنى من الوسيط.",
  "1 year": "سنة",
  "5 years": "5 سنوات",
  "10 years": "10 سنوات",
  "Everything": "كل الفترة",
  "This year": "هذا العام",
  "Since the 2016 float": "منذ تعويم 2016",
  "Since March 2024": "منذ مارس 2024",

  /* ---------- the pre-rendered pages ----------
   * Read by prerender.py as well as by the front end. These are the titles and
   * descriptions a search result shows and a crawler indexes, so they are the
   * first Arabic anybody sees. */
  "Source: Central Bank of Egypt. Republished by Miqyas, an unofficial mirror, which is not affiliated with, endorsed by, or connected to the Central Bank of Egypt.":
    "المصدر: البنك المركزي المصري. أعاد نشرها مقياس، وهو مرآة غير رسمية غير تابعة للبنك المركزي المصري ولا معتمدة منه ولا مرتبطة به.",
  "on": "في",
  "to": "إلى",
  "readings back to": "قراءة تعود إلى",
  "series from Egypt's central bank": "سلسلة من البنك المركزي المصري",
  "series, rebuilt every morning.": "سلسلة، يُعاد بناؤها كل صباح.",
  "pages from the Central Bank of Egypt": "صفحة من البنك المركزي المصري",
  "Previous": "السابقة",
  "Unit": "الوحدة",
  "not stated by CBE": "لم يذكرها البنك المركزي",
  "Readings": "عدد القراءات",
  "Coverage": "الفترة المغطاة",

  "Find or browse 1,317 Egyptian economic series | Miqyas":
    "ابحث أو تصفّح 1,317 سلسلة اقتصادية مصرية | مقياس",
  "Every series the Central Bank of Egypt publishes, in thirteen subjects, searchable in English and Arabic.":
    "كل سلسلة ينشرها البنك المركزي المصري، في ثلاثة عشر موضوعًا، قابلة للبحث بالعربية والإنجليزية.",
  "Your favourites | Miqyas": "مفضلتك | مقياس",
  "One screen of the numbers you read every morning, with no prose in the way.":
    "شاشة واحدة تضم الأرقام التي تقرؤها كل صباح، بلا كلام يعترض الطريق.",
  "Every CBE rate decision since 2005 | Miqyas":
    "كل قرارات الفائدة للبنك المركزي منذ 2005 | مقياس",
  "172 Monetary Policy Committee decisions back to June 2005, with the corridor and what changed in the wording each time.":
    "172 قرارًا للجنة السياسة النقدية تعود إلى يونيو 2005، مع الكوريدور وما تغيّر في الصياغة كل مرة.",
  "Egyptian inflation calculator: what is your money worth? | Miqyas":
    "حاسبة التضخم في مصر: كم تساوي أموالك؟ | مقياس",
  "Three calculators on the Central Bank's own numbers: what a salary from any month is worth today, what savings kept as pounds still buy, and the dollar rate on any date since 2005.":
    "ثلاث حاسبات تعمل على أرقام البنك المركزي نفسها: كم يساوي راتب من أي شهر اليوم، وماذا تشتري مدخرات بقيت بالجنيه، وسعر الدولار في أي تاريخ منذ 2005.",
  "What is your Egyptian salary worth today? | Miqyas":
    "كم يساوي راتبك في مصر اليوم؟ | مقياس",
  "A salary from any month since 2005, priced in today's money using the Central Bank's own inflation. Free, and the answer is a link you can send.":
    "راتب من أي شهر منذ 2005، مُقوَّم بنقود اليوم باستخدام تضخم البنك المركزي نفسه. مجانًا، والإجابة رابط يمكنك إرساله.",
  "What happened to your Egyptian pound savings? | Miqyas":
    "ماذا حدث لمدخراتك بالجنيه المصري؟ | مقياس",
  "What pounds set aside on any date since 2005 still buy, against what the same money would be worth had it been swapped for dollars that day.":
    "ماذا تشتري اليوم جنيهات ادُّخرت في أي تاريخ منذ 2005، مقابل ما كانت ستساويه لو حُوِّلت إلى دولار في ذلك اليوم.",
  "What was the dollar worth in Egypt on any date? | Miqyas":
    "بكم كان الدولار في مصر في أي تاريخ؟ | مقياس",
  "The Central Bank's official EGP/USD rate on any date since January 2005, and on the same calendar day in every year since.":
    "سعر الدولار الرسمي لدى البنك المركزي في أي تاريخ منذ يناير 2005، وفي اليوم نفسه من كل عام منذ ذلك الحين.",
  "What the Central Bank of Egypt quietly restated | Miqyas":
    "ما عدّله البنك المركزي المصري في صمت | مقياس",
  "CBE overwrites its files when it revises a figure, with no changelog. This keeps every copy, so it can say what a number read last month and what was changed after publication.":
    "يستبدل البنك المركزي ملفاته عند تعديل أي رقم، بلا سجل للتغييرات. هذا الموقع يحتفظ بكل نسخة، فيستطيع أن يقول ماذا كان الرقم الشهر الماضي وما الذي تغيّر بعد النشر.",
  "Search 1,478 Central Bank of Egypt publications | Miqyas":
    "ابحث في 1,478 منشورًا للبنك المركزي المصري | مقياس",
  "Every statistical bulletin, circular, annual report and press release CBE has put out as a PDF, 53,006 pages of it, searchable in English and Arabic.":
    "كل نشرة إحصائية ومنشور دوري وتقرير سنوي وبيان صحفي أصدره البنك المركزي بصيغة PDF، 53,006 صفحة، قابلة للبحث بالعربية والإنجليزية.",
  "Egypt's money market: the corridor, the tenors, the bill curve | Miqyas":
    "سوق النقد المصري: الكوريدور والآجال ومنحنى الأذون | مقياس",
  "Where the pound funded inside the CBE corridor, the interbank tenors with their volumes, and the EGP bill curve with bid to cover.":
    "أين تموّل الجنيه داخل كوريدور البنك المركزي، وآجال ما بين البنوك بأحجامها، ومنحنى أذون الخزانة بالجنيه مع نسبة التغطية.",
  "Download Egypt's macroeconomic data: Parquet, SQLite, CSV and a keyless API | Miqyas":
    "حمّل بيانات الاقتصاد الكلي المصري: Parquet وSQLite وCSV وواجهة بلا مفتاح | مقياس",
  "All 1,317 series in whichever shape suits you, rebuilt every morning. No key, no account, no rate limit.":
    "كل السلاسل الـ1,317 بالشكل الذي يناسبك، يُعاد بناؤها كل صباح. بلا مفتاح ولا حساب ولا حدّ للاستخدام.",
  "About Miqyas: an unofficial mirror of Egypt's central bank data":
    "عن مقياس: مرآة غير رسمية لبيانات البنك المركزي المصري",
  "What is here, what is not, and how it is built. Miqyas is not affiliated with the Central Bank of Egypt.":
    "ما هو موجود وما هو غير موجود، وكيف بُني هذا الموقع. مقياس غير تابع للبنك المركزي المصري.",

  /* ---------- error and empty states ---------- */
  "Nothing lives at that address": "لا يوجد شيء على هذا العنوان",
  "The link may be from an older version of the site.":
    "قد يكون الرابط من نسخة أقدم من الموقع.",
  "Start over": "ابدأ من جديد",
  "There is no series with that id": "لا توجد سلسلة بهذا المعرّف",
  "Could not load the data": "تعذّر تحميل البيانات",
  "Try again": "أعد المحاولة",
};

/* The translation, or the English it was given. A missing entry is English on
 * an Arabic page: visibly unfinished, never broken.
 *
 * A key may carry a disambiguator after a pipe, because keying on the source
 * means two different senses of one English word collide. "Series" is the
 * navigation item for all 1,318 of them and also the column header naming one
 * of them, and Arabic does not use the same word for both: السلاسل against
 * السلسلة. `t("Series|one row of a table")` keeps them apart and still falls
 * back to "Series" when there is no Arabic for it.
 */
function t(english) {
  const cut = english.indexOf("|");
  if (!RTL) return cut < 0 ? english : english.slice(0, cut);
  if (Object.prototype.hasOwnProperty.call(AR, english)) return AR[english];
  return cut < 0 ? english : english.slice(0, cut);
}

/* Months, because a date is the one piece of formatting that cannot survive
 * being left in English on an Arabic page. Egyptian Arabic uses the Levantine
 * month names in official and financial writing, which is what CBE itself
 * prints. Digits stay Western, as everywhere else here. */
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
                   "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/* The arrow in a "go" link points the way the reader is going. */
const ARROW = RTL ? "←" : "→";

/* Set before anything renders, so the first paint is already the right way
 * round. The pre-rendered Arabic documents also carry these on <html>, so a
 * reader who arrives at one never sees a left-to-right flash first. */
if (RTL) {
  document.documentElement.setAttribute("lang", "ar");
  document.documentElement.setAttribute("dir", "rtl");
}
