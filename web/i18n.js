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
  "Independent": "مستقل",
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
  "Central Bank of Egypt statistics as one clean dataset: exchange rates, treasury auctions, inflation, policy rates and the CBE Excel archive, with a free API, bulk files and a daily record of changes. Independent; not affiliated with CBE.":
    "إحصاءات البنك المركزي المصري في مجموعة بيانات واحدة منظمة: أسعار الصرف وعطاءات الخزانة والتضخم وأسعار الفائدة وأرشيف ملفات Excel، مع واجهة مجانية وملفات تحميل وسجل يومي للتغييرات. موقع مستقل غير تابع للبنك المركزي.",
  "Rebuilt": "أُعيد البناء",
  "Last rebuilt": "آخر إعادة بناء",
  "CBE last read": "آخر قراءة من البنك المركزي",
  "series": "سلسلة",
  "observations": "مشاهدة",
  "documents": "وثيقة",
  "the daily job may not have run": "ربما لم تُشغَّل المهمة اليومية",
  "new readings": "قراءة جديدة",
  "revisions": "تعديلات",
  "revision": "تعديل",
  "This is what it looks closest to.": "هذا أقرب ما يشبهه.",
  "The numbers this page needs did not arrive. Reloading usually fixes it. If it keeps happening, the rest of the site may still work: try the":
    "لم تصل الأرقام التي تحتاجها هذه الصفحة. غالبًا ما يحلّ التحديث المشكلة. وإن تكرّر الأمر فقد يعمل باقي الموقع: جرّب",
  "overview": "النظرة العامة",
  "Theme": "المظهر",
  "follows your system": "يتبع إعداد نظامك",

  /* ---------- footer ---------- */
  "Egypt's macroeconomic record from the Central Bank's own publications, updated daily.":
    "سجل الاقتصاد الكلي المصري من منشورات البنك المركزي نفسها، يُحدَّث يوميًا.",
  "Work out what yours is worth": "احسب قيمة أموالك",
  "Find or browse series": "ابحث في السلاسل أو تصفّحها",
  "Your favourites": "مفضلتك",
  "Rate decisions": "قرارات أسعار الفائدة",
  "Downloads and API": "التنزيلات وواجهة البيانات",
  "This project": "عن المشروع",
  "Revisions to published figures": "التعديلات على الأرقام المنشورة",
  "What is and is not here": "ما هو موجود هنا وما هو غير موجود",
  "What is and is not here →": "ما هو موجود هنا وما هو غير موجود ←",
  "Source on GitHub ↗": "الكود على GitHub ↗",
  "The Central Bank of Egypt ↗": "البنك المركزي المصري ↗",
  "Independent project. Not affiliated with, endorsed by, or connected to the Central Bank of Egypt. Official figures:":
    "مشروع مستقل. غير تابع للبنك المركزي المصري ولا معتمد منه ولا مرتبط به. للأرقام الرسمية:",
  "Not affiliated with, endorsed by, or connected to the Central Bank of Egypt.":
    "هذا الموقع غير تابع للبنك المركزي المصري ولا معتمد منه ولا مرتبط به.",
  "The CBE is the source of every number here. Any error in the cleaning is ours. For official figures go to":
    "البنك المركزي المصري هو مصدر كل رقم هنا. أي خطأ في المعالجة مسؤوليتنا. للأرقام الرسمية انتقل إلى",
  /* The removal line, in three pieces around its link. */
  "If anything here should not be,": "إن كان هناك ما لا ينبغي أن يكون هنا،",
  "contact me": "فراسلني",
  "and it will be removed.": "وسيُزال.",

  /* ---------- the overview ---------- */
  "Egypt's economy in numbers. Free.": "اقتصاد مصر بالأرقام. مجانًا.",
  "Central Bank of Egypt statistics as one clean dataset, with a dated daily archive of its live tables.":
    "إحصاءات البنك المركزي المصري في مجموعة بيانات واحدة منظمة، مع أرشيف يومي مؤرَّخ لجداوله الحية.",
  "Download the data": "حمّل البيانات",
  "See what changed": "شاهد ما تغيّر",
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
  "What is your salary actually worth?": "كم يساوي راتبك فعلًا؟",
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
  "Star any row to keep it on your desk: one screen of the numbers you check most, with no prose in the way.":
    "ضع نجمة على أي صف لتبقيه على مكتبك: شاشة واحدة بالأرقام التي تتابعها أكثر من غيرها، بلا كلام يعترض الطريق.",
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
  "series in whichever shape suits you, updated daily. No key and no account, and a SHA-256 for every file so any copy can be checked against it.":
    "سلسلة بالشكل الذي يناسبك، تُحدَّث يوميًا. بلا مفتاح ولا حساب، ومع بصمة SHA-256 لكل ملف حتى يمكن مطابقة أي نسخة بها.",
  "CBE publications, indexed for search": "منشورات البنك المركزي، مفهرسة للبحث",
  "Statistical bulletins, circulars, annual reports and press releases CBE has published as PDFs, indexed so you can search inside them. A result lands you on a page number, in English or Arabic, and links to the original on cbe.org.eg.":
    "نشرات إحصائية ومنشورات دورية وتقارير سنوية وبيانات صحفية أصدرها البنك المركزي بصيغة PDF، مفهرسة لتبحث داخلها. تصل النتيجة إلى رقم الصفحة، بالعربية أو الإنجليزية، وترتبط بالأصل على موقع البنك المركزي.",
  "The same numbers, asked in the second person. A salary from a year you remember, priced in today's money. Savings kept as pounds against the same money swapped for dollars on day one. The dollar rate on any date since 2005.":
    "الأرقام نفسها، مطروحة بصيغة المخاطب. راتب من عام تتذكره، مُقوَّم بنقود اليوم. مدخرات بقيت بالجنيه مقابل المال نفسه لو حُوِّل إلى دولار من اليوم الأول. وسعر الدولار في أي تاريخ منذ 2005.",
  "A dated record of what CBE published": "سجل مؤرَّخ لما نشره البنك المركزي",
  "Miqyas keeps a dated copy of the daily tables from 20 August 2026. If CBE changes a figure it has already published, the change appears on the What changed page, which also counts the revisions recorded so far. The weekly Excel archive is not yet checked for changes.":
    "يحتفظ مقياس بنسخة مؤرَّخة من الجداول اليومية منذ 20 أغسطس 2026. إذا غيّر البنك المركزي رقمًا سبق نشره فسيظهر التغيير في صفحة «ما الذي تغيّر»، التي تعرض أيضًا عدد التعديلات المرصودة حتى الآن. ولا يُفحص أرشيف Excel الأسبوعي بحثًا عن تغييرات بعد.",

  /* ---------- the calculators ---------- */
  "Three questions about your own money": "ثلاثة أسئلة عن أموالك أنت",
  "What is your salary worth?": "كم يساوي راتبك اليوم؟",
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
  "buys, in the money of the day": "مقوَّمًا بنقود ذلك اليوم",
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
  "was": "كانت تساوي",
  "then and is": "وقتها، وأصبحت تساوي",
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
  "The committee meets eight times a year, on dates the Central Bank publishes in advance.":
    "تجتمع اللجنة ثماني مرات في العام، في مواعيد يعلنها البنك المركزي مسبقًا.",
  "Cut": "خفض",
  "Held": "ثبّتت",
  "Raised": "رفعت",
  "today": "اليوم",
  "tomorrow": "غدًا",

  /* ---------- what changed ---------- */
  "What changed": "ما الذي تغيّر",
  "The revision record": "سجل التعديلات",
  "What CBE published, and what was revised":
    "ما نشره البنك المركزي، وما جرى تعديله",
  "Miqyas keeps a dated copy of the daily tables from 20 August 2026. If CBE changes a figure it has already published, the change appears here.":
    "يحتفظ مقياس بنسخة مؤرَّخة من الجداول اليومية منذ 20 أغسطس 2026. إذا غيّر البنك المركزي رقمًا سبق نشره فسيظهر التغيير هنا.",
  "new readings": "قراءة جديدة",
  "figures revised": "رقمًا جرى تعديله",
  "after first publishing them": "بعد نشرها أول مرة",
  "Two values for one date": "قيمتان لتاريخ واحد",
  "inside one CBE table": "داخل جدول واحد للبنك المركزي",
  "No revisions recorded since {d}.": "لم يُسجَّل أي تعديل منذ {d}.",
  "Each is a figure CBE published and later changed.":
    "كلٌّ منها رقم نشره البنك المركزي ثم غيّره لاحقًا.",
  "Daily feed": "الخلاصة اليومية",
  "Revisions only": "التعديلات فقط",
  ", low volume.": "، قليلة التحديث.",
  "What is checked": "ما الذي يُفحص",
  "Which sources are checked for revisions": "أي المصادر تُفحص بحثًا عن تعديلات",
  "Daily tables": "الجداول اليومية",
  "Exchange rates, interest rates, CONIA, inflation and T-bill yields. Read every day; a changed or withdrawn figure counts as a revision.":
    "أسعار الصرف وأسعار الفائدة وكونيا والتضخم وعوائد أذون الخزانة. تُقرأ كل يوم، وأي رقم تغيّر أو سُحب يُحتسب تعديلًا.",
  "Auction results": "نتائج المزادات",
  "The auction tables. Read every day; a changed or withdrawn result counts as a revision.":
    "جداول المزادات. تُقرأ كل يوم، وأي نتيجة تغيّرت أو سُحبت تُحتسب تعديلًا.",
  "Excel archive": "أرشيف Excel",
  "Read weekly and checked for files CBE replaced or withdrew. A figure that changes in a replaced file counts as a revision.":
    "يُقرأ أسبوعيًا ويُفحص بحثًا عن ملفات استبدلها البنك المركزي أو سحبها. أي رقم يتغيّر في ملف مُستبدَل يُحتسب تعديلًا.",
  "Read weekly and checked for files CBE replaced or withdrew. Changes are listed as archive updates and not yet counted as revisions.":
    "يُقرأ أسبوعيًا ويُفحص بحثًا عن ملفات استبدلها البنك المركزي أو سحبها. تُدرج التغييرات تحديثاتٍ للأرشيف ولا تُحتسب تعديلات بعد.",
  "Read weekly. Not yet checked for changes: new readings are listed as archive updates.":
    "يُقرأ أسبوعيًا. لا يُفحص بحثًا عن تغييرات بعد، وتُدرج القراءات الجديدة تحديثاتٍ للأرشيف.",
  "Not counted": "لا تُحتسب",
  "The series Miqyas computes or parses from press releases, such as reserves, remittances and the yield curve. They move when their sources move.":
    "السلاسل التي يحسبها مقياس أو يستخرجها من البيانات الصحفية، مثل الاحتياطيات والتحويلات ومنحنى العائد. تتحرك حين تتحرك مصادرها.",
  "Every value Miqyas has held, with the first and last day it was held:":
    "كل قيمة احتفظ بها مقياس، مع أول يوم وآخر يوم احتفظ بها فيه:",
  "the revisions table in miqyas.sqlite": "جدول revisions في miqyas.sqlite",
  "since": "منذ",
  "Where CBE published two different values for one date":
    "حيث نشر البنك المركزي قيمتين مختلفتين لتاريخ واحد",
  "These do not need a history to find: the same figure appears twice, differently, inside one of CBE's own tables. Miqyas keeps one, the same one every day, and records both.":
    "هذه لا تحتاج تاريخًا لاكتشافها: الرقم نفسه يظهر مرتين، مختلفًا، داخل جدول واحد من جداول البنك المركزي. يحتفظ مقياس بواحد، هو نفسه كل يوم، ويسجّل كليهما.",
  "Day by day": "يومًا بيوم",
  "{n} days on the record": "{n} يومًا في السجل",
  "The tables are read once a day and any change is saved. Days with no change are not listed.":
    "تُقرأ الجداول مرة كل يوم ويُحفظ أي تغيير. الأيام التي لم يتغيّر فيها شيء لا تظهر هنا.",
  "How this is built": "كيف بُني هذا",
  "Read out of the git history, with each change put down to CBE or to Miqyas":
    "مقروء من سجل git، وكل تغيير منسوب إلى البنك المركزي أو إلى مقياس",
  "A change counts as a CBE revision only when the file CBE served changed: a different value for the same date, in the same table, than the one Miqyas saved before. When Miqyas reads the same files differently, after a parser fix or a new way of dating a quarter, the change is listed as re-read by Miqyas. Series Miqyas computes are never counted as revisions. More than 500 changes in one go are held back for a check rather than reported.":
    "لا يُحتسب التغيير تعديلًا من البنك المركزي إلا إذا تغيّر الملف الذي قدّمه البنك: قيمة مختلفة للتاريخ نفسه، في الجدول نفسه، عن تلك التي حفظها مقياس من قبل. وحين يقرأ مقياس الملفات نفسها قراءة مختلفة، بعد إصلاح في المعالج أو طريقة جديدة لتأريخ ربع السنة، يُدرج التغيير على أنه إعادة قراءة من مقياس. ولا تُحتسب السلاسل التي يحسبها مقياس تعديلات أبدًا. وأكثر من 500 تغيير دفعة واحدة تُحجز للمراجعة بدل نشرها.",
  "{n} commits of history.": "عدد الإيداعات في السجل: {n}.",
  "Up to {n} new readings shown per day, biggest move against each series' usual level first; the totals count all of them.":
    "تُعرض حتى {n} قراءة جديدة في اليوم، الأكبر تحركًا قياسًا إلى المستوى المعتاد لكل سلسلة أولًا، والمجاميع تشمل الجميع.",
  "The change log has not been built yet": "لم يُبنَ سجل التغييرات بعد",
  "It is read out of this repository's own git history. Run this after the exports:":
    "يُقرأ من سجل git لهذا المستودع نفسه. شغّل هذا بعد التصدير:",
  "A shallow clone has no history to read. Clone the full history, or set this in the workflow:":
    "النسخة المستنسخة جزئيًا لا تاريخ فيها لقراءته. استنسخ التاريخ كاملًا، أو اضبط هذا في سير العمل:",
  "For": "عن",
  "Kept": "المحفوظة",
  "Discarded": "المستبعدة",
  "The record begins": "بداية السجل",
  "{s} series and {r} readings, as first read.": "{s} سلسلة و{r} قراءة، كما قُرئت أول مرة.",
  "Revised after publication: {n}": "عُدِّل بعد النشر: {n}",
  "for|a date": "بتاريخ",
  "no longer published, was": "لم يعد منشورًا، وكان",
  "revised to": "عُدِّل إلى",
  "New series: {n}": "سلاسل جديدة: {n}",
  "{n} readings from {d}": "{n} قراءة منذ {d}",
  "New readings: {n}": "قراءات جديدة: {n}",
  ", the {n} that moved most": "، وهذه أكثر {n} منها تحركًا",
  "{n} earlier readings added to series already held.": "أُضيفت {n} قراءة سابقة إلى سلاسل موجودة.",
  "Auction results: {n}": "نتائج المزادات: {n}",
  "Excel archive update": "تحديث أرشيف Excel",
  "{n} readings added across {s} series": "أُضيفت {n} قراءة في {s} سلسلة",
  ", newest for {d}": "، أحدثها بتاريخ {d}",
  "{n} values changed or removed; not counted as revisions.":
    "تغيّرت أو حُذفت {n} قيمة، ولا تُحتسب تعديلات.",
  "Re-read by Miqyas": "أعاد مقياس قراءتها",
  "The Excel archive was read again after a change to the parser.":
    "أُعيدت قراءة أرشيف Excel بعد تغيير في المعالج.",
  "Changed by Miqyas in the repository: a parser fix, a new series or a correction.":
    "غيّرها مقياس في المستودع: إصلاح في المعالج أو سلسلة جديدة أو تصحيح.",
  "A table changed although the file CBE served behind it did not.":
    "تغيّر جدول مع أن الملف الذي قدّمه البنك المركزي وراءه لم يتغيّر.",
  "A date where CBE published two values; the one kept changed.":
    "تاريخ نشر له البنك المركزي قيمتين، وتغيّرت القيمة المحفوظة.",
  "Series Miqyas computes were recomputed from their sources.":
    "أُعيد حساب سلاسل يحسبها مقياس من مصادرها.",
  "{c} values changed, {a} added and {r} removed.": "تغيّرت {c} قيمة، وأُضيفت {a}، وحُذفت {r}.",
  "Series under new ids: {n}.": "سلاسل بمعرّفات جديدة: {n}.",
  "Series added: {n}. Series dropped: {g}.": "سلاسل أُضيفت: {n}. سلاسل أُزيلت: {g}.",
  "Not counted as revisions.": "لا تُحتسب تعديلات.",
  "For example {t} for {d}, read as {a} and now as {b}.":
    "مثال: {t} بتاريخ {d}، قُرئت {a} وتُقرأ الآن {b}.",
  "Held back": "محجوزة للمراجعة",
  "{n} changes in one go, too many to treat as revisions without a check.":
    "{n} تغييرًا دفعة واحدة، وهو عدد أكبر من أن يُعامل تعديلات دون مراجعة.",
  "record begins": "بداية السجل",
  "{n} new": "{n} جديدة",
  "{n} revised": "{n} معدَّلة",
  "{n} new series": "{n} سلسلة جديدة",
  "{n} auction result": "{n} نتيجة مزاد",
  "{n} auction results": "{n} نتيجة مزاد",
  "archive update": "تحديث الأرشيف",
  "{n} re-read by Miqyas": "{n} أعاد مقياس قراءتها",
  "{n} held back": "{n} محجوزة",

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

  /* ---------- document search ----------
   * The count lines carry {placeholders} rather than being cut around the
   * numbers, because Arabic puts the count after the noun, and a number with a
   * colon before it needs no agreement with "صفحة". */
  "Ignored:": "تم تجاهل:",
  "Searching inside the documents…": "جارٍ البحث داخل المستندات…",
  "too common to narrow a search": "كلمات شائعة جدًا لا تضيّق البحث",
  "Top {shown} of {total} pages contain every searched word":
    "عدد الصفحات التي تحتوي على كل كلمات البحث: {total}، تظهر أفضل {shown} منها",
  "{n} pages contain every searched word": "عدد الصفحات التي تحتوي على كل كلمات البحث: {n}",
  "1 page contains every searched word": "صفحة واحدة تحتوي على كل كلمات البحث",
  ", showing the matching text for the first {n}": "، مع النص المطابق لأول {n}",
  "Every word there is too common to search on. Add a less common one, or match titles instead.":
    "كل الكلمات المكتوبة شائعة جدًا فلا يُبحث بها. أضف كلمة أقل شيوعًا، أو ابحث في العناوين.",
  "as listed by CBE": "كما أدرجه البنك المركزي",
  "to|up to a date": "حتى",
  "; later statements on the Rate decisions page": "؛ البيانات اللاحقة في صفحة قرارات أسعار الفائدة",
  "If anything here should not be,": "إن كان هنا ما لا ينبغي أن يكون،",
  "contact me": "راسلني",
  "and it will be removed.": "وسيُحذف.",

  /* ---------- the thirteen subjects ----------
   * The labels a reader picks a direction from, so the most load-bearing
   * prose on the site after the hero. */
  "Foreign exchange": "الصرف الأجنبي",
  "Official, market and interbank exchange rates for the dollar and other major currencies.":
    "أسعار الصرف الرسمية والسوقية وبين البنوك للدولار وعملات رئيسية أخرى.",
  "Interest rates": "أسعار الفائدة",
  "The CBE corridor, overnight money, and what treasury bills pay at auction.":
    "كوريدور البنك المركزي، وسوق ما بين البنوك ليوم واحد، وعائد أذون الخزانة في العطاءات.",
  "Inflation": "التضخم",
  "Headline and core inflation, the basket underneath them, and producer prices.":
    "التضخم العام والأساسي، ومكوّنات السلة تحتهما، وأسعار المنتجين.",
  "Reserves and remittances": "الاحتياطي والتحويلات",
  "Two headline numbers, read by Miqyas from CBE's press releases: net international reserves, and what Egyptians abroad send home.":
    "رقمان رئيسيان يستخرجهما مقياس من البيانات الصحفية للبنك المركزي: صافي الاحتياطي الأجنبي، وما يرسله المصريون بالخارج.",
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

  /* ---------- the charts ---------- */
  "in force since": "سارٍ منذ",
  "One reading only, so there is no line to draw.": "قراءة واحدة فقط، فلا يوجد خط يُرسم.",
  "Two readings only: too few to show a trend.": "قراءتان فقط: أقل من أن تُظهرا اتجاهًا.",
  "Official dollar rate": "سعر الدولار الرسمي",
  "in one business day": "في يوم عمل واحد",
  "Both rebased to 100 on": "كلتاهما معادة الأساس إلى 100 في",
  "Both as published, in the same unit, with no rebasing": "كلتاهما كما نُشرت، بالوحدة نفسها، دون إعادة أساس",
  "Not drawn together: one of these is a rate or goes below zero, so it cannot be rebased, and the two are in different units.":
    "لا تُرسمان معًا: إحداهما معدّل أو تنزل تحت الصفر فلا يمكن إعادة أساسها، والوحدتان مختلفتان.",
  "Nothing to compare in this range.": "لا شيء للمقارنة في هذه الفترة.",
  /* The four exchange-rate regimes in events.json, drawn behind the dollar. */
  "Managed peg": "ربط مُدار",
  "Post-float managed rate": "سعر مُدار بعد التعويم",
  "Stepwise devaluations": "تخفيضات على مراحل",
  "Post-Ras El Hekma float": "التعويم بعد رأس الحكمة",
  /* Legends and readouts. */
  "Discount rate": "سعر الخصم",
  "Overnight deposit rate": "سعر الإيداع لليلة واحدة",
  "Overnight lending rate": "سعر الإقراض لليلة واحدة",
  "The discount rate runs back to 1991. The corridor is only published from July 2014, which is why the older statements below carry no rate.":
    "يعود سعر الخصم إلى عام 1991. أما الكوريدور فلا يُنشر إلا منذ يوليو 2014، ولهذا لا تحمل البيانات الأقدم بالأسفل أي سعر.",
  "CONIA": "كونيا",
  "floor": "الأرضية",
  "ceiling": "السقف",
  "CONIA, the overnight fixing": "كونيا، تثبيتة الليلة الواحدة",
  "the CBE corridor, overnight deposit to overnight lending": "كوريدور البنك المركزي، من الإيداع إلى الإقراض لليلة واحدة",
  "3 month": "3 أشهر",
  "12 month": "12 شهرًا",
  "Both weighted average accepted yields, as published, with no rebasing. Where the two cross, the curve inverted.":
    "كلاهما متوسط العائد المرجّح المقبول كما نُشر، دون إعادة أساس. وحيث يتقاطعان يكون المنحنى قد انقلب.",
  "on the midpoint": "عند منتصف الكوريدور",
  "above the midpoint": "فوق منتصف الكوريدور",
  "below the midpoint": "تحت منتصف الكوريدور",
  "above|one line against another": "فوق",
  "below|one line against another": "تحت",
  "about even": "متساويتان تقريبًا",
  "the first": "الأولى",
  "the second": "الثانية",
  "pts": "نقطة",
  /* Units, as unitShort() sets them beside a figure. */
  "$ mn": "مليون $",
  "$ bn": "مليار $",
  "€ mn": "مليون €",
  "£ mn": "مليون £",
  "EGP mn": "مليون جنيه",
  "EGP bn": "مليار جنيه",
  "EGP / $": "جنيه / $",
  "EGP": "جنيه",
  "p.a.": "سنويًا",
  "ratio": "نسبة",
  "index": "رقم قياسي",
  "thousands": "بالألف",
  "count": "عدد",
  "No year-on-year or rebased view: this series is already a rate, so either would be a percentage of a percentage.":
    "لا نعرض التغيّر عن العام السابق ولا إعادة الأساس: هذه السلسلة معدّل في الأصل، فيكون أيٌّ منهما نسبة مئوية من نسبة مئوية.",
  "No year-on-year or rebased view: this series goes below zero, where a percentage of an earlier reading means nothing.":
    "لا نعرض التغيّر عن العام السابق ولا إعادة الأساس: هذه السلسلة تنزل تحت الصفر، وعندها لا معنى لنسبة مئوية من قراءة سابقة.",

  /* ---------- the pre-rendered pages ----------
   * Read by prerender.py as well as by the front end. These are the titles and
   * descriptions a search result shows and a crawler indexes, so they are the
   * first Arabic anybody sees. */
  "Source: Central Bank of Egypt (https://www.cbe.org.eg). Republished by Miqyas, an independent project not affiliated with, endorsed by, or connected to the Central Bank of Egypt. Values are cleaned and dated by Miqyas; check against CBE before citing.":
    "المصدر: البنك المركزي المصري (https://www.cbe.org.eg). أعاد نشرها مقياس، وهو مشروع مستقل غير تابع للبنك المركزي المصري ولا معتمد منه ولا مرتبط به. تنقية القيم وتأريخها من عمل مقياس؛ راجع البنك المركزي قبل الاستشهاد.",
  "on": "في",
  "to": "إلى",
  "readings back to": "قراءة تعود إلى",
  "series from Egypt's central bank": "سلسلة من البنك المركزي المصري",
  "series, updated daily.": "سلسلة، تُحدَّث يوميًا.",
  "pages from the Central Bank of Egypt": "صفحة من البنك المركزي المصري",
  "Previous": "السابقة",
  "Unit": "الوحدة",
  "not stated by CBE": "لم يذكرها البنك المركزي",
  "Readings": "عدد القراءات",
  "Coverage": "الفترة المغطاة",

  "Find or browse {series} Egyptian economic series | Miqyas":
    "ابحث أو تصفّح {series} سلسلة اقتصادية مصرية | مقياس",
  "Central Bank of Egypt statistics in thirteen subjects, searchable in English and Arabic.":
    "إحصاءات البنك المركزي المصري في ثلاثة عشر موضوعًا، قابلة للبحث بالعربية والإنجليزية.",
  "Your favourites | Miqyas": "مفضلتك | مقياس",
  "One screen of the numbers you check most, with no prose in the way.":
    "شاشة واحدة تضم الأرقام التي تتابعها أكثر من غيرها، بلا كلام يعترض الطريق.",
  "Every CBE rate decision since 2005 | Miqyas":
    "كل قرارات الفائدة للبنك المركزي منذ 2005 | مقياس",
  "{decisions} Monetary Policy Committee statements back to June 2005, with the corridor and what changed in the wording each time.":
    "{decisions} بيانًا للجنة السياسة النقدية تعود إلى يونيو 2005، مع الكوريدور وما تغيّر في الصياغة كل مرة.",
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
  "Revisions to published figures | Miqyas":
    "التعديلات على الأرقام المنشورة | مقياس",
  "Daily record of CBE figures as published, and any revisions to figures already published. Independent; not affiliated with CBE.":
    "سجل يومي لأرقام البنك المركزي كما نُشرت، وأي تعديلات على أرقام سبق نشرها. موقع مستقل غير تابع للبنك المركزي.",
  "Search {documents} Central Bank of Egypt publications | Miqyas":
    "ابحث في {documents} منشورًا للبنك المركزي المصري | مقياس",
  "CBE publications in PDF, {pages} pages of text indexed so you can search inside them in English and Arabic. Each result links to the original on cbe.org.eg.":
    "منشورات البنك المركزي بصيغة PDF، {pages} صفحة من النصوص مفهرسة لتبحث داخلها بالعربية والإنجليزية. كل نتيجة ترتبط بالأصل على موقع البنك المركزي.",
  "Egypt's money market: the corridor, the tenors, the bill curve | Miqyas":
    "سوق النقد المصري: الكوريدور والآجال ومنحنى الأذون | مقياس",
  "Where the pound funded inside the CBE corridor, the interbank tenors with their volumes, and the EGP bill curve with bid to cover.":
    "أين تموّل الجنيه داخل كوريدور البنك المركزي، وآجال ما بين البنوك بأحجامها، ومنحنى أذون الخزانة بالجنيه مع نسبة التغطية.",
  "Download Egypt's macroeconomic data: Parquet, SQLite, CSV and a keyless API | Miqyas":
    "حمّل بيانات الاقتصاد الكلي المصري: Parquet وSQLite وCSV وواجهة بلا مفتاح | مقياس",
  "All {series} series in whichever shape suits you, updated daily. No key and no account.":
    "كل السلاسل الـ{series} بالشكل الذي يناسبك، تُحدَّث يوميًا. بلا مفتاح ولا حساب.",
  "Miqyas is made by Mohamed Ghoneim, as an independent project.":
    "مقياس مشروع مستقل من إعداد محمد غنيم.",
  "The code is MIT-licensed. The data is the Central Bank of Egypt's, and Miqyas claims no rights in it: cite CBE as the source, and check against CBE before citing.":
    "الكود مرخّص برخصة MIT. أما البيانات فملك للبنك المركزي المصري، ولا يدّعي مقياس أي حق فيها: استشهد بالبنك المركزي مصدرًا، وراجعه قبل الاستشهاد.",
  "About Miqyas: an independent dataset of Egyptian central bank data":
    "عن مقياس: مجموعة بيانات مستقلة من بيانات البنك المركزي المصري",
  "Who made Miqyas and why, what is here and what is not, and the terms. Miqyas is an independent project, not affiliated with the Central Bank of Egypt.":
    "من صنع مقياس ولماذا، وما هو موجود وما هو غير موجود، وشروط الاستخدام. مقياس مشروع مستقل غير تابع للبنك المركزي المصري.",

  /* ---------- error and empty states ---------- */
  "Nothing lives at that address": "لا يوجد شيء على هذا العنوان",
  "The link may be from an older version of the site.":
    "قد يكون الرابط من نسخة أقدم من الموقع.",
  "Start over": "ابدأ من جديد",
  "There is no series with that id": "لا توجد سلسلة بهذا المعرّف",
  "Could not load the data": "تعذّر تحميل البيانات",
  "Try again": "أعد المحاولة",

  /* ---------- privacy (counter.js), calculator checks, control names ---------- */
  "Privacy": "الخصوصية",
  "Miqyas sets no cookies.": "لا يضع مقياس أي ملفات تعريف ارتباط (كوكيز).",
  "It counts visits with GoatCounter, the only other site a page load contacts; the pages, the fonts and the data all come from this site's own address.":
    "ويُحصي الزيارات عبر GoatCounter، وهو الموقع الآخر الوحيد الذي تتصل به الصفحة عند فتحها؛ أما الصفحات والخطوط والبيانات فكلها تأتي من عنوان هذا الموقع نفسه.",
  "For each page you open, GoatCounter is sent the name of the page, such as /tools/salary, never what you typed into it, and, when you arrive, the address of the site that linked you here, without the rest of its link.":
    "عن كل صفحة تفتحها يُرسَل إلى GoatCounter اسم الصفحة، مثل /tools/salary، ولا يُرسَل أبدًا ما كتبته فيها، وعند وصولك يُرسَل عنوان الموقع الذي أحالك إلى هنا دون بقية رابطه.",
  "Your browser also sends it what every request carries: your IP address and the kind of browser you use.":
    "ويُرسل إليه متصفحك أيضًا ما يحمله كل طلب: عنوان IP الخاص بك ونوع المتصفح الذي تستخدمه.",
  "What GoatCounter keeps is set out in": "وما يحتفظ به GoatCounter مبيَّن في",
  "its privacy policy": "سياسة الخصوصية الخاصة به",
  "Miqyas counts no visits and sets no cookies.": "لا يُحصي مقياس الزيارات، ولا يضع أي ملفات تعريف ارتباط (كوكيز).",
  "The pages, the fonts and the data all come from this site's own address, so opening a page tells no other site that you did.":
    "الصفحات والخطوط والبيانات كلها تأتي من عنوان هذا الموقع نفسه، فلا يعلم أي موقع آخر أنك فتحت صفحة منه.",
  "Your favourites and settings are kept in this browser and never sent anywhere.":
    "تُحفظ مفضلاتك وإعداداتك في هذا المتصفح، ولا تُرسَل إلى أي مكان.",
  "Nothing you type into a search box or a calculator is sent to any other site. Where it is kept in the page's address, so that an answer can be shared as a link, it sits after the # sign, which browsers do not send to any site.":
    "لا يُرسَل أي شيء تكتبه في مربع البحث أو في الحاسبات إلى أي موقع آخر. وحين يُحفظ في عنوان الصفحة لتتمكن من مشاركة النتيجة كرابط، فإنه يأتي بعد علامة #، وهو جزء لا ترسله المتصفحات إلى أي موقع.",
  "Links to cbe.org.eg and GitHub take you to those sites, under their own terms.":
    "روابط cbe.org.eg وGitHub تنقلك إلى هذين الموقعين، وتخضع لشروطهما.",
  "That is not an amount this can work with. Put in a number of pounds, more than zero.":
    "هذا ليس مبلغًا يمكن الحساب به. أدخل عددًا من الجنيهات أكبر من صفر.",
  "Could not read that month. Write it as year and month, for example 2016-11.":
    "تعذّرت قراءة هذا الشهر. اكتبه بالسنة ثم الشهر، مثل 2016-11.",
  "Could not read that date. Write it as year, month and day, for example 2016-11-03.":
    "تعذّرت قراءة هذا التاريخ. اكتبه بالسنة ثم الشهر ثم اليوم، مثل 2016-11-03.",
  "Miqyas holds no figure for that date. Pick one from {from} to {to}.":
    "لا يحتفظ مقياس بأي رقم لهذا التاريخ. اختر تاريخًا من {from} إلى {to}.",
  "Prices are to {prices}, the latest month in the index; the dollar rate is to {dollar}.":
    "الأسعار حتى {prices}، وهو أحدث شهر في المؤشر؛ وسعر الدولار حتى {dollar}.",
  "The dollar rate used for {asked} is from {held}, the last one Miqyas holds before it.":
    "سعر الدولار المستخدم في {asked} هو سعر {held}، آخر سعر يحتفظ به مقياس قبله.",
  "Miqyas holds no rate for {asked}. This is the last one before it, {days} days earlier.":
    "لا يحتفظ مقياس بسعر في {asked}. هذا آخر سعر قبله، والفارق بينهما {days} من الأيام.",
  "Compare with another series": "قارن بسلسلة أخرى",
  "Kind of document": "نوع الوثيقة",
  "Document topic": "موضوع الوثيقة",
  "Year published": "سنة النشر",
  /* ---------- periods, counts and citations (core.js) ---------- */
  "released": "صدر في",
  "issued": "إصدار",
  "for|a period": "عن",
  "{n} ago": "قبل {n}",
  "Breadcrumb": "مسار التنقل",
  "{n} rows copied": "تم نسخ الصفوف: {n}",
  "Miqyas": "مقياس",
  "Central Bank of Egypt": "البنك المركزي المصري",
  "computed from Central Bank of Egypt data": "محسوبة من بيانات البنك المركزي المصري",
  "data to": "بيانات حتى",
  "Republished by Miqyas": "أعاد نشرها مقياس",
  "build of": "نسخة الموقع بتاريخ",
  "in English:": "بالإنجليزية:",
  "id": "المعرّف",
  "The Arabic title is Miqyas's translation; CBE publishes this series under its English name.":
    "العنوان العربي ترجمة من مقياس، والبنك المركزي ينشر هذه السلسلة باسمها الإنجليزي.",
  "no newer reading held": "لا قراءة أحدث لدينا",
  "Suggested citation:": "صيغة الاستشهاد المقترحة:",
  "Copy the citation": "انسخ صيغة الاستشهاد",
  "Citation copied": "تم نسخ صيغة الاستشهاد",
  "MB": "ميغابايت",
  "KB": "كيلوبايت",

  /* ---------- the overview, the series list and a subject ---------- */
  "Every number below is the latest Miqyas holds. Click one to see its whole history.":
    "كل رقم بالأسفل هو أحدث ما لدى مقياس. اضغط على أيٍّ منها لترى تاريخه كاملًا.",
  "On your desk": "في مفضلتك",
  "Overnight deposit {d}%, overnight lending {l}%, in force since the {date} decision":
    "الإيداع لليلة واحدة {d}%، والإقراض لليلة واحدة {l}%، ساريان منذ قرار {date}",
  "Overnight deposit {d}%, overnight lending {l}%, in force since {date}":
    "الإيداع لليلة واحدة {d}%، والإقراض لليلة واحدة {l}%، ساريان منذ {date}",
  " and held at the {date} meeting": "، وثُبِّتا في اجتماع {date}",
  "Overnight deposit {d}%, overnight lending {l}%.":
    "الإيداع لليلة واحدة {d}%، والإقراض لليلة واحدة {l}%.",
  "{date}, the committee left rates unchanged": "{date}: أبقت اللجنة الأسعار دون تغيير",
  "{date}, the committee cut": "{date}: خفّضت اللجنة الأسعار",
  "{date}, the committee raised": "{date}: رفعت اللجنة الأسعار",
  "{date}, the committee met": "{date}: اجتمعت اللجنة",
  "Every decision back to June 2005, with what changed in the wording each time.":
    "كل القرارات منذ يونيو 2005، مع ما تغيّر في صياغة البيان كل مرة.",
  "See all {n} decisions →": "شاهد القرارات كلها ({n}) ←",
  "Today's dollar rate, against every rate CBE has published since 2005. Low {lo} in {lod}, high {hi} in {hid}.":
    "سعر الدولار اليوم، مقارنة بكل سعر نشره البنك المركزي منذ 2005. الأدنى {lo} في {lod}، والأعلى {hi} في {hid}.",
  "{n} readings": "القراءات: {n}",
  "{from} to {to}": "من {from} إلى {to}",
  "no newer data held": "لا بيانات أحدث لدينا",
  "Find a series, or read down the subjects": "ابحث عن سلسلة، أو تصفّح الموضوعات",
  "Type a word if you know one. If you would rather not, every subject is below and each opens onto the CBE tables it came from, so you can read a whole balance of payments rather than hunt one line of it. The star on any result keeps it in your":
    "اكتب كلمة إن كنت تعرف واحدة. وإن لم تشأ، فكل موضوع موجود بالأسفل، ويفتح كلٌّ منها على جداول البنك المركزي التي جاء منها، فتقرأ ميزان المدفوعات كاملًا بدل أن تبحث عن سطر واحد منه. والنجمة على أي نتيجة تحفظها في",
  "favourites": "المفضلة",
  "dollar, treasury bill yield, تحويلات…": "دولار، عائد أذون الخزانة، تحويلات…",
  "Try:": "جرّب:",
  "dollar": "دولار",
  "treasury bill yield": "عائد أذون الخزانة",
  "deposits": "الودائع",
  "reserves": "الاحتياطي",
  "inflation": "التضخم",
  "exports": "الصادرات",
  "tourists": "السائحين",
  "external debt": "الدين الخارجي",
  "budget deficit": "العجز الكلي",
  "remittances": "تحويلات",
  "By subject": "حسب الموضوع",
  "All of it, in thirteen subjects": "كل شيء، في ثلاثة عشر موضوعًا",
  "The last card is not a subject: it is a screen assembled out of several of them, for a desk that reads the same numbers every day.":
    "البطاقة الأخيرة ليست موضوعًا: إنها شاشة مجمّعة من عدة موضوعات، لمكتب يقرأ الأرقام نفسها كل يوم.",
  "{s} series · {o} observations": "السلاسل: {s} · المشاهدات: {o}",
  "{n} matching series": "السلاسل المطابقة: {n}",
  "Nothing matches “{q}”. Try a broader word, or pick a subject below.":
    "لا شيء يطابق «{q}». جرّب كلمة أعمّ، أو اختر موضوعًا بالأسفل.",
  "No such topic.": "لا يوجد موضوع بهذا الاسم.",
  "See all thirteen": "اعرض الموضوعات الثلاثة عشر",
  "{n} series · from {d}": "السلاسل: {n} · منذ {d}",
  "{n} series across 1 CBE table.": "السلاسل: {n}، في جدول واحد للبنك المركزي.",
  "{n} series across {k} CBE tables.": "السلاسل: {n}، وجداول البنك المركزي: {k}.",
  "Line": "البند",
  "Covers": "الفترة المغطاة",
  "Published": "الدورية",
  "Topic": "موضوع",
  "Narrow this topic (optional)": "ضيّق نطاق هذا الموضوع (اختياري)",
  "Any frequency": "أي دورية",
  "Open all tables": "افتح كل الجداول",
  "Close all tables": "أغلق كل الجداول",

  /* ---------- one series ---------- */
  "No newer reading here": "لا قراءة أحدث هنا",
  "Miqyas holds no value for this series after {d}: {n} days without a new reading ({f}).":
    "لا يحتفظ مقياس بأي قيمة لهذه السلسلة بعد {d}، وعدد الأيام دون قراءة جديدة: {n} (الدورية: {f}).",
  "Miqyas holds no value for this series after {d}: {n} days without a new reading.":
    "لا يحتفظ مقياس بأي قيمة لهذه السلسلة بعد {d}، وعدد الأيام دون قراءة جديدة: {n}.",
  "The source may have stopped, or Miqyas may not have picked up a newer release.":
    "ربما توقف المصدر، أو ربما لم يلتقط مقياس إصدارًا أحدث.",
  "Check the CBE source linked below.": "راجع مصدر البنك المركزي المرتبط بالأسفل.",
  "{n} of these readings are exactly zero": "قراءات تساوي صفرًا تمامًا: {n}",
  "CBE publishes a zero where no rate was set rather than leaving the cell empty, and they are reproduced here as published rather than treated as missing. An average taken across this series will be pulled toward zero.":
    "ينشر البنك المركزي صفرًا حيث لم يُحدَّد سعر بدل أن يترك الخانة فارغة، وتُعرض هذه الأصفار هنا كما نُشرت لا بوصفها قيمًا مفقودة. وأي متوسط يؤخذ على هذه السلسلة سينجذب نحو الصفر.",
  "A note on this series": "ملاحظة على هذه السلسلة",
  "Biggest single move {size}{pct} on {d}.": "أكبر تحرّك منفرد {size}{pct} في {d}.",
  "The gold mark is the median of {n} readings, {m}.": "العلامة الذهبية هي وسيط كل القراءات ({n})، وقيمته {m}.",
  "Where this sits in its own record": "موقعها في سجلها الخاص",
  "lowest": "الأدنى",
  "highest": "الأعلى",
  "Newest first. The most recent {n} of {all} readings in this range.":
    "الأحدث أولًا. آخر {n} من أصل {all} قراءة في هذه الفترة.",
  "Newest first. All {n} readings in this range.": "الأحدث أولًا. كل القراءات في هذه الفترة: {n}.",
  "Value": "القيمة",
  "Not found": "غير موجود",
  "Nothing here is called": "لا شيء هنا يحمل الاسم",
  "These are the closest things in the catalogue.": "هذه أقرب ما في الفهرس.",
  "Nothing in the catalogue looks close to it, so it may be from an older version of the site.":
    "لا شيء في الفهرس يشبهه، فربما يكون من نسخة أقدم من الموقع.",
  "Nothing in this range.": "لا شيء في هذه الفترة.",
  "Compare with… (nothing selected)": "قارن مع… (لم يُختر شيء)",
  "{line} (same table)": "{line} (الجدول نفسه)",
  "Other": "أخرى",
  "no unit stated": "لم تُذكر وحدة",
  "as of {d}": "حتى {d}",
  "Computed by Miqyas": "حسبها مقياس",
  "from CBE data": "من بيانات البنك المركزي",
  "Dates assigned by Miqyas": "تواريخ حدّدها مقياس",
  "from the sheet": "من الملف",
  "Reproduced as published": "منقولة كما نُشرت",
  "yes": "نعم",
  "★ On your desk": "★ في مفضلتك",
  "☆ Keep on your desk": "☆ أضف إلى مفضلتك",
  "This range as CSV": "هذه الفترة بصيغة CSV",
  "Everything as CSV": "كل البيانات بصيغة CSV",
  "Copy for a spreadsheet": "انسخ لجدول بيانات",
  "Open the JSON": "افتح ملف JSON",
  "Copy a link to this page": "انسخ رابط هذه الصفحة",
  "The readings themselves": "القراءات نفسها",
  "{n} in total": "المجموع: {n}",
  "Where this comes from": "من أين تأتي",
  "Provenance": "المصدر",
  "Computed by Miqyas from CBE data:": "حسبها مقياس من بيانات البنك المركزي:",
  "Source: Central Bank of Egypt, Excel time-series archive. Miqyas reads the sheet and assigns each value to a date from the sheet's own period labels. Fiscal-year quarters follow Egypt's July to June year. Dates are our reading of the sheet and can be wrong; check the linked CBE file before citing.":
    "المصدر: البنك المركزي المصري، أرشيف السلاسل الزمنية بصيغة Excel. يقرأ مقياس الملف وينسب كل قيمة إلى تاريخ استنادًا إلى تسميات الفترات في الملف نفسه. وتتبع الأرباع المالية السنة المالية المصرية من يوليو إلى يونيو. والتواريخ قراءتنا للملف وقد تكون خاطئة، فراجع ملف البنك المركزي المرتبط قبل الاستشهاد.",
  "Reproduced as published from the Central Bank of Egypt's daily tables. Where CBE printed two values for one date, Miqyas keeps one and lists both on the What changed page.":
    "منقولة كما نُشرت من الجداول اليومية للبنك المركزي المصري. وحيث نشر البنك قيمتين لتاريخ واحد، يحتفظ مقياس بإحداهما ويدرج الاثنتين في صفحة «ما الذي تغيّر».",
  "Values are dated to the end of the period they describe.": "تُؤرَّخ القيم بنهاية الفترة التي تصفها.",
  "CBE's own sheet did not state a unit anywhere the parser could find one, so the figures are reproduced without one rather than given a guessed label.":
    "لم يذكر ملف البنك المركزي نفسه وحدة في أي موضع استطاع المعالج العثور عليه، فتُعرض الأرقام بلا وحدة بدل أن تُعطى تسمية مخمّنة.",
  "How periods and dates are written →": "كيف تُكتب الفترات والتواريخ ←",
  "CBE page": "صفحة البنك المركزي",
  "Source file": "الملف المصدر",
  "Dataset": "مجموعة البيانات",
  "Same table": "الجدول نفسه",
  "{n} more lines in this table.": "بنود أخرى في هذا الجدول: {n}.",
  "All {topic} series →": "كل سلاسل {topic} ←",
  "Nothing else came from this table.": "لم يأتِ شيء آخر من هذا الجدول.",
  /* The methods of the computed series, as the catalogue words them. A method
     not listed here stays English on /ar/, held left to right. */
  "CBE publishes inflation as a rate and never as a level. This chains EG.CPI.HDL.MOM, the published month-on-month headline rate, from a base of 100 in December 2004. Recomputing year-on-year inflation from it reproduces the published EG.CPI.HDL.YOY to a median of 0.001 percentage points. It does not reproduce 2009 and 2010, where CAPMAS rebased the basket and a chained index cannot see the link: a comparison spanning those two years carries roughly 1.5 percentage points of error in that one year.":
    "ينشر البنك المركزي التضخم معدّلًا لا مستوى. وهذه السلسلة تربط EG.CPI.HDL.MOM، وهو معدّل التضخم العام الشهري المنشور، بدءًا من أساس 100 في ديسمبر 2004. وإعادة حساب التضخم السنوي منها تعيد إنتاج EG.CPI.HDL.YOY المنشور بفارق وسيط قدره 0.001 نقطة مئوية. ولا تعيد إنتاج عامي 2009 و2010، حين أعاد الجهاز المركزي للتعبئة العامة والإحصاء أساس السلة ولا يستطيع رقم متسلسل أن يرى الربط: فأي مقارنة تمتد عبر هذين العامين تحمل خطأً يقارب 1.5 نقطة مئوية في ذلك العام وحده.",
  "Parsed from CBE remittances press releases, which report a running total from the start of the fiscal year (1 July). The period is the last day of the cumulative window, not a monthly flow.":
    "مستخرجة من البيانات الصحفية للبنك المركزي عن التحويلات، التي تذكر مجموعًا تراكميًا منذ بداية السنة المالية (1 يوليو). والفترة هي آخر يوم في النافذة التراكمية، لا تدفقًا شهريًا.",
  "Parsed from the monthly CBE press release text. CBE does not publish this as a downloadable series.":
    "مستخرجة من نص البيان الصحفي الشهري للبنك المركزي. ولا ينشرها البنك سلسلةً قابلة للتنزيل.",
  "Auctions with tenor in [60, 120] days, grouped as 3M.": "العطاءات التي يقع أجلها بين 60 و120 يومًا، مجمّعة تحت أجل 3 أشهر.",
  "Auctions with tenor in [150, 200] days, grouped as 6M.": "العطاءات التي يقع أجلها بين 150 و200 يوم، مجمّعة تحت أجل 6 أشهر.",
  "Auctions with tenor in [240, 290] days, grouped as 9M.": "العطاءات التي يقع أجلها بين 240 و290 يومًا، مجمّعة تحت أجل 9 أشهر.",
  "Auctions with tenor in [330, 400] days, grouped as 12M.": "العطاءات التي يقع أجلها بين 330 و400 يوم، مجمّعة تحت أجل 12 شهرًا.",
  "Submitted Amount / Accepted Amount, computed here. Not published by CBE.":
    "المبلغ المقدَّم مقسومًا على المبلغ المقبول، محسوبًا هنا. لا ينشره البنك المركزي.",

  /* ---------- get the data ---------- */
  "Get the data": "احصل على البيانات",
  "Free, no key, no account": "مجانًا، بلا مفتاح ولا حساب",
  "Take all of it": "خذها كلها",
  "{s} series and {o} observations, in whichever shape suits you. Everything here is rebuilt from CBE's own publications and updated daily, so a bookmark stays current.":
    "السلاسل: {s}، والمشاهدات: {o}، بالشكل الذي يناسبك. كل ما هنا يُعاد بناؤه من منشورات البنك المركزي نفسها ويُحدَّث يوميًا، فيبقى الرابط المحفوظ محدَّثًا.",
  "What each field, code and date means →": "ماذا يعني كل حقل ورمز وتاريخ ←",
  "Whole-archive downloads": "تنزيلات الأرشيف كاملًا",
  "Every observation. Opens in DuckDB, pandas, Polars, R.": "كل المشاهدات. يُفتح في DuckDB وpandas وPolars وR.",
  "The catalogue: titles, units, frequency, provenance.": "الفهرس: العناوين والوحدات والدورية والمصدر.",
  "One SQLite file: series, observations and a revisions table.": "ملف SQLite واحد: السلاسل والمشاهدات وجدول للتعديلات.",
  "Plain CSV, one file per dataset, plus the catalogue.": "ملفات CSV عادية، ملف لكل مجموعة بيانات، ومعها الفهرس.",
  "The record-level tables behind the derived series.": "الجداول التفصيلية التي تُحسب منها السلاسل المشتقة.",
  "Every value each series has held, with the first and last day it was held.":
    "كل قيمة حملتها كل سلسلة، مع أول يوم وآخر يوم حملتها فيه.",
  "The same record as CSV: series_id, period, value, first_seen, last_seen.":
    "السجل نفسه بصيغة CSV، بالأعمدة series_id وperiod وvalue وfirst_seen وlast_seen.",
  "Every published file with its SHA-256, so any copy can be checked against it.":
    "كل ملف منشور مع بصمة SHA-256 الخاصة به، حتى يمكن مطابقة أي نسخة بها.",
  "By topic": "حسب الموضوع",
  "Smaller files if you only want one part of it.": "ملفات أصغر إن أردت جزءًا واحدًا فقط.",
  "API": "واجهة البيانات",
  "Static JSON, no key": "ملفات JSON ثابتة، بلا مفتاح",
  "There is no server. Every endpoint is a static file on GitHub Pages, with no key and no rate limit that we set.":
    "لا يوجد خادم. كل نقطة وصول ملف ثابت على GitHub Pages، بلا مفتاح ولا حدّ للطلبات من جهتنا.",
  "the catalogue: one light record per series": "الفهرس: سجل خفيف لكل سلسلة",
  "one series, with every observation": "سلسلة واحدة بكل مشاهداتها",
  "the rate decisions": "قرارات أسعار الفائدة",
  "query the whole archive from Python, no download": "استعلم عن الأرشيف كله من بايثون، دون تنزيل",
  "Terms": "الشروط",
  "Using it": "استخدامها",
  "Cite the Central Bank of Egypt as the source. Miqyas cleans and dates the values; where a number was computed, the series page says so and names the method. If you find a value that does not match CBE's,":
    "استشهد بالبنك المركزي المصري مصدرًا. يتولى مقياس تنقية القيم وتأريخها، وحيث حُسب رقم ما تذكر صفحة السلسلة ذلك وتسمّي الطريقة. وإن وجدت قيمة لا تطابق ما نشره البنك المركزي،",
  "tell us": "فأخبرنا",
  "Miqyas is not affiliated with, endorsed by, or connected to the Central Bank of Egypt. The code is MIT-licensed; the data is CBE's.":
    "مقياس غير تابع للبنك المركزي المصري ولا معتمد منه ولا مرتبط به. الكود مرخّص برخصة MIT، أما البيانات فملك للبنك المركزي.",
  "The full terms are on the About page.": "الشروط كاملة في صفحة «عن الموقع».",

  /* ---------- the field and date guide ---------- */
  "Fields and dates": "الحقول والتواريخ",
  "Field": "الحقل",
  "What it means": "معناه",
  "A one-page guide": "دليل في صفحة واحدة",
  "What the fields, codes and dates mean": "ماذا تعني الحقول والرموز والتواريخ",
  "Every file holds the same three things: which series, which period, and the value. The catalogue says what each series is. This page says what the columns mean, and how each kind of series is dated, because the dates are not all dated the same way.":
    "كل ملف يحمل الأشياء الثلاثة نفسها: أي سلسلة، وأي فترة، والقيمة. ويقول الفهرس ما هي كل سلسلة. وتشرح هذه الصفحة معنى الأعمدة، وكيف يُؤرَّخ كل نوع من السلاسل، لأن التواريخ لا تُكتب كلها بالطريقة نفسها.",
  "The readings": "القراءات",
  "The series. Ids for CBE's daily tables are not expected to change. Ids for the series read from CBE's Excel archive are being reworked and may change.":
    "السلسلة. لا يُتوقع أن تتغير معرّفات الجداول اليومية للبنك المركزي، أما معرّفات السلاسل المقروءة من أرشيف Excel فيُعاد العمل عليها وقد تتغير.",
  "The date the reading is filed under, as YYYY-MM-DD. What that date stands for depends on the series: see the dates below.":
    "التاريخ الذي تُسجَّل تحته القراءة، بصيغة YYYY-MM-DD. وما يعنيه هذا التاريخ يتوقف على السلسلة: انظر التواريخ بالأسفل.",
  "The number as CBE published it, or as Miqyas computed it for a computed series. Its unit is in the catalogue.":
    "الرقم كما نشره البنك المركزي، أو كما حسبه مقياس إن كانت السلسلة محسوبة. ووحدته مذكورة في الفهرس.",
  "In the JSON for one series, the readings as a list of [period, value] pairs, oldest first.":
    "في ملف JSON لسلسلة واحدة: القراءات قائمةً من أزواج [period, value]، الأقدم أولًا.",
  "The catalogue": "الفهرس",
  "CBE's English and Arabic titles. For the Excel archive, CBE's Arabic title names the line of the table only.":
    "عنوانا البنك المركزي بالإنجليزية والعربية. وفي أرشيف Excel يسمّي العنوان العربي للبنك بند الجدول وحده.",
  "\"miqyas\" where CBE publishes no Arabic name and the Arabic title is Miqyas's translation.":
    "القيمة \"miqyas\" حيث لا ينشر البنك المركزي اسمًا عربيًا ويكون العنوان العربي ترجمة من مقياس.",
  "What the value is measured in, as CBE states it: percent, EGP million, USD million and so on. Empty where CBE's sheet did not say.":
    "ما تُقاس به القيمة كما يذكره البنك المركزي: نسبة مئوية، أو مليون جنيه، أو مليون دولار، وهكذا. وتبقى فارغة حيث لم يذكرها ملف البنك.",
  "How often the series has a reading. The codes are below.": "كم مرة تصدر للسلسلة قراءة. الرموز بالأسفل.",
  "The CBE table or file group the series was read from, and the wider group the subjects are built on.":
    "جدول البنك المركزي أو مجموعة الملفات التي قُرئت منها السلسلة، والمجموعة الأوسع التي تُبنى عليها الموضوعات.",
  "The CBE page or Excel file the series was read from. source_file is a path on www.cbe.org.eg.":
    "صفحة البنك المركزي أو ملف Excel الذي قُرئت منه السلسلة. والحقل source_file مسار على www.cbe.org.eg.",
  "true where Miqyas computed the series from CBE's numbers, with the method in words.":
    "القيمة true حيث حسب مقياس السلسلة من أرقام البنك المركزي، مع وصف الطريقة بالكلمات.",
  "\"end\" where each value is dated to the last day of the period it describes.":
    "القيمة \"end\" حيث تُؤرَّخ كل قيمة بآخر يوم في الفترة التي تصفها.",
  "Egypt's fiscal year, 1 July to 30 June, for the series that follow it.":
    "السنة المالية المصرية، من 1 يوليو إلى 30 يونيو، للسلاسل التي تتبعها.",
  "Frequency codes": "رموز الدورية",
  "Daily: each business day CBE publishes the table.": "يومي: كل يوم عمل ينشر فيه البنك المركزي الجدول.",
  "Weekly: the treasury bill auctions.": "أسبوعي: عطاءات أذون الخزانة.",
  "Every two weeks.": "كل أسبوعين.",
  "Monthly.": "شهري.",
  "Quarterly.": "ربع سنوي.",
  "Yearly, which in the Excel archive is Egypt's fiscal year.": "سنوي، وهو في أرشيف Excel السنة المالية المصرية.",
  "Only when it changes: a policy rate, with one reading for each new level.":
    "عند التغيّر فقط: سعر من أسعار السياسة النقدية، بقراءة واحدة لكل مستوى جديد.",
  "How each kind of series is dated": "كيف يُؤرَّخ كل نوع من السلاسل",
  "Exchange rates, CONIA and the interbank and secondary-market tables: the day CBE's table gives for the reading.":
    "أسعار الصرف وكونيا وجداول ما بين البنوك والسوق الثانوية: اليوم الذي يذكره جدول البنك المركزي للقراءة.",
  "Policy rates (the corridor, the discount rate, the main operation rate): the day a new level took effect, usually a few days after the meeting. The level holds until the next reading.":
    "أسعار السياسة النقدية (الكوريدور وسعر الخصم وسعر العملية الرئيسية): اليوم الذي بدأ فيه سريان المستوى الجديد، وعادة ما يكون بعد الاجتماع ببضعة أيام. ويبقى المستوى ساريًا حتى القراءة التالية.",
  "Inflation and the retail interest rates, from CBE's monthly tables: the first day of the month the reading is for. 2026-08-01 is August 2026.":
    "التضخم وأسعار الفائدة على الودائع والقروض، من الجداول الشهرية للبنك المركزي: أول يوم من الشهر الذي تخصه القراءة. فالتاريخ 2026-08-01 يعني أغسطس 2026.",
  "Treasury bill auctions: the bill's issue date, which can run a few days ahead of the auction.":
    "عطاءات أذون الخزانة: تاريخ إصدار الإذن، وقد يأتي بعد العطاء ببضعة أيام.",
  "Net international reserves: the day of CBE's press release, not the month the figure describes.":
    "صافي الاحتياطيات الدولية: يوم البيان الصحفي للبنك المركزي، لا الشهر الذي يصفه الرقم.",
  "Remittances: the last day of the window the running total covers. The value is the total since 1 July, the start of the fiscal year.":
    "التحويلات: آخر يوم في الفترة التي يغطيها المجموع التراكمي. والقيمة هي المجموع منذ 1 يوليو، بداية السنة المالية.",
  "The Excel archive: the last day of the period. A month ends on its last day, a quarter on 31 March, 30 June, 30 September or 31 December, and a fiscal year on 30 June.":
    "أرشيف Excel: آخر يوم في الفترة. فالشهر ينتهي بآخر أيامه، والربع في 31 مارس أو 30 يونيو أو 30 سبتمبر أو 31 ديسمبر، والسنة المالية في 30 يونيو.",
  "So the same month can carry two different dates. Inflation for August 2026 is filed under 2026-08-01, and a monthly Excel series for August 2026 under 2026-08-31. To put the two side by side, join on the year and the month, not on the date.":
    "لذلك قد يحمل الشهر نفسه تاريخين مختلفين. فتضخم أغسطس 2026 مسجّل تحت 2026-08-01، وسلسلة شهرية من أرشيف Excel عن أغسطس 2026 تحت 2026-08-31. ولوضعهما جنبًا إلى جنب، اربطهما بالسنة والشهر لا بالتاريخ.",
  "How the site writes a period": "كيف يكتب الموقع الفترة",
  "A month as Jun 2026.": "الشهر هكذا: يونيو 2026.",
  "A quarter as the calendar quarter, Q2 2026 for April to June 2026, whichever fiscal year it falls in.":
    "الربع بوصفه ربعًا من السنة الميلادية: الربع الثاني 2026 يعني أبريل إلى يونيو 2026، أيًّا كانت السنة المالية التي يقع فيها.",
  "A fiscal year as FY2019/20, which is 1 July 2019 to 30 June 2020. The files date it 2020-06-30.":
    "السنة المالية هكذا: العام المالي 2019/2020، أي من 1 يوليو 2019 إلى 30 يونيو 2020. وتؤرّخها الملفات 2020-06-30.",
  "Daily series, policy rates, auctions and reserves with the full date, because the day is the fact.":
    "السلاسل اليومية وأسعار السياسة النقدية والعطاءات والاحتياطيات بالتاريخ كاملًا، لأن اليوم نفسه هو المعلومة.",
  "The first day Miqyas held that value for that series and period.":
    "أول يوم احتفظ فيه مقياس بتلك القيمة لتلك السلسلة والفترة.",
  "The last day it was held. Empty while it is still held. When a different value replaces it for the same period, last_seen is the day before the new one was first seen.":
    "آخر يوم احتُفظ بها فيه. ويبقى فارغًا ما دامت محفوظة. وحين تحلّ قيمة مختلفة محلها للفترة نفسها، يكون last_seen اليوم السابق لأول ظهور للقيمة الجديدة.",
  "Updates": "التحديثات",
  "The files are rebuilt every day from what Miqyas has read. status.json gives the time of the build and of the last read of CBE, and manifest.json gives every file with its SHA-256, so a copy can be checked against the one it came from.":
    "يُعاد بناء الملفات كل يوم مما قرأه مقياس. ويذكر ملف status.json وقت البناء ووقت آخر قراءة من البنك المركزي، ويذكر ملف manifest.json كل ملف مع بصمة SHA-256 الخاصة به، حتى يمكن مطابقة أي نسخة بالأصل الذي جاءت منه.",
  "Back to the downloads →": "العودة إلى التنزيلات ←",

  /* ---------- about ---------- */
  "An independent dataset of Central Bank of Egypt statistics": "مجموعة بيانات مستقلة لإحصاءات البنك المركزي المصري",
  "Independent project. Not affiliated with, endorsed by, or connected to the Central Bank of Egypt.":
    "مشروع مستقل. غير تابع للبنك المركزي المصري ولا معتمد منه ولا مرتبط به.",
  "Official figures are on": "الأرقام الرسمية على موقع",
  "Who made this, and why": "من صنع هذا، ولماذا",
  "It republishes Central Bank of Egypt statistics as one clean dataset, with a dated archive of the daily tables, for people who write about Egypt's economy: analysts, journalists and researchers. CBE's figures are spread across live tables, Excel files and PDFs; here they are one catalogue with one set of ids, charted, searchable, and downloadable as CSV, Parquet, SQLite or JSON.":
    "يعيد نشر إحصاءات البنك المركزي المصري في مجموعة بيانات واحدة منظمة، مع أرشيف مؤرَّخ للجداول اليومية، لمن يكتبون عن اقتصاد مصر: المحللين والصحفيين والباحثين. أرقام البنك المركزي موزعة بين جداول حية وملفات Excel وملفات PDF، وهنا تجتمع في فهرس واحد بمجموعة واحدة من المعرّفات، مع رسوم بيانية وبحث، ويمكن تنزيلها بصيغ CSV وParquet وSQLite وJSON.",
  "Questions and corrections go to": "تُرسل الأسئلة والتصحيحات إلى",
  "the project's GitHub issues page": "صفحة البلاغات الخاصة بالمشروع على GitHub",
  "What it does": "ماذا يفعل",
  "Miqyas copies CBE's live tables once a day and its Excel archive and publications once a week, and saves each copy. It keeps a dated copy of the daily tables from 20 August 2026, so past values can be looked up. If CBE changes a figure it has already published, the change appears on the":
    "ينسخ مقياس الجداول الحية للبنك المركزي مرة كل يوم، وأرشيف Excel والمنشورات مرة كل أسبوع، ويحفظ كل نسخة. ويحتفظ بنسخة مؤرَّخة من الجداول اليومية منذ 20 أغسطس 2026، فيمكن الرجوع إلى القيم السابقة. وإذا غيّر البنك المركزي رقمًا سبق نشره، يظهر التغيير في صفحة",
  "page. Each week the Excel archive and the publications are also checked for files CBE has replaced or withdrawn.":
    "المخصصة لذلك. ويُفحص أرشيف Excel والمنشورات كل أسبوع أيضًا بحثًا عن ملفات استبدلها البنك المركزي أو سحبها.",
  "Each series page says how its numbers got here: reproduced as published from one of CBE's daily tables, dated by Miqyas from the period labels in a CBE Excel sheet, or computed by Miqyas (a bid-to-cover ratio, a yield-curve bucket, reserves read from a press release), with the method named.":
    "تذكر كل صفحة سلسلة كيف وصلت أرقامها إلى هنا: منقولة كما نُشرت من أحد الجداول اليومية للبنك المركزي، أو مؤرَّخة من مقياس استنادًا إلى تسميات الفترات في ملف Excel للبنك المركزي، أو محسوبة من مقياس (نسبة تغطية، أو شريحة من منحنى العائد، أو احتياطيات مستخرجة من بيان صحفي)، مع تسمية الطريقة.",
  "The code is MIT-licensed. The data is the Central Bank of Egypt's, and Miqyas claims no rights in it. CBE's":
    "الكود مرخّص برخصة MIT. أما البيانات فملك للبنك المركزي المصري، ولا يدّعي مقياس أي حق فيها. ويسمح",
  "disclaimer": "إخلاء المسؤولية الخاص بالبنك المركزي",
  "allows reuse of information from its website if CBE is cited as the source, any transformation is stated explicitly, and the information appears accurately. Miqyas cites CBE on every page and in every file, and says for each series what was done to the numbers. Errors in cleaning or dating are ours, not CBE's: check against CBE before you cite.":
    "بإعادة استخدام المعلومات المنشورة على موقعه بشرط ذكر البنك المركزي مصدرًا، والتصريح بأي تحويل أُجري عليها، وعرضها بدقة. ويذكر مقياس البنك المركزي مصدرًا في كل صفحة وفي كل ملف، ويبيّن لكل سلسلة ما جرى على أرقامها. وأي خطأ في التنقية أو التأريخ مسؤوليتنا لا مسؤولية البنك المركزي: راجع البنك المركزي قبل الاستشهاد.",
  "To cite a figure, name the Central Bank of Egypt as the source and Miqyas as where you found it. Each series page suggests a citation for its own series.":
    "للاستشهاد برقم، اذكر البنك المركزي المصري مصدرًا ومقياس مكانًا وجدته فيه. وتقترح كل صفحة سلسلة صيغة استشهاد خاصة بها.",
  "is the Nilometer on Rhoda Island: the graduated marble column Cairo read the flood against to forecast the harvest and set the tax rate. Egypt's first macroeconomic indicator, in service by 861 AD, and the reason the graduated gauge recurs through this site.":
    "هو مقياس النيل في جزيرة الروضة: العمود الرخامي المدرّج الذي كانت القاهرة تقرأ عليه الفيضان لتتنبأ بالمحصول وتحدّد الضريبة. أول مؤشر اقتصادي كلي في مصر، دخل الخدمة قبل عام 861 ميلاديًا، وهو سبب تكرار المقياس المدرّج في هذا الموقع.",
  "Known limits": "حدود معروفة",
  "Some series stop earlier than CBE's own. Money and banking figures from the Excel archive end in mid-2023, where CBE stopped extending those files; CBE publishes newer figures elsewhere on its site that Miqyas does not yet read.":
    "بعض السلاسل تتوقف قبل سلاسل البنك المركزي نفسه. فأرقام النقود والبنوك من أرشيف Excel تنتهي في منتصف 2023، حيث توقف البنك عن تمديد تلك الملفات، وهو ينشر أرقامًا أحدث في مواضع أخرى من موقعه لا يقرؤها مقياس بعد.",
  "Some documents are scans of paper with no text layer of their own. They are read by OCR, using Tesseract in Arabic and English, so their text is searchable. It is not as good as a real text layer: the odd word comes out wrong, and Arabic in a scan often comes back with its letters in visual rather than logical order, so searching inside these particular documents works better in English than in Arabic. The Documents page counts and labels every one of them.":
    "بعض الوثائق صور ممسوحة ضوئيًا لأوراق لا تحمل طبقة نصية خاصة بها. تُقرأ بالتعرّف الضوئي على الحروف (OCR) باستخدام Tesseract بالعربية والإنجليزية، فيصبح نصها قابلًا للبحث. لكنه أقل جودة من طبقة نصية حقيقية: تخرج بعض الكلمات خاطئة، وكثيرًا ما يعود النص العربي في المسح بحروف مرتبة ترتيبًا بصريًا لا منطقيًا، ولذلك يعمل البحث داخل هذه الوثائق تحديدًا بالإنجليزية أفضل منه بالعربية. وتعدّ صفحة الوثائق كل واحدة منها وتشير إليها.",
  "About one page of text in twenty lost at least a sixth of its characters on the way out of the PDF. Those files embed a font with no Unicode mapping, so the text layer holds glyph indices rather than letters and nothing short of OCR can recover the words. Those pages are still searched and quoted on whatever could be read, which is why a quote from one can have words missing from the middle.":
    "نحو صفحة من كل عشرين صفحة نصية فقدت سدس حروفها على الأقل عند استخراجها من ملف PDF. فهذه الملفات تضمّن خطًا بلا ربط بترميز Unicode، فتحمل طبقتها النصية أرقام أشكال الحروف لا الحروف نفسها، ولا يستعيد الكلمات إلا التعرّف الضوئي. ومع ذلك يُبحث في هذه الصفحات ويُقتبس منها بما أمكن قراءته، ولهذا قد تغيب كلمات من وسط الاقتباس منها.",
  "The Financial Soundness Indicator tables are extracted as text but not yet parsed into series.":
    "جداول مؤشرات السلامة المالية مستخرجة نصًا، لكنها لم تُحوَّل إلى سلاسل بعد.",
  "When an Excel file in the archive cannot be parsed, it is listed with its reason in":
    "إذا تعذّرت معالجة ملف Excel في الأرشيف، يُدرج مع سبب ذلك في",
  "Around one series in eight carries no unit, because CBE's own sheet did not state one anywhere the parser could find it.":
    "نحو سلسلة من كل ثماني سلاسل بلا وحدة، لأن ملف البنك المركزي نفسه لم يذكر وحدة في أي موضع استطاع المعالج العثور عليه.",
  "How it is built": "كيف بُني",
  "Python for the ingest, static JSON and Parquet for the output, and a front end with no framework and no build step. Two scheduled jobs, the live tables once a day and the Excel archive and document corpus once a week, plus a publish step that rebuilds this site after each of them, and an OCR pass run by hand when new scans turn up. The daily job often starts hours after its scheduled time; the status line on every page says when CBE was last read. The whole thing is a repository, and the repository is the archive.":
    "بايثون لجمع البيانات، وملفات JSON وParquet ثابتة للمخرجات، وواجهة بلا إطار عمل ولا خطوة بناء. مهمتان مجدولتان: الجداول الحية مرة كل يوم، وأرشيف Excel ومجموعة الوثائق مرة كل أسبوع، ومعهما خطوة نشر تعيد بناء الموقع بعد كل منهما، وتمريرة تعرّف ضوئي تُشغَّل يدويًا عند ظهور مسوح جديدة. وكثيرًا ما تبدأ المهمة اليومية بعد موعدها بساعات، ويذكر سطر الحالة في كل صفحة متى قُرئ البنك المركزي آخر مرة. والمشروع كله مستودع، والمستودع هو الأرشيف.",
  "The code and the data are on GitHub ↗": "الكود والبيانات على GitHub ↗",

  /* ---------- rate decisions ---------- */
  "The rate-decision archive has not been built yet.": "لم يُبنَ أرشيف قرارات الفائدة بعد.",
  "bp": "نقطة أساس",
  "Statement only": "بيان فقط",
  "deposit": "الإيداع",
  "lending": "الإقراض",
  "{n}% of the wording changed": "تغيّر {n}% من الصياغة",
  "from the rate series": "من سلسلة الأسعار",
  /* CBE publishes the statements in English, and the Arabic site says so on
     each link rather than letting a reader find out after the click. */
  "PDF ↗": "PDF بالإنجليزية ↗",
  "Statement ↗": "البيان بالإنجليزية ↗",
  "The decisions as data, and where they come from": "القرارات بيانات، ومن أين تأتي",
  "Source: the Monetary Policy Committee statements the Central Bank of Egypt publishes on cbe.org.eg, linked one by one below. The rates are read from each statement; where a statement could not be read, from CBE's own corridor series, and marked so. Every statement is in English.":
    "المصدر: بيانات لجنة السياسة النقدية التي ينشرها البنك المركزي المصري على cbe.org.eg، وكل منها مرتبط بالأسفل. تُقرأ الأسعار من كل بيان، وحيث تعذّرت قراءة البيان تؤخذ من سلسلة الكوريدور التي ينشرها البنك نفسه ويُشار إلى ذلك. وكل البيانات بالإنجليزية.",
  "All decisions as CSV": "كل القرارات بصيغة CSV",
  "The corridor as a series": "الكوريدور سلسلةً زمنية",
  "Monetary Policy Committee statements, {from} to {to}": "بيانات لجنة السياسة النقدية، من {from} إلى {to}",
  "{n} statements, continuous from {from} to {to}. {h} increases, {c} cuts, {k} meetings that changed nothing":
    "البيانات: {n}، متصلة من {from} إلى {to}. قرارات الرفع: {h}، والخفض: {c}، والاجتماعات التي لم تغيّر شيئًا: {k}",
  ", and {u} older statements whose decision is in the PDF but not in any series CBE publishes":
    "، وبيانات أقدم قرارها مذكور في ملف PDF لا في أي سلسلة ينشرها البنك المركزي: {u}",
  ". Each one links back to CBE's own copy.": ". ويرتبط كل بيان بنسخة البنك المركزي نفسها.",
  "All|decisions": "الكل",
  "Increases": "رفع",
  "Cuts": "خفض",
  "No change": "بلا تغيير",
  "Unrecorded": "غير مسجّل",
  "“Wording changed” compares each statement with the one before it, character by character. A committee that holds rates but rewrites half its statement is doing something. Rates marked":
    "«تغيّر الصياغة» يقارن كل بيان بالبيان الذي سبقه، حرفًا بحرف. فاللجنة التي تثبّت الأسعار لكنها تعيد كتابة نصف بيانها تفعل شيئًا. والأسعار الموسومة بعبارة",
  "were not machine-readable in the statement itself and have been recovered from CBE's published corridor history.":
    "لم تكن قابلة للقراءة آليًا في البيان نفسه، واستُعيدت من سجل الكوريدور الذي ينشره البنك المركزي.",

  /* ---------- the money market ---------- */
  "6 month": "6 أشهر",
  "9 month": "9 أشهر",
  "For a domestic market desk": "لمكتب السوق المحلية",
  "The money market, on one screen": "سوق النقد في شاشة واحدة",
  "Where overnight money cleared inside the CBE corridor, the interbank tenors and their volumes, and the EGP bill curve with bid to cover at every tenor. Daily interbank since June 2010, every EGP bill auction since June 2002":
    "أين سُوّيت أموال الليلة الواحدة داخل كوريدور البنك المركزي، وآجال ما بين البنوك وأحجامها، ومنحنى أذون الخزانة بالجنيه مع نسبة التغطية عند كل أجل. بيانات يومية لما بين البنوك منذ يونيو 2010، وكل عطاء لأذون الخزانة بالجنيه منذ يونيو 2002",
  ", CONIA at {v} on {d}": "، وكونيا عند {v} في {d}",
  "Open the money market page →": "افتح صفحة سوق النقد ←",
  "CONIA, {d}": "كونيا، {d}",
  "Corridor {lo} to {hi}, so overnight money cleared on the midpoint":
    "الكوريدور من {lo} إلى {hi}، وسُوّيت أموال الليلة الواحدة عند منتصفه",
  "Corridor {lo} to {hi}, so overnight money cleared {x} above the midpoint":
    "الكوريدور من {lo} إلى {hi}، وسُوّيت أموال الليلة الواحدة أعلى من منتصفه بمقدار {x}",
  "Corridor {lo} to {hi}, so overnight money cleared {x} below the midpoint":
    "الكوريدور من {lo} إلى {hi}، وسُوّيت أموال الليلة الواحدة أدنى من منتصفه بمقدار {x}",
  "weighted average": "المتوسط المرجّح",
  "Every decision back to June 2005 with the statement text, and what changed in the wording each time.":
    "كل القرارات منذ يونيو 2005 مع نص البيان، وما تغيّر في الصياغة كل مرة.",
  "Where overnight money sits in the corridor.": "أين تقع أموال الليلة الواحدة داخل الكوريدور.",
  "The floor, the ceiling, and where the pound actually funded between them. Underneath it: the interbank tenors with the volumes behind them, and what the government paid at every EGP bill auction. All of it CBE's own numbers, updated daily.":
    "الأرضية والسقف، وأين تموّل الجنيه فعلًا بينهما. وتحت ذلك: آجال ما بين البنوك والأحجام التي وراءها، وما دفعته الحكومة في كل عطاء لأذون الخزانة بالجنيه. كلها أرقام البنك المركزي نفسه، تُحدَّث يوميًا.",
  "Overnight and short tenors": "الليلة الواحدة والآجال القصيرة",
  "What money cost, and how much of it moved": "كم كلّف المال، وكم منه تحرّك",
  "Rates first, then the volumes underneath them, because a rate on thin volume is not the same fact as a rate on heavy volume. The last column is where the current reading sits between that series' own record low and high.":
    "الأسعار أولًا، ثم الأحجام تحتها، لأن سعرًا على حجم ضئيل ليس الحقيقة نفسها التي يمثلها سعر على حجم كبير. ويبيّن العمود الأخير موقع القراءة الحالية بين أدنى وأعلى مستوى سجّلته السلسلة نفسها.",
  "EGP treasury bills": "أذون الخزانة بالجنيه",
  "The curve, and who turned up for it": "المنحنى، ومن تقدّم إليه",
  "The latest auction CBE has published at each tenor, dated by the bill's issue date, which is why it can run a few days ahead of today. Bid to cover is the column that says whether the tenor was wanted: submitted over accepted, computed here because CBE publishes the two amounts and never the ratio. The 3-month runs back to June 2002, the 6-month to July 2002, the 12-month to April 2004 and the 9-month to October 2008, and the record-level table behind these carries the ISIN, the maturity date and the amount CBE asked for as well.":
    "آخر عطاء نشره البنك المركزي لكل أجل، مؤرَّخًا بتاريخ إصدار الإذن، ولهذا قد يسبق اليوم ببضعة أيام. ونسبة التغطية هي العمود الذي يقول هل كان الأجل مطلوبًا: المبلغ المقدَّم مقسومًا على المقبول، محسوبة هنا لأن البنك المركزي ينشر المبلغين ولا ينشر النسبة. يعود أجل 3 أشهر إلى يونيو 2002، و6 أشهر إلى يوليو 2002، و12 شهرًا إلى أبريل 2004، و9 أشهر إلى أكتوبر 2008، ويحمل الجدول التفصيلي وراءها أيضًا رمز ISIN وتاريخ الاستحقاق والمبلغ الذي طلبه البنك المركزي.",
  "Tenor": "الأجل",
  "Yield": "العائد",
  "Accepted range": "مدى المقبول",
  "Bid to cover": "نسبة التغطية",
  "Submitted, EGP bn": "المقدَّم، مليار جنيه",
  "Accepted, EGP bn": "المقبول، مليار جنيه",
  "Issued": "الإصدار",
  "Take it to your desk": "خذها إلى مكتبك",
  "All the series on this page, without the page": "كل سلاسل هذه الصفحة، من دون الصفحة",
  "No key and no account. Every endpoint is a static file on the same host as this page, with no rate limit that we set.":
    "بلا مفتاح ولا حساب. كل نقطة وصول ملف ثابت على الخادم نفسه الذي يستضيف هذه الصفحة، بلا حدّ للطلبات من جهتنا.",
  "the overnight fixing, every observation": "تثبيتة الليلة الواحدة بكل مشاهداتها",
  "the whole money market, straight into Python": "سوق النقد كله مباشرة في بايثون",
  "every EGP bill auction since 2002": "كل عطاء لأذون الخزانة بالجنيه منذ 2002",
  "Open market operations": "عمليات السوق المفتوحة",
  "The liquidity management CBE does itself is published as auction tables rather than as series, so it is not charted here, but it is in the record-level download: deposit auctions at the corridor rate, fixed-rate and variable-rate deposit auctions, fixed-rate and variable-rate repo auctions, and every EGP bill auction with its ISIN. One CSV per table, inside":
    "إدارة السيولة التي يجريها البنك المركزي بنفسه تُنشر جداول عطاءات لا سلاسل، ولذلك لا تُرسم هنا، لكنها في التنزيل التفصيلي: عطاءات الودائع بسعر الكوريدور، وعطاءات الودائع بسعر ثابت وبسعر متغير، وعطاءات إعادة الشراء بسعر ثابت وبسعر متغير، وكل عطاء لأذون الخزانة بالجنيه مع رمز ISIN الخاص به. ملف CSV لكل جدول، داخل",
  "Every rate series": "كل سلاسل أسعار الفائدة",
  "Everything else": "كل ما عدا ذلك",
  "Where the record is not clean": "حيث لا يكون السجل نظيفًا",
  "Two prints for the same day": "قيمتان لليوم نفسه",
  "On 27 November 2023 CBE published two different interbank overnight rates for the same session, 19.395 and 19.404, and two different overnight volumes 21 billion pounds apart, 264,437 and 243,187 million. Both are kept: the site shows one and records the other, and the same is true of every other conflict of this kind in the archive.":
    "في 27 نوفمبر 2023 نشر البنك المركزي سعرين مختلفين لليلة الواحدة بين البنوك للجلسة نفسها، 19.395 و19.404، وحجمين مختلفين لليلة الواحدة يفصل بينهما 21 مليار جنيه، 264,437 و243,187 مليونًا. والاثنان محفوظان: يعرض الموقع أحدهما ويسجّل الآخر، وكذلك الحال في كل تعارض آخر من هذا النوع في الأرشيف.",
  "The full list is": "القائمة الكاملة في الملف",
  "in the repository.": "في المستودع.",
  "How this is built, and what is not in it →": "كيف بُني هذا، وما ليس فيه ←",

  /* ---------- the pre-rendered bodies and chrome (prerender.py) ---------- */
  "Search Miqyas": "ابحث في مقياس",
  "Results": "النتائج",
  "{v} as of {d}, from the Central Bank of Egypt. {n} readings covering {from} to {to}.":
    "{v} حتى {d}، من البنك المركزي المصري. عدد القراءات: {n}، من {from} إلى {to}.",
  "How this is worked out:": "طريقة الحساب:",
  "The last two dozen readings": "آخر أربع وعشرين قراءة",
  "The whole series as JSON": "السلسلة كاملة بصيغة JSON",
  "CSV, Parquet, SQLite and the API": "CSV وParquet وSQLite وواجهة البيانات",
  "The CBE page this came from": "صفحة البنك المركزي التي جاءت منها",
  "{n} series, from the Central Bank of Egypt, updated daily.": "السلاسل: {n}، من البنك المركزي المصري، تُحدَّث يوميًا.",
  "Showing the first 400 of {n}.": "تظهر أول 400 من أصل {n}.",
  "Document": "وثيقة",
  "{n} pages": "الصفحات: {n}",
  "The title is available in English only, as CBE lists it.": "العنوان متاح بالإنجليزية فقط، كما يدرجه البنك المركزي.",
  "Published by the Central Bank of Egypt, indexed here so its text can be searched and quoted.":
    "نشرها البنك المركزي المصري، ومفهرسة هنا ليمكن البحث في نصها والاقتباس منه.",
  "The document on cbe.org.eg": "الوثيقة على موقع البنك المركزي",
  "Search the whole archive": "ابحث في الأرشيف كله",
  "This document is a scan with no text layer of its own. Its text was read by OCR and is not as reliable as the rest.":
    "هذه الوثيقة صورة ممسوحة ضوئيًا بلا طبقة نصية خاصة بها. قُرئ نصها بالتعرّف الضوئي على الحروف، وهو أقل موثوقية من باقي النصوص.",
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
 *
 * Only a pipe with no space before it is a disambiguator. " | Miqyas" in a
 * page title is part of the text, and cutting there left every pre-rendered
 * English title ending in a space with the site's name gone.
 */
function t(english) {
  const cut = english.search(/[^ ]\|/) + 1;
  if (!RTL) return cut < 1 ? english : english.slice(0, cut);
  if (Object.prototype.hasOwnProperty.call(AR, english)) return AR[english];
  return cut < 1 ? english : english.slice(0, cut);
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
