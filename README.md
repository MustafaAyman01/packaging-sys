# باك سيستم — نظام إدارة التعبئة والتغليف

نظام إدارة متكامل (مبيعات، مشتريات، مخزون، عملاء، موردين، موارد بشرية، تقارير) مبني بـ React + Vite، مع دعم اختياري للمزامنة السحابية عبر Supabase.

## التشغيل

```bash
npm install
cp .env.example .env   # ثم املأ بيانات Supabase (اختياري — بدونها يعمل النظام محليًا بـ localStorage)
npm run dev             # تشغيل بيئة التطوير
npm run build            # بناء نسخة الإنتاج (في مجلد dist/)
npm run preview          # معاينة نسخة الإنتاج محليًا
```

## هيكل المشروع

```
src/
├── main.jsx                 # نقطة الدخول — يحمّل CSS العام ويشغّل AppRoot
│
├── app/
│   ├── AppRoot.jsx           # التحكم بحالة الدخول (auth)، تحميل الصلاحيات، انتهاء الفترة التجريبية
│   └── App.jsx                # الهيكل الرئيسي: القائمة الجانبية، الشريط العلوي، التوجيه بين الصفحات
│
├── auth/                     # شاشات الدخول والتسجيل
│   ├── Login.jsx
│   ├── NoAccess.jsx
│   ├── RedeemInvite.jsx
│   └── TrialExpired.jsx
│
├── pages/                    # كل صفحة رئيسية في النظام = ملف مستقل
│   ├── Dashboard.jsx
│   ├── Products.jsx
│   ├── Stock.jsx
│   ├── Invoices.jsx
│   ├── Clients.jsx
│   ├── Suppliers.jsx
│   ├── Payments.jsx
│   ├── CashVouchers.jsx
│   ├── Expenses.jsx
│   ├── HR.jsx
│   ├── CsvImport.jsx
│   ├── Reports.jsx
│   ├── Settings.jsx
│   └── ActivityLog.jsx
│
├── components/                # مكونات UI مشتركة تُستخدم في أكثر من صفحة
│   ├── Toast.jsx
│   ├── StatusBadge.jsx
│   ├── ProductPicker.jsx       # combobox بحث عن منتج (مستخدم في الفواتير والمخزون)
│   └── StatementModal.jsx      # نافذة كشف حساب عميل/مورد
│
├── features/print/            # منطق توليد صفحات الطباعة (فاتورة، مرتبات، مديونيات، كشف حساب)
│   ├── printInvoice.js
│   ├── printPayroll.js
│   ├── printDebtsSheet.js
│   └── statement.js
│
├── services/                  # التعامل مع البيانات الخارجية
│   ├── storage.js              # حفظ/تحميل من localStorage (وضع عدم الاتصال بالسحابة)
│   ├── supabaseClient.js       # إعداد عميل Supabase وصلاحيات النظام الافتراضية
│   └── sync.js                 # منطق مزامنة كل جدول بيانات مع Supabase
│
├── constants/                  # قيم وبيانات ثابتة
│   ├── labels.js                # كل قواميس الترجمة (حالات، أنواع، طرق دفع...)
│   ├── emptyDataTemplate.js
│   ├── initialData.js           # بيانات تجريبية أولية (localStorage فقط)
│   └── importTargets.js         # إعداد استيراد CSV
│
├── utils/
│   └── format.js                # generateId, fc (تنسيق فلوس), fd (تنسيق تاريخ), today
│
└── styles/
    └── global.css                # كل الـ CSS (كان قبل كده string داخل الكود)
```

## ملاحظات معمارية

- **الكود اتحوّل لـ JSX حقيقي** بدل `React.createElement` المُصدَّر من قبل (باستخدام أداة تحويل تلقائية، ثم مراجعة يدوية للمخرجات).
- **مفاتيح Supabase بقت في `.env`** بدل ما تكون مكتوبة داخل الكود مباشرة — الملف `.env` مُستبعد من Git (`.gitignore`) لحماية المفاتيح.
- **الـ CSS بقى ملف حقيقي** (`src/styles/global.css`) بدل string يتم حقنه وقت التشغيل — ده بيحسّن الأداء (caching + لا يعاد بناء الـ style tag مع كل render).
- React مثبّت على نسخة **18** (بدل الافتراضي 19 في Vite) عشان يطابق السلوك اللي كان بيشتغل بيه النظام أونلاين عن طريق CDN.
- تحذير `chunk size` وقت الـ build طبيعي لحجم نظام بهذا الاتساع، ولو حبيت تقليله لاحقًا ممكن نستخدم `React.lazy()` لتحميل كل صفحة عند الحاجة بس (code splitting) — مش ضروري دلوقت، بس متاح كخطوة تحسين مستقبلية.
