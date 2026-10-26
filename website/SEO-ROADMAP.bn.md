# Foodbela: নেত্রকোনা সার্চ ও ওয়েব অর্ডার পরিকল্পনা

## বর্তমান অবস্থা ও এই পরিবর্তন

সাইটটি Express/EJS দিয়ে HTML তৈরি করে; JavaScript চালানো ছাড়াই মূল কনটেন্ট পাওয়া যায়। canonical, Open Graph, robots.txt, sitemap এবং এলাকাভিত্তিক পেজ আছে। `/restaurants` বর্তমানে পার্টনার আবেদন পেজ; কাস্টমারের রেস্টুরেন্ট ক্যাটালগ নয়। ওয়েব checkout নেই।

এই পরিবর্তনে ভুল ঢাকা/মিরপুর fallback coverage সরানো হয়েছে; লাইভ হোমপেজে থাকা Netrakona active ও Mohongonj upcoming অবস্থার সঙ্গে fallback মিলেছে। নমুনা ফোন ও অনির্ধারিত ঠিকানা schema-তে প্রকাশ হবে না। কার্যকর নয় এমন SearchAction ও অপ্রমাণিত “Best restaurants” শিরোনাম সরানো হয়েছে। প্রতিবার sitemap দেখলে সব পেজের lastmod বদলাবে না। Home ও About-এ সেটিংস থেকে দৃশ্যমান প্রশ্নোত্তর এবং তার সঙ্গে মেলা JSON-LD যোগ হয়েছে।

Backend-এর `/website/settings` থেকে পাওয়া মান fallback-কে override করে। তাই production admin settings-এ পুরোনো title, description, ঠিকানা বা coverage থাকলে সেটিও ঠিক করতে হবে। এই কোড পরিবর্তন production deployment বা বাইরের অ্যাকাউন্টের configuration সম্পন্ন করে না।

## প্রথম অগ্রাধিকার: তথ্য ও পরিমাপ

1. Admin settings-এ বাস্তব অফিসের ঠিকানা, শহর, সাপোর্ট নম্বর, সাপোর্ট ইমেইল, canonical `https://foodbela.com`, এবং অফিসিয়াল Facebook page URL দিন। অফিস না থাকলে কাল্পনিক ঠিকানা দেবেন না।
2. Homepage title প্রস্তাব: “Foodbela | নেত্রকোনায় খাবার ডেলিভারি — Netrakona Food Delivery”। Description-এ প্রকৃত কভারেজ ও অর্ডার করার পদ্ধতি লিখুন।
3. Search Console-এ domain ownership যাচাই, `/sitemap.xml` submit এবং homepage ও নেত্রকোনা পেজ URL Inspection করুন। বিদ্যমান `googleSiteVerification` setting প্রয়োজনে ব্যবহার করা যায়। Bing Webmaster Tools-এও যাচাই করুন।
4. যোগ্যতা মেনে Google Business Profile claim/verify করুন। প্রকৃত business name, উপযুক্ত category, service area, সময়, ফোন ও website দিন। শুধু অনলাইন ব্যবসার eligibility আলাদা করে যাচাই করুন।
5. Facebook About, পরিচিতি, যোগাযোগ, website এবং অর্ডার নির্দেশনা পূরণ করুন। Website settings-এর facebookUrl থেকে structured data-র sameAs ও footer link তৈরি হয়। Page থেকে website-এ ফেরত লিংক দিন।
6. Facebook link-এ UTM ব্যবহার করুন, যেমন `?utm_source=facebook&utm_medium=social&utm_campaign=netrakona`। Search Console clicks/impressions, app-download clicks ও completed orders আলাদা মাপুন।

## দ্বিতীয় অগ্রাধিকার: খুঁজে পাওয়া থেকে অর্ডার

