# Arabic UI strings pending native review

These `src/messages/ar.json` keys were written by Claude (reasonable
Modern Standard Arabic, not a native speaker) and have not yet been
reviewed by one. They used to carry a visible `[NEEDS NATIVE REVIEW]`
suffix directly in the string value — which meant it rendered on the
live page for real users, which is worse than the problem it was meant
to flag. That suffix has been stripped from every value below; this
file is the tracking list now. See `docs/DECISIONS.md` "Dark-first
design system" for how this was found, and "Arabic content gating" for
how this differs from the (properly access-controlled) story-template
review flow.

Check each one off once a native Arabic speaker has read it in context
(ideally on the actual rendered page, not just this list) and confirmed
it reads naturally:

- [ ] `brand.tagline`: كل طفل بطل قصته الخاصة.
- [ ] `marketing.hero.eyebrow`: قصص مصورة مخصصة للحضانات والمدارس والعلامات التجارية
- [ ] `marketing.hero.title`: اجعل كل طفل بطل قصة تعلّمه شيئًا حقيقيًا.
- [ ] `marketing.hero.body`: تصمم خيالي قصصًا مصورة مخصصة بعناية تساعد الحضانات والمدارس والعيادات والعلامات التجارية على تعليم قيم مثل الغذاء الصحي والصدق وغسل اليدين، باسم الطفل وشخصيته الرمزية ولغته.
- [ ] `marketing.hero.ctaSecondary`: شاهد كيف يعمل
- [ ] `marketing.trustBar`: مصمم لحضانات ومدارس وعيادات وعلامات تجارية للأطفال في دبي
- [ ] `marketing.familyCallout.title`: هل أنت أحد الوالدين؟
- [ ] `marketing.familyCallout.body`: أنشئ حساب عائلة مجانيًا واصنع قصة مخصصة لطفلك، أو أرسلها كهدية.
- [ ] `marketing.useCases.title`: منصة واحدة، مناسبات متعددة
- [ ] `auth.signIn.title`: تسجيل الدخول إلى مؤسستك
- [ ] `auth.signUp.title`: أنشئ مؤسستك
- [ ] `children.edit`: تعديل
- [ ] `children.empty`: لا يوجد أطفال بعد. أضف طفلك الأول أو استورد قائمة الفصل.
- [ ] `children.table.firstNameEn`: الاسم الأول (EN)
- [ ] `children.table.lastNameEn`: اسم العائلة (EN)
- [ ] `children.table.firstNameAr`: الاسم الأول (AR)
- [ ] `children.table.lastNameAr`: اسم العائلة (AR)
- [ ] `children.form.firstName`: الاسم الأول (EN)
- [ ] `children.form.lastName`: اسم العائلة (EN، اختياري)
- [ ] `children.form.arabicFirstName`: الاسم الأول (AR، اختياري)
- [ ] `children.form.arabicLastName`: اسم العائلة (AR، اختياري)
- [ ] `contactPage.body`: لديك سؤال أو مشكلة في إحدى القصص أو تحتاج مساعدة بخصوص حساب حضانتك؟ راسلنا على واتساب وسنرد عليك.
- [ ] `contactPage.unavailable`: التواصل عبر واتساب غير مُفعّل بعد — يرجى المحاولة لاحقًا.
- [ ] `contactPage.responseTime`: نرد عادةً خلال ساعات قليلة خلال أوقات العمل في الإمارات.
- [ ] `consent.requestTitle`: طلب موافقة ولي الأمر
- [ ] `consent.parentBody`: تودّ {orgName} إنشاء كتاب قصة مخصص لـ {childName}. يُستخدم الاسم الأول للطفل وشخصية رمزية كرتونية تختارها — وليس صورة حقيقية إلا إذا وافقت على ذلك بشكل منفصل.
- [ ] `consent.parentPhotoNotice`: يتضمّن هذا الطلب أيضًا استخدام صورة لـ {childName}. في حال موافقتك، ستقوم {orgName} برفع صورة مرجعية تُرسَل بشكل آمن إلى الذكاء الاصطناعي من Google Gemini لإنشاء شخصية رسومية بأسلوب كرتوني للقصة. لا تُعرض الصورة نفسها أو تُطبع أو تُشارك كصورة أبدًا — تُستخدم فقط لتوجيه الرسم. يمكنك سحب هذه الموافقة في أي وقت، مما يؤدي إلى حذف الصورة فورًا.
- [ ] `consent.withdrawConfirm`: سحب الموافقة سيوقف إنشاء قصص جديدة وسيحذف ملفات قصة هذا الطفل الحالية.

`children.form.arabicFirstNameHint` was already unmarked (added after
the marker convention started) and is included here for completeness,
not because it changed:

- [ ] `children.form.arabicFirstNameHint`: يُستخدم بدلاً من الاسم الأول أعلاه عند إنشاء قصة باللغة العربية.

Added with the toast-notification system (never carried a visible
suffix - written straight into this list instead):

- [ ] `stories.regenerateStartedTitle`: جارٍ إعادة إنشاء هذه الصفحة
- [ ] `stories.regenerateStartedBody`: سنستبدلها بالرسمة الجديدة فور جاهزيتها — تتحدّث هذه الصفحة تلقائيًا.
- [ ] `stories.regenerateFailedTitle`: تعذّر بدء إعادة الإنشاء
- [ ] `stories.downloadFailedTitle`: تعذّر تحميل ملف PDF
- [ ] `stories.downloadFailedBody`: الملف غير جاهز بعد، أو حدث خطأ ما. حاول مرة أخرى بعد قليل.
- [ ] `stories.bulkZipFailedTitle`: تعذّر تحميل ملف ZIP
- [ ] `stories.bulkZipFailedBody`: الملف غير جاهز بعد، أو حدث خطأ ما. حاول مرة أخرى بعد قليل.
- [ ] `stories.createFailedTitle`: تعذّر إنشاء القصة
- [ ] `staffPage.body`: امنح فريق حضانتك حسابات خاصة بهم ليتمكن أكثر من شخص من إضافة الأطفال وإنشاء القصص. هذا لا يؤثر على الفوترة — المالك فقط (أنت) يمكنه تغيير الباقة أو بيانات الدفع.
- [ ] `staffPage.inviteTitle`: دعوة موظف
- [ ] `staffPage.roleOwnerDesc`: صلاحية كاملة، بما في ذلك الفوترة ودعوة الموظفين. يوجد واحد فقط لكل حضانة (من قام بالتسجيل).
- [ ] `staffPage.roleAdminDesc`: كل ما يستطيع الموظف فعله، بالإضافة إلى حذف ملف طفل.
- [ ] `staffPage.roleStaffDesc`: إضافة الأطفال، إنشاء القصص واعتمادها، طلب موافقة ولي الأمر.
