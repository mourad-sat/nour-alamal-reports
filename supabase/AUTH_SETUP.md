# تسجيل الدخول وتفعيل المدير الأول — جمعية نور الأمل

**المشروع المعتمد:** `nour-alamal-reports-db` (`nkrbnwvccnsanetmmuqm`) في **NOUR-ALAMAL Org**. لا تستخدم أي مشروع سابق.

## ما أنجزناه

- صفحة `/login` (وتعمل كذلك عبر `/login.html`) مرتبطة بـ Supabase Auth بواسطة **مفتاح publishable** فقط.
- لا توجد صفحة تسجيل حسابات مفتوحة؛ الدخول مخصص للموظفين المدعوين.
- التحقق من هوية المستخدم يتم عبر `auth.getUser()` ومن الدور الفعلي داخل `public.staff_profiles` الذي يحميه RLS.
- الحساب الذي ليس لديه ملف موظف نشط يرى رسالة «في انتظار تفعيل حسابك»، ولا يُسمح له بالاطلاع على تقارير الجمعية.
- لا نضع كلمات مرور أو مفاتيح secret/service_role داخل GitHub أو Vercel.
- **التقارير الحالية ما زالت تجريبية محفوظة في localStorage** على الصفحة الرئيسية؛ لم تُنقل إلى قاعدة البيانات بعد.

## خطوات تفعيل المدير الأول من لوحة Supabase

1. افتح [إعدادات الروابط](https://supabase.com/dashboard/project/nkrbnwvccnsanetmmuqm/auth/url-configuration).
2. عيّن **Site URL** إلى `https://nour-alamal-reports.vercel.app` وأضف **Redirect URL** `https://nour-alamal-reports.vercel.app/login` (يمكن إضافة المسار `/login.html` إذا لزم).
3. افتح [Authentication → Users](https://supabase.com/dashboard/project/nkrbnwvccnsanetmmuqm/auth/users) ثم اختر **Add user → Send invitation**، وأدخل البريد الإلكتروني الخاص بالمدير الأول. لا تشارك كلمة مروره معي.
4. افتح رابط الدعوة في بريد المدير؛ يجب أن يعود إلى `/login`. من الصفحة عيّن كلمة مرور قوية لا تقل عن 12 حرفًا، وأكمل التحقق من البريد.
5. من [SQL Editor](https://supabase.com/dashboard/project/nkrbnwvccnsanetmmuqm/sql/new)، افتح الملف `supabase/bootstrap_first_admin.sql` واستبدل `REPLACE_WITH_CONFIRMED_ADMIN_EMAIL` بالبريد الذي **تم التحقق منه**. شغّل SQL **مرة واحدة فقط** من لوحة المشروع الجديد.
6. افتح `/login` مجددًا وحدّث الصلاحيات؛ يجب أن تظهر صفة **الإدارة**. إن لم تظهر، لا تنتقل إلى إدخال بيانات حقيقية.

الملف الخاص بالتفعيل يفشل ولا يغيّر البيانات إذا لم يعثر على حساب مدعو وبريد مؤكد، ويرفض التعديل الصامت على ملف موظف موجود بالفعل.

## إعدادات أمنية مهمة

- راجع [إعدادات Auth Providers](https://supabase.com/dashboard/project/nkrbnwvccnsanetmmuqm/auth/providers) وعطّل التسجيل الذاتي للمستخدمين إذا كان المشروع مخصصًا للدعوات فقط.
- لا تستخدم مفتاح `sb_secret_` أو `service_role` في المتصفح أو ملفات GitHub. الملف `supabase-config.mjs` يحتوي **مفتاحًا عامًا publishable** مصممًا للعمل مع RLS.
- تحتاج رسائل الدعوة والإعادة إلى إعداد بريد صالح من Supabase وقد تخضع لحدود الإرسال.
- اختبر الحسابات التجريبية ومراكز مختلفة وأدوارًا مختلفة، وتأكد أن المستخدم غير المعيّن لا يرى أية بيانات.
- لا تنقل بيانات المستفيدين أو القاصرين إلى التطبيق حتى تنتهي اختبارات الأمان.

## المصادر

- [Supabase: Inviting users](https://supabase.com/docs/guides/auth/users#inviting-users)
- [Supabase: Password-based Auth](https://supabase.com/docs/guides/auth/passwords)
- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api)

**تحديث الصلاحيات:** بعد إضافة حساب موظف من الإدارة، اضغط «تحديث الصلاحيات» في صفحة الدخول. هذا لا يعطي المستخدم صلاحيات تلقائية؛ الجدول والسياسات في قاعدة البيانات هما المرجع.
