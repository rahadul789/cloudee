# Foodbela ওয়েব অর্ডার

## কী তৈরি হয়েছে

`/` ও `/restaurants` এখন কাস্টমারের storefront। `/restaurants/:id`-তে বাস্তব মেনু, variants/add-ons ও কার্ট; `/checkout`-এ login, delivery address, voucher, backend quote, optional fees ও Cash/bKash; `/orders` ও `/orders/:id`-তে একই customer backend-এর অর্ডার এবং status polling আছে।

প্রথমবার লোকেশন প্যানেল খোলে। ইউজার GPS permission দিতে পারেন, ম্যাপে ট্যাপ/পিন drag করতে পারেন অথবা coordinates লিখতে পারেন। ডেলিভারির লিখিত ঠিকানা অবশ্যই নিশ্চিত করতে হবে; automatic address autocomplete/reverse geocoding যুক্ত করা হয়নি। Logged-in customer সংরক্ষিত ঠিকানা বাছাই করতে পারেন। Coverage এবং final order validation backend করে।

অ্যাপের মতো এক রেস্টুরেন্টের কার্ট থাকে; অন্য রেস্টুরেন্টে পরিবর্তনের আগে confirmation হয়। কার্ট এই browser-এ সংরক্ষিত; app/web cart synchronization যোগ হয়নি। Customer account ও orders একই backend-এর।

পুরোনো প্রচারণার হোমপেজ `/foodbela`-তে, restaurant partnership `/restaurant-partner`-এ। About, rider, coverage, download, contact ও privacy পেজ আছে; footer-এ লিংক দেওয়া হয়েছে। পুরোনো `/restaurants#apply` external bookmark থাকলে নতুন `/restaurant-partner#apply` দিয়ে আপডেট করুন—URL fragment server-এ পাঠানো হয় না।

## একই জোনভিত্তিক CMS

Browser-এর নির্বাচিত latitude/longitude `/shop-api/home` হয়ে existing `/customer/discovery/home`-এ যায়। Backend service-zone resolution ও `applyServiceAreaHomeCmsOverride` ব্যবহার করে; ওয়েব নিজে zone নির্বাচন বা CMS merge করে না।

বর্তমান হোমপেজে শুধু CMS-এর ছবিসহ deals/campaigns, food categories ও মূল restaurant list দেখানো হয়। Featured, personal offers, how-to-order, poll ও promotional modal ব্যবহারকারীর নির্দেশে হোম থেকে সরানো হয়েছে। Sidebar দিয়ে sorting, open/offer filter এবং cuisine search করা যায়। HTML text ও CMS routes sanitize করা হয়। Recognized app routes ওয়েবের equivalent-এ যায়; অপরিচিত route নিরাপদে restaurant catalog-এ যায়। Native push delivery বা app-এর পুরো visual parity এখানে নেই।

Live Foodbela branding অনুযায়ী `#ffb84c`, `#ffe05a`, `#f85b8a`, Outfit ও Noto Sans Bengali ব্যবহার করা হয়। Restaurant cards-এ প্রদর্শিত delivery charge ব্যবহারকারীর নির্দেশে `৳20`; checkout-এর প্রকৃত হিসাব existing backend quote থেকেই আসে। বন্ধ restaurant-এর ছবিতে dark overlay ও backend-এ পাওয়া reopening time দেখানো হয়, future-order button নেই। একই card renderer server HTML ও browser list-এ ব্যবহার হয়।

CMS-এর impression/click events-এর বিদ্যমান API ব্যবহার হয়। Backend-এর বর্তমান event schema zone ID গ্রহণ করে না; নতুন zone-wise web analytics dashboard তৈরি হয়নি।

আজকের deals-এর জন্য backend discovery response-এ `webDeals` যোগ হয়েছে: নির্বাচিত service zone-এর নিজস্ব explicit CMS override থাকলেই পাওয়া যায়; district বা global CMS-এ fallback হয় না। Carousel mode-এ slides খালি থাকলে পুরোনো single-image URL ব্যবহার করা হয় না। লোকেশন, সক্রিয় কনটেন্ট বা ছবি না থাকলে section লুকানো থাকে। Backend redeploy/restart না করা থাকলে নতুন field পাওয়া যাবে না এবং deals নিরাপদভাবে লুকানো থাকবে। Restaurant card-এর offer badge শুধু backend `activeOffers`-এর সংশ্লিষ্ট restaurant IDs থেকে আসে; area-wide offers প্রতিটি card-এ লাগানো হয় না।

মোবাইলে expandable filters ও fixed Home/Cart/Orders/Account navigation আছে। Restaurant detail-এ বড় cover, সীমিত requestAnimationFrame parallax, sticky restaurant name/category tabs ও smooth scrolling আছে। Reduced-motion preference মেনে animation বন্ধ থাকে।