- Customer navigation-এ রেস্টুরেন্ট ও মেনু আগে রাখুন; পার্টনার আবেদন আলাদা label-এ দিন।
- প্রতিটি বাস্তব রেস্টুরেন্টের আলাদা server-rendered URL: পরিচিতি, মেনু, দাম, availability, ঠিকানা, সময়, ছবি, coverage ও order button। আসল ডেটা ছাড়া রেটিং বা দাম বানানো যাবে না।
- নেত্রকোনা landing page-এ নির্দিষ্ট সেবা এলাকা, অর্ডার করার নিয়ম, চার্জ কীভাবে নির্ধারিত হয়, বাস্তব partner restaurants এবং support দিন। Netrokona/Netrakona/নেত্রকোনা বানান স্বাভাবিকভাবে ব্যবহার করুন।
- একই লেখা দিয়ে অসংখ্য এলাকা বা খাবারের পেজ বানাবেন না। একটি cuisine page তখনই তৈরি করুন যখন বাস্তব মেনু ও স্বতন্ত্র উপকারী তথ্য আছে।
- প্রথম স্ক্রিনে খাবার খোঁজা, ঠিকানা এবং স্পষ্ট order action রাখুন। বর্তমান animation ও auto app-install popup মোবাইলে পরীক্ষা করে প্রয়োজনমতো কমান। Web ordering হলে app install বাধ্যতামূলক করবেন না।
- বাস্তব restaurant/food photography, যথাযথ image sizes, নিচের ছবিতে lazy loading, readable contrast এবং keyboard navigation যাচাই করুন। Lighthouse/PageSpeed-এর বাস্তব ফল ধরে performance পরিবর্তন করুন।
- Refund/cancellation, delivery policy এবং customer support স্পষ্ট করুন; login/cart/checkout/account পেজ index করবেন না।

## ওয়েব অর্ডারের সুপারিশ

ওয়েব অর্ডার নেওয়া যুক্তিযুক্ত: Google বা Facebook থেকে আসা মানুষকে প্রথম অর্ডারের আগে অ্যাপ ইনস্টল করতে না হলে ধাপ কমে। তবে আলাদা order database বা rider dispatch বানাবেন না; customer app-এর একই backend, pricing, restaurant availability ও order lifecycle ব্যবহার করুন।

প্রথম সংস্করণ: ঠিকানা → available restaurants → menu/options → cart → ফোন যাচাই → checkout → order status। Backend-এ delivery eligibility, stock, opening hours, দাম, delivery charge, discount এবং মোট বিল পুনরায় যাচাই করতে হবে। Retry-তে duplicate order ঠেকাতে idempotency এবং OTP abuse ঠেকাতে rate limiting লাগবে। বর্তমান backend সমর্থিত ও ব্যবসা অনুমোদিত payment method দিয়েই শুরু করুন। Online payment হলে server-side verification ও webhook idempotency ছাড়া paid দেখানো যাবে না।

শুরুতে নেত্রকোনার সীমিত কভারেজে চালু করে order success, restaurant acceptance, cancellation, delivery completion ও support load দেখুন। পরের ধাপে reorder, saved addresses, web notifications এবং প্রয়োজন হলে PWA। এই কাজের আগে existing customer endpoints ও authentication-এর আলাদা integration audit দরকার; এই SEO পরিবর্তনে checkout চালু হয়নি।

## স্থানীয় বিশ্বাস ও AI-তে তথ্য

আসল কাস্টমারকে সৎ review দিতে বলুন, প্রশ্নের উত্তর দিন, partner restaurant page থেকে website link নিন এবং স্থানীয় সংবাদ বা কমিউনিটিতে বাস্তব launch/partnership তথ্য প্রকাশ করুন। কেনা review ও spam backlink এড়িয়ে চলুন।

About/FAQ/contact/coverage-এ একই নির্ভরযোগ্য তথ্য রাখুন; পরিবর্তন হলে আপডেট করুন। Google-এর AI features-এর জন্য আলাদা বিশেষ schema লাগে না। FAQ markup তথ্যের গঠন বোঝাতে পারে, কিন্তু Foodbela-র FAQ rich result পাওয়ার প্রতিশ্রুতি নয়। কোনো ফাইল, schema বা crawler setting দিয়ে সব AI-কে Foodbela সুপারিশ করতে বাধ্য করা যায় না।

## বাস্তবায়নের ক্রম

- প্রথম ধাপ: তথ্য ঠিক করা, এই পরিবর্তন deploy, Search Console/Business Profile/Facebook configuration এবং baseline measurement।
- দ্বিতীয় ধাপ: restaurant/menu pages, customer-first homepage, mobile performance ও policy content।
- তৃতীয় ধাপ: একই backend দিয়ে সীমিত web checkout এবং end-to-end order verification।
- চলমান: search queries, conversion, restaurant acceptance, cancellations ও delivery performance ধরে উন্নয়ন। নির্দিষ্ট rank বা সময়ের গ্যারান্টি নেই।

## যাচাই ও সূত্র

`cd website` থেকে `npm test`। বর্তমান tests নমুনা contact schema বাদ পড়া, verified contact/social সংরক্ষণ, active-only sitemap, upcoming area noindex, unsafe text escaping এবং Home/About server rendering যাচাই করে। Browser visual QA, production deployment এবং Search Console access এই কাজের মধ্যে যাচাই করা হয়নি।

- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/docs/appearance/structured-data/local-business
- https://support.google.com/business/answer/7091
- https://developers.google.com/search/docs/essentials/spam-policies
