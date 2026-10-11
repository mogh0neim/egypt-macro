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