## API ও session

`/shop-api` একটি allowlisted same-origin layer। Access ও refresh token encrypted HttpOnly, SameSite=Lax cookie-তে থাকে; browser JS/localStorage-এ token ফেরত দেওয়া হয় না। Production-এ Secure cookie হয়। Writes-এ custom header ও exact Origin যাচাই হয়; rate limiting আছে। Credentials refresh করা হয়, এবং API responses private/no-store।

Backend-এ verified client IP forward করা হয়; production topology-তে website একটি trusted reverse proxy-এর পেছনে এবং backend-এর `TRUST_PROXY_HOPS=1` ধরে compose configuration চলে। Arbitrary public access দিয়ে proxy trust বাড়াবেন না। বহু website replica হলে front-proxy/shared rate limiting যুক্ত করুন; বর্তমান website limiter process-local।

`clientOrderId` browser cart-এ রাখা হয়, যাতে একই order request retry করলে existing backend idempotency কাজে লাগে। Backend total নতুন quote-এ বদলালে আবার confirmation লাগে। Payment-এর query-string status বিশ্বাস করা হয় না; authenticated order response দিয়ে paid status যাচাই হয়।

## Configuration

Website environment:

```dotenv
BACKEND_API_BASE_URL=http://localhost:5000/api/v1
WEBSITE_BASE_URL=http://localhost:4200
WEBSITE_SESSION_SECRET=<at-least-32-random-characters>
ANDROID_APP_LINK_SHA256=<Play-app-signing-SHA-256>
```

Production-এ `WEBSITE_BASE_URL=https://foodbela.com` দিন। WEBSITE_SESSION_SECRET ছাড়া production process শুরু হবে না; সব website replica-তে একই stable secret দিতে হবে। `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` দিয়ে তৈরি করা যায়; প্রকৃত secret commit করবেন না।

Backend-এ `WEBSITE_PUBLIC_URL` প্রথম পক্ষের ওয়েব origin হবে। Local preview 4322 হলে `http://localhost:4322`; production-এ `https://foodbela.com`। bKash initiation-এ `clientPlatform=web` session snapshot-এ থাকে এবং callback শেষে `/payment-return`-এ ফেরে। App checkout-এর পুরোনো return অপরিবর্তিত। Backend restart/redeploy ছাড়া নতুন return logic চালু হবে না।

Docker Compose এই তিনটি website configuration ও backend return origin pass করে। Readiness-এর জন্য `/healthz` ব্যবহার করা হয়, যাতে homepage/backend load healthcheck বন্ধ না করে।

## Android App Links

Customer Expo config এবং বর্তমান Android manifest-এ `https://foodbela.com/`, `/restaurants/*`, `/orders/*` intent filters যোগ হয়েছে। `app/+native-intent.tsx` website root-কে app tabs-এ এবং valid restaurant/order URL-কে সংশ্লিষ্ট screen-এ নেয়। Payment-return ও marketing URLs app-এর জন্য claim করা হয়নি।

`ANDROID_APP_LINK_SHA256`-তে Play Console-এর **App signing** fingerprint দিন; upload/debug certificate দিয়ে Play build verification হবে না। Fingerprint না দিলে `/.well-known/assetlinks.json` 503 দেয়—কাল্পনিক certificate প্রকাশ হয় না। Website ও app নতুন build publish হওয়ার পর verification পরীক্ষা করতে হবে। Native directory regenerate করলে Expo config থেকে filters পুনরায় তৈরি হবে।

Android visitor-এর জন্য intent button আছে: installed app অথবা Play Store fallback। Browser-এ typed URL থেকে কোনো gesture ছাড়া app/store launch নিশ্চিত করা হয় না। Facebook in-app browser-সহ বাস্তব browser testing বাকি।

## পরীক্ষা

- Website: `npm test` — SSR public menu, preserved pages, private noindex, cookie/CSRF boundary, CMS coordinates, quote failure, order retry, web payment marker, refresh concurrency, App Link certificate ও cart selection tests।
- Backend: `node node_modules/jest/bin/jest.js --runInBand tests/customer-payment-return.test.ts tests/order-flow-guards.test.ts`; `npm run typecheck`।
- Customer app: `node node_modules/jest/bin/jest.js --runInBand src/lib/native-intent.test.ts`।
- `node tests/preview.cjs` চালালে 4321-এ isolated fixture preview; কোনো SMS/payment/real order হয় না। এটি production preview নয়।

চালু localhost backend-এর discovery/search/menu read-only response structure মিলিয়ে দেখা হয়েছে। In-app browser tool পরিবেশগত ত্রুটিতে চালু হয়নি। তাই visual/mobile QA, live OTP, sandbox/real bKash callback, complete delivery lifecycle ও Android device verification এখনো সম্পন্ন হয়নি। এসব যাচাই করে production deploy করুন।
