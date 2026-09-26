# نشر مسابقة اليوم الوطني 96 على Cloudflare

هذا المجلد جاهز للنشر على **Cloudflare Pages**، مع باك-إند حقيقي (Cloudflare Pages Functions)
يستقبل الاسم/الجوال/البريد/المسار/الوصف في **D1** (قاعدة بيانات SQL)، ويستقبل الملفات والصور في **R2** (تخزين ملفات).

## الملفات
- `index.html` — الصفحة نفسها (بها النموذج بخطواته الأربع)
- `functions/api/submit.js` — الدالة التي تستقبل الإرسال (POST /api/submit)
- `schema.sql` — بنية جدول قاعدة البيانات
- `wrangler.toml` — إعدادات للتجربة المحلية عبر Wrangler CLI (اختياري)

## خطوات النشر عبر لوحة تحكم Cloudflare (بدون سطر أوامر)

### 1) إنشاء قاعدة بيانات D1
1. من لوحة Cloudflare: **Workers & Pages → D1 → Create database**
2. سمّها مثلاً `national-day-96-db`
3. افتح تبويب **Console** داخل القاعدة، والصق محتوى ملف `schema.sql` ونفّذه (Execute) لإنشاء الجدول

### 2) إنشاء مخزن R2 للملفات
1. من لوحة Cloudflare: **R2 → Create bucket**
2. سمّه مثلاً `national-day-96-uploads`

### 3) رفع الموقع كـ Pages
1. **Workers & Pages → Create → Pages → Upload assets** (أو اربطه بمستودع GitHub إن كان لديك)
2. ارفع محتوى هذا المجلد كاملاً (بما فيه مجلد `functions/`) — Cloudflare يتعرف على `functions/api/submit.js` تلقائياً كنقطة API

### 4) ربط D1 و R2 بمشروع الـ Pages
1. داخل مشروع الـ Pages: **Settings → Functions**
2. تحت **D1 database bindings** أضف:
   - Variable name: `DB`
   - D1 database: اختر `national-day-96-db`
3. تحت **R2 bucket bindings** أضف:
   - Variable name: `UPLOADS`
   - R2 bucket: اختر `national-day-96-uploads`
4. احفظ، ثم أعد النشر (**Retry deployment** أو ادفع تحديث جديد) — الربط لا يصبح فعالاً إلا بعد إعادة نشر

## بعد النشر
- النموذج يرسل تلقائياً إلى `/api/submit` على نفس الدومين — لا حاجة لتعديل أي رابط
- كل مشاركة تُحفظ كصف في جدول `entries` بقاعدة D1، وأي ملف مرفق يُحفظ في R2 تحت المسار `entries/<uid>/<اسم الملف>`
- رقم المشاركة الظاهر للمستخدم هو عدد الصفوف في الجدول لحظة الإرسال

## حدود وملاحظات
- الحد الأقصى لحجم الملف الواحد مضبوط حالياً على **20 ميجابايت** (يمكن تعديله من `MAX_FILE_BYTES` في `submit.js`)
- لا توجد حالياً حماية من الإرسال الآلي (Bot/Spam) — يمكن لاحقاً إضافة **Cloudflare Turnstile** كخطوة تحقق قبل الإرسال إن رغبت
- لعرض المشاركات المحفوظة، يمكن لاحقاً إضافة صفحة إدارة بسيطة تقرأ من D1 (لم يتم بناؤها بعد)
