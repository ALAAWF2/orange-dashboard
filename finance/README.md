# واجهة منصة Finance

هذا المجلد يحتوي **أصول الواجهة فقط** للمنصة المالية:

| الملف | الغرض |
|---|---|
| `finance-api.js` | عميل API محمي يعتمد session الحالية ولا يخزن النتائج |
| `finance-dashboard.js` | تحميل البيانات، عرض الجداول وفتح ملف المعرض |
| `finance.css` | تصميم RTL، الجداول، البطاقات وdrawer ملف المعرض |

الصفحة المستهلكة هي [`../finance_dashboard.html`](../finance_dashboard.html). الدليل
التشغيلي الكامل في
[`../../finance_exploration/README.md`](../../finance_exploration/README.md).

## حدود هذا المجلد

- لا تضع `finance_data.json` أو export أو cache أو snapshot ماليًا هنا.
- لا تضع أسماء عملاء أو بيانات بنك أو معلومات اتصال موردين.
- كل البيانات تأتي وقت الطلب من `/api/finance/*` عبر Flask.
- الوصول الفعلي يفرضه الخادم بدور `Finance` أو `Admin`؛ إخفاء التبويب وحده ليس حماية.

## قواعد العرض الحالية

- واجهة عربية RTL مع Orange `#fe7900`.
- كل الأرقام والتواريخ تظهر بأرقام إنجليزية.
- المبالغ تظهر من دون لاحقة `ر.س`؛ العملة تظهر كرمز مستقل مثل `SAR` عند الحاجة.
- سجل فواتير الموردين بعرض كامل، وسجل الإيجارات تحته لتجنب كسر الأعمدة.
- خلية المورد تعرض الاسم أولًا، ثم رقم الحساب وشروط الدفع بحجم أصغر.
- المبلغ يعرض العملة والضريبة تحته، ويظهر أمر الشراء في عمود مستقل عند توفره.
- الجداول تسمح بالتمرير على الشاشات الصغيرة فقط، لا على شاشة المكتب الطبيعية.

## ربط المورد في الواجهة

الواجهة لا تخمن اسم المورد. الخدمة تعيد `vendor_name` بعد ربط:

```text
(data_area_id, invoice_account)
    → (data_area_id, vendor_account_number)
```

وإذا تعذر الاسم، يُستخدم رقم الحساب كـfallback واضح.

## التطوير والتحقق

بعد تعديل JavaScript أو CSS:

1. ارفع query version للملفات الثلاثة في `finance_dashboard.html`.
2. افحص JavaScript:

   ```powershell
   node --check allorangedashboard\finance\finance-dashboard.js
   ```

3. شغّل عقد المنصة:

   ```powershell
   .venv\Scripts\python.exe -m pytest tests\test_finance_platform_contract.py -q
   ```

4. افحص بصريًا عبر `tests/finance_showroom_detail_playwright.py` بعد التأكد أنه سيقرأ
   قاعدة البيانات المطلوبة فقط.

الإصدار الحالي لأصول المنصة في الصفحة: `20260813-10`.
