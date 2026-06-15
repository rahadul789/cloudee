(function () {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const navToggle = document.querySelector("[data-nav-toggle]");
  const navMenu = document.querySelector("[data-nav-menu]");
  const cursorDot = document.getElementById("cursor-dot");
  const cursorOutline = document.getElementById("cursor-outline");
  const baseBackground = "#F8F9FA";

  const translations = {
    bn: {
      navHome: "হোম",
      navHow: "কীভাবে অর্ডার করবেন",
      navService: "সার্ভিস এলাকা",
      navRestaurant: "রেস্টুরেন্ট",
      navRider: "রাইডার",
      navContact: "যোগাযোগ",
      navAbout: "আমাদের সম্পর্কে",
      downloadApp: "অ্যাপ ডাউনলোড",
      heroKicker: "আপনার শহরের ফুড ডেলিভারি নেটওয়ার্ক",
      heroCopy:
        "আপনার এলাকার প্রিয় খাবার, লাইভ ট্র্যাকিং আর দ্রুত ডেলিভারি—সব এক অ্যাপে।",
      heroLiveOrderLabel: "লাইভ অর্ডার",
      heroLiveOrderText: "মোবাইল থেকে অর্ডার প্লেস হচ্ছে",
      heroKitchenLabel: "পার্টনার কিচেন",
      heroKitchenText: "গ্রহণ → রান্না → প্রস্তুত",
      heroRiderLabel: "রাইডার আপডেট",
      heroRiderText: "পিকআপ → পথে → ডেলিভারড",
      heroPhoneTitle: "ক্রেভিং ম্যাচড",
      heroPhoneCopy: "আপনার এলাকার রেস্টুরেন্ট",
      heroPhoneChip: "রাইডার পথে",
      heroPhoneStatusOrder: "অর্ডার প্লেসড",
      heroPhoneStatusDelivered: "ডেলিভারি সম্পন্ন",
      heroPopupOrderSmall: "মোবাইল অ্যাপ",
      heroPopupOrderTitle: "অর্ডার প্লেসড",
      heroPopupAcceptedSmall: "রেস্টুরেন্ট",
      heroPopupAcceptedTitle: "অর্ডার গ্রহণ",
      heroPopupPreparingSmall: "কিচেন",
      heroPopupPreparingTitle: "রান্না চলছে",
      heroPopupReadySmall: "কিচেন",
      heroPopupReadyTitle: "পিকআপের জন্য প্রস্তুত",
      heroPopupPickupSmall: "রাইডার",
      heroPopupPickupTitle: "পিকআপ সম্পন্ন",
      heroPopupDeliveredSmall: "কাস্টমার",
      heroPopupDeliveredTitle: "ডেলিভারি সম্পন্ন",
      heroKitchenStepOne: "গ্রহণ",
      heroKitchenStepTwo: "রান্না",
      heroKitchenStepThree: "প্রস্তুত",
      lifeCustomerMeal: "বার্গার কম্বো",
      lifeCustomerStore: "Haor Bangla Kitchen",
      lifeCustomerButton: "অর্ডার করুন",
      lifeCustomerStart: "খাবার সিলেক্টেড",
      lifeCustomerPlaced: "অর্ডার প্লেসড",
      lifeCustomerDelivered: "ডেলিভারড",
      lifePopOrder: "অর্ডার প্লেসড",
      lifeRestaurantPanel: "রেস্টুরেন্ট প্যানেল",
      lifeRestaurantStore: "Haor Bangla Kitchen",
      lifeRestaurantLive: "লাইভ",
      lifeRestaurantQueue: "৩টি অর্ডার চলছে",
      lifeRestaurantSmall: "রেস্টুরেন্ট প্যানেল",
      lifeRestaurantTitle: "নতুন অর্ডার এসেছে",
      lifeRestaurantItem: "বার্গার কম্বো × ১",
      lifeRestaurantEta: "১৮ মিনিট",
      lifeAccepted: "গ্রহণ",
      lifePreparing: "রান্না চলছে",
      lifeReady: "প্রস্তুত",
      lifePopAccepted: "গ্রহণ করা হয়েছে",
      lifePopPreparing: "রান্না চলছে",
      lifePopReady: "পিকআপের জন্য প্রস্তুত",
      lifeRestaurantEarning: "+750tk",
      lifeRiderBrand: "রাইডার অ্যাপ",
      lifeRiderWait: "রেডি অর্ডার পাওয়া গেছে",
      lifeRiderPickup: "পিকআপ হয়েছে",
      lifeRiderGoing: "রাইডার পথে",
      lifePopPickup: "পিকআপ হয়েছে",
      lifePopRiderRoute: "রাইডার পথে",
      lifeComplete: "কাস্টমারের কাছে ডেলিভারড",
      coverageEyebrow: "সার্ভিস কভারেজ",
      coverageTitle: "Foodbela কোন এলাকায় কাজ করছে?",
      coverageCopy:
        "লাইভ, শিগগির আসছে এবং সাময়িক বিরতিতে থাকা এলাকাগুলো এখানেই দেখা যাবে।",
      coverageRequestTitle: "আপনার এলাকায় Foodbela চান?",
      coverageInfoCopy:
        "এই request থেকে আমরা বুঝি কোন এলাকায় customer, restaurant partner এবং rider interest বেশি। টিম coverage planning করার সময় এই request review করবে।",
      coverageRequestCopy:
        "আপনার শহর বা এলাকার নাম লিখে পাঠান, আমরা launch planning-এ সেটা review করব।",
      coverageRewardBefore:
        "আপনার suggested এলাকা যদি আমরা service coverage-এ যুক্ত করি, তাহলে ধন্যবাদ উপহার হিসেবে পাবেন",
      coverageRewardAfter: "।",
      coverageRequestButton: "কভারেজ রিকোয়েস্ট করুন",
      areasHeroEyebrow: "Foodbela সার্ভিস এলাকা",
      areasHeroTitle: "Foodbela কোন কোন এলাকায় কাজ করছে?",
      areasHeroCopy:
        "লাইভ খাবার ডেলিভারি, নতুন কভারেজ প্ল্যানিং এবং রেস্টুরেন্ট/রাইডার অনবোর্ডিং এলাকা এক জায়গায় দেখুন।",
      areasRewardEyebrow: "কভারেজ রিওয়ার্ড",
      areasRewardTitle: "সম্ভাবনাময় এলাকা জানালে বোনাস পাওয়ার সুযোগ",
      areasRewardCopy:
        "আপনার পরিচিত এমন কোনো জায়গা থাকলে যেখানে Foodbela চালু হলে ভালো চাহিদা তৈরি হতে পারে, আমাদের জানান। আমরা এলাকাটি review list-এ রাখব, আর service চালু হলে আপনি বোনাস পাবেন।",
      areasRewardAmountLabel: "বোনাস",
      areasSuggestButton: "এলাকা জানিয়ে দিন",
      areasDirectoryEyebrow: "কভারেজ ডিরেক্টরি",
      areasDirectoryTitle: "Foodbela কভারেজ এলাকা",
      areaLinkDelivery: "খাবার ডেলিভারি",
      areaLinkRestaurants: "রেস্টুরেন্ট",
      areaLinkPartner: "পার্টনার",
      areaLinkRiders: "রাইডার",
      exploreBtn: "ডেলিভারি জার্নি দেখুন ↓",
      heroPlayStore: "Google Play",
      heroQrSmall: "মোবাইল স্ক্যান",
      heroQrTitle: "ফোন দিয়ে স্ক্যান করে অ্যাপ নিন",
      heroQrCopy: "Play Store লিংক খুলবে।",
      qrSceneSmall: "Foodbela অ্যাপ",
      qrSceneTitle: "স্ক্যান করে অর্ডার শুরু করুন",
      qrSceneCopy: "Play Store লিংক খুলবে",
      dashboardSceneTitle: "রেস্টুরেন্ট ড্যাশবোর্ড",
      dashboardKpiEarnings: "আজকের রেভিনিউ",
      dashboardKpiOrders: "মোট অর্ডার",
      dashboardKpiStatusValue: "৪টি রান্না চলছে",
      dashboardKpiStatus: "লাইভ স্ট্যাটাস",
      dashboardMobileTitle: "মোবাইল অ্যাপ",
      dashboardMobileCopy: "চলতে চলতে অর্ডার আপডেট",
      dashboardWebTitle: "ওয়েব প্যানেল",
      dashboardWebCopy: "কিচেন বা কাউন্টার থেকে ম্যানেজ",
      deliverySceneSmall: "লাইভ ট্র্যাকিং",
      deliverySceneTitle: "রাইডার পথে আছে",
      deliverySceneEta: "১৮-২৫ মিনিট",
      joinEyebrow: "আপনার Foodbela পথ বেছে নিন",
      joinTitle: "আপনি কীভাবে Foodbela-তে যুক্ত হতে চান?",
      joinCopy:
        "খাবার অর্ডার, রেস্টুরেন্ট বড় করা বা রাইডার হিসেবে আয়—Foodbela-তে প্রত্যেকের জন্য আলাদা, পরিষ্কার ও দ্রুত পথ আছে।",
      joinCustomerTitle: "আমি খাবার অর্ডার করতে চাই",
      joinCustomerCopy:
        "কাছের রেস্টুরেন্ট, অফার, লাইভ ট্র্যাকিং ও সাপোর্ট—সব এক অ্যাপে।",
      joinRestaurantTitle: "আমি রেস্টুরেন্ট পার্টনার হতে চাই",
      joinRestaurantCopy:
        "অনলাইন অর্ডার, প্রচারণা সহায়তা, মেন্যু সেটআপ ও পরিষ্কার পেমেন্ট হিসাব।",
      joinRiderTitle: "আমি রাইডার হিসেবে যুক্ত হতে চাই",
      joinRiderCopy:
        "নিজের এলাকায় ফ্লেক্সিবল সময়, পরিষ্কার পিকআপ নির্দেশনা ও ডেলিভারি আয়ের সুযোগ।",
      areaEyebrow: "সার্ভিস জোন",
      areaTitle: "এখনকার কভারেজ, পরের শহরের প্রস্তুতি।",
      stepOneTitle: "১. আপনার ক্রেভিং খুঁজুন 🍔",
      stepOneCopy:
        "শহরের সেরা রেস্টুরেন্ট, হাজারো মেন্যু, লোকাল অফার এবং পছন্দের খাবার মাত্র কয়েক ক্লিকে আপনার হাতের মুঠোয়।",
      stepTwoTitle: "২. কিচেন ম্যাজিক 🔥",
      stepTwoCopy:
        "অর্ডার এলেই রেস্টুরেন্ট তা সঙ্গে সঙ্গে দেখতে পায়। মোবাইল অ্যাপ বা ওয়েব প্যানেল—দুই জায়গা থেকেই অর্ডার গ্রহণ, প্রস্তুতির আপডেট আর স্ট্যাটাস ম্যানেজ করা যায়।",
      stepThreeTitle: "৩. সুপারফাস্ট ডেলিভারি 🚀",
      stepThreeCopy:
        "রাইডার পিকআপ থেকে দরজায় পৌঁছে দেওয়া পর্যন্ত পরিষ্কার নির্দেশনা পায়, আর কাস্টমার লাইভ ট্র্যাকিংয়ে পুরো অর্ডার জার্নি দেখতে পারে।",
      magicStatusSmall: "লাইভ অর্ডার জার্নি",
      magicStatusOne: "পছন্দের খাবার মিলেছে",
      magicStatusTwo: "কিচেনে প্রস্তুতি চলছে",
      magicStatusThree: "রাইডার পথে আছে",
      ecosystemTitle: "আমাদের ইকোসিস্টেম 🌍",
      ecosystemCopy:
        "Foodbela শুধু একটি কাস্টমার অ্যাপ না; এটা কাস্টমার, রেস্টুরেন্ট আর রাইডারকে যুক্ত করা একটি ডেলিভারি নেটওয়ার্ক।",
      ecoNodeCustomerLabel: "কাস্টমার অ্যাপ",
      ecoNodeCustomerTitle: "অর্ডার প্লেস",
      ecoNodeRestaurantLabel: "পার্টনার কিচেন",
      ecoNodeRestaurantTitle: "প্রস্তুতি শুরু",
      ecoNodeRiderLabel: "রাইডার অ্যাপ",
      ecoNodeRiderTitle: "পিকআপ রুট",
      ecoNodeDeliveredLabel: "কাস্টমারের দরজা",
      ecoNodeDeliveredTitle: "ডেলিভারি সম্পন্ন",
      ecoEventOneKicker: "01 / অর্ডার তৈরি",
      ecoEventOneTitle: "ফোন থেকে অর্ডার প্লেসড",
      ecoEventOneCopy:
        "কাস্টমার খাবার বেছে নেয়, এলাকা নিশ্চিত করে, তারপর অর্ডারটি Foodbela নেটওয়ার্কে ঢুকে যায়।",
      ecoEventOneMeta: "ETA ও অর্ডার আইডি তৈরি",
      ecoEventTwoKicker: "02 / কিচেন লাইভ",
      ecoEventTwoTitle: "রেস্টুরেন্ট প্রস্তুতি শুরু করে",
      ecoEventTwoCopy:
        "রেস্টুরেন্ট মোবাইল অ্যাপ বা ওয়েব প্যানেলে অর্ডার আসে। কিচেন গ্রহণ করে, প্রস্তুতির সময় দেয়, আর স্ট্যাটাস আপডেট করে।",
      ecoEventTwoMeta: "প্রস্তুতি → পিকআপের জন্য প্রস্তুত",
      ecoEventThreeKicker: "03 / রাইডার পথে",
      ecoEventThreeTitle: "রাইডার রেস্টুরেন্টে যায়",
      ecoEventThreeCopy:
        "রাইডার অ্যাপে পিকআপ লোকেশন, কাস্টমার নোট আর রুট দেখা যায়। খাবার প্রস্তুত হলে পিকআপ সম্পন্ন হয়।",
      ecoEventThreeMeta: "পিকআপ → পথে আছে",
      ecoEventFourKicker: "04 / দরজায় পৌঁছেছে",
      ecoEventFourTitle: "কাস্টমার খাবার পেয়ে যায়",
      ecoEventFourCopy:
        "লাইভ ট্র্যাকিং শেষ হয়, অর্ডার ডেলিভারড হয়, আর কাস্টমার ও পার্টনার দুজনের কাছেই পরিষ্কার আপডেট থাকে।",
      ecoEventFourMeta: "ডেলিভারড + সাপোর্ট প্রস্তুত",
      customerCardTitle: "কাস্টমার এক্সপেরিয়েন্স",
      customerCardCopy:
        "লোকাল রেস্টুরেন্ট খুঁজুন, ভাউচার ব্যবহার করুন, লাইভ অর্ডার ট্র্যাক করুন এবং সহজে সাপোর্ট নিন।",
      restaurantCardTitle: "রেস্টুরেন্ট পার্টনারশিপ",
      restaurantCardCopy:
        "সহজ অর্ডার ব্যবস্থা, প্রচারণা সহায়তা আর পরিষ্কার পেমেন্ট হিসাব দিয়ে আপনার রেস্টুরেন্টকে অনলাইনে বড় করুন।",
      riderCardTitle: "রাইডার অনবোর্ডিং",
      riderCardCopy:
        "নিজের এলাকায় সুবিধামতো সময়ে ডেলিভারি করুন, পরিষ্কার পিকআপ নির্দেশনা পান এবং সহজ স্ট্যাটাস আপডেট দিয়ে আয় করুন।",
      downloadNow: "ডাউনলোড করুন <span>→</span>",
      joinNow: "যুক্ত হোন <span>→</span>",
      applyNow: "আবেদন করুন <span>→</span>",
      partnerCtaTitle: "আপনার ব্যবসাকে পরবর্তী ধাপে নিয়ে যান 📈",
      partnerCtaCopy:
        "হাজারো নতুন কাস্টমারের কাছে পৌঁছাতে আজই Foodbela পার্টনার নেটওয়ার্কে যুক্ত হোন। আমরা টেকনোলজি দিব, আপনি শুধু দারুণ খাবার বানাবেন।",
      bePartner: "পার্টনার হোন",
      downloadEyebrow: "Foodbela অ্যাপস",
      downloadTitle: "এক ব্র্যান্ড, তিনটি সহজ অ্যাপ অভিজ্ঞতা।",
      downloadCopy:
        "কাস্টমার অর্ডার করবে, রেস্টুরেন্ট অর্ডার সামলাবে, আর রাইডার ডেলিভারি করবে একই সংযুক্ত ইকোসিস্টেমে।",
      playStoreSmall: "GET IT ON",
      playStoreBig: "Google Play",
      partnerAppsSmall: "পার্টনার অ্যাপস",
      partnerAppsBig: "অনবোর্ডিং শুরু করুন",
      footerCopy:
        "লোকাল ক্রেভিং, ব্যস্ত কিচেন এবং শহরকে সচল রাখা রাইডারদের জন্য তৈরি একটি ফুড ডেলিভারি ইকোসিস্টেম।",
      footerExplore: "এক্সপ্লোর",
      footerPartner: "পার্টনার",
      restaurantOnboarding: "রেস্টুরেন্ট অনবোর্ডিং",
      riderOnboarding: "রাইডার অনবোর্ডিং",
      support: "সাপোর্ট",
      footerBottom: "তাজা খাবার। পরিষ্কার অপারেশন। আরও ভালো ডেলিভারি।",
      restaurantHeroTitle: "আপনার কিচেনকে অনলাইনে আরও শক্তিশালী করুন।",
      restaurantHeroCopy:
        "Foodbela আপনাকে এলাকার কাস্টমারের কাছে পৌঁছাতে, অর্ডার সামলাতে এবং মোবাইল অ্যাপ ও ওয়েব প্যানেল দিয়ে পেমেন্টের হিসাব পরিষ্কার রাখতে সাহায্য করবে।",
      restaurantApplyBtn: "রেস্টুরেন্ট হিসেবে আবেদন করুন",
      seeProcess: "ধাপগুলো দেখুন",
      restaurantPlatformEyebrow: "রেস্টুরেন্ট টুলস",
      restaurantPlatformTitle:
        "মোবাইল অ্যাপ ও ওয়েব প্যানেল—দুই জায়গা থেকেই রেস্টুরেন্ট ম্যানেজ করুন।",
      restaurantPlatformCopy:
        "কিচেনে থাকলে ওয়েব প্যানেল, বাইরে থাকলে মোবাইল অ্যাপ। নতুন অর্ডার, প্রস্তুতির আপডেট, মেন্যু আর পেমেন্ট হিসাব একই Foodbela সিস্টেমে একসাথে আপডেট থাকবে।",
      restaurantPlatformPointOne: "নতুন অর্ডার গ্রহণ",
      restaurantPlatformPointTwo: "প্রস্তুতি ও স্ট্যাটাস আপডেট",
      restaurantPlatformPointThree: "মেন্যু, অফার ও পেমেন্ট হিসাব",
      restaurantWebPreviewTitle: "ওয়েব প্যানেল",
      restaurantWebMetricOne: "আজকের রেভিনিউ",
      restaurantWebMetricTwo: "মোট অর্ডার",
      restaurantWebMetricThree: "৪টি অর্ডার রান্না চলছে",
      restaurantMobilePreviewTitle: "মোবাইল অ্যাপ",
      restaurantMobilePreviewCopy: "নতুন অর্ডার এসেছে",
      restaurantMobilePreviewAction: "স্ট্যাটাস আপডেট",
      restaurantToolkitTitle: "রেস্টুরেন্ট বড় করার টুলকিট",
      restaurantToolkitCopy:
        "প্রথম দিন থেকেই অনবোর্ডিং, মেন্যু সেটআপ এবং মোবাইল অ্যাপ ও ওয়েব প্যানেলে অর্ডার পরিচালনা যেন সহজ থাকে।",
      restaurantBenefitTitle0: "আরও লোকাল চাহিদা",
      restaurantBenefitCopy0:
        "কাস্টমার যখন অর্ডার দিতে প্রস্তুত, তখন আপনার মেন্যু তাদের সামনে দেখান।",
      restaurantBenefitTitle1: "সহজ অর্ডার পরিচালনা",
      restaurantBenefitCopy1:
        "মোবাইল অ্যাপ বা ওয়েব প্যানেল দিয়ে অর্ডার গ্রহণ, প্রস্তুতি আর ট্র্যাকিং করুন।",
      restaurantBenefitTitle2: "প্রচার সহায়তা",
      restaurantBenefitCopy2:
        "অফার, বেশি ভিজিবিলিটি এবং লঞ্চ ক্যাম্পেইন চালান বাড়তি ঝামেলা ছাড়া।",
      restaurantBenefitTitle3: "পরিষ্কার পেমেন্ট হিসাব",
      restaurantBenefitCopy3:
        "আয়, ফি এবং পেমেন্টের চলাচল সহজভাবে বুঝুন।",
      restaurantProcessTitle: "আবেদন থেকে প্রথম অর্ডার পর্যন্ত",
      restaurantProcessOneTitle: "অনলাইনে আবেদন",
      restaurantProcessOneCopy:
        "রেস্টুরেন্টের নাম, মালিকের ফোন নম্বর, এলাকা এবং খাবারের ধরন জানান।",
      restaurantProcessTwoTitle: "মেন্যু ও প্রোফাইল সেটআপ",
      restaurantProcessTwoCopy:
        "Foodbela টিম মেন্যু, ছবি, সময়সূচি এবং ডেলিভারি কভারেজ সাজাতে সাহায্য করবে।",
      restaurantProcessThreeTitle: "লাইভ হয়ে যান",
      restaurantProcessThreeCopy:
        "মোবাইল অ্যাপ বা ওয়েব প্যানেল থেকে অর্ডার নিন, প্রস্তুতির আপডেট দিন এবং পারফরম্যান্স দেখুন।",
      restaurantFormTitle: "আপনার রেস্টুরেন্ট সম্পর্কে বলুন।",
      restaurantFormCopy:
        "আবেদন পাঠালে Foodbela টিম আপনার রেস্টুরেন্ট যাচাই করে মেন্যু সেটআপ, মোবাইল অ্যাপ/ওয়েব প্যানেল অ্যাক্সেস এবং অনবোর্ডিংয়ের পরের ধাপ জানাবে।",
      restaurantFaqTitle: "রেস্টুরেন্ট পার্টনারদের প্রশ্ন",
      restaurantFaqQuestion0: "রেস্টুরেন্ট অনবোর্ডিং কত সময় লাগে?",
      restaurantFaqAnswer0:
        "প্রোফাইল যাচাই, মেন্যু সেটআপ এবং ছোট অর্ডার পরীক্ষা শেষ হলে বেশিরভাগ রেস্টুরেন্ট শুরু করতে পারে।",
      restaurantFaqQuestion1: "Foodbela কি মেন্যু আপলোড করতে সাহায্য করবে?",
      restaurantFaqAnswer1:
        "হ্যাঁ। অনবোর্ডিং টিম ক্যাটাগরি, দাম, ছবি এবং সময়সূচি সাজাতে সাহায্য করবে।",
      restaurantFaqQuestion2: "আলাদা ডিভাইস লাগবে?",
      restaurantFaqAnswer2:
        "ইন্টারনেটসহ স্মার্টফোনে মোবাইল অ্যাপ বা কম্পিউটারে ওয়েব প্যানেল ব্যবহার করলেই নতুন অর্ডার সামলানো যাবে।",
      riderHeroTitle: "নিজের শহরে ডেলিভারি করে আয় করুন।",
      riderHeroCopy:
        "Foodbela রাইডারদের জন্য শুধু মোবাইল অ্যাপ। পিকআপ, ড্রপ-অফ, কাস্টমার নোট আর অর্ডারের অবস্থা সব মোবাইল অ্যাপেই থাকবে।",
      riderApplyBtn: "রাইডার হিসেবে আবেদন করুন",
      riderAppEyebrow: "রাইডার মোবাইল অ্যাপ",
      riderAppTitle: "রাইডারের কাজ শুধু মোবাইল অ্যাপ থেকেই চলবে।",
      riderAppCopy:
        "অর্ডার গ্রহণ, পিকআপ লোকেশন, ড্রপ-অফ নির্দেশনা, কাস্টমার নোট আর স্ট্যাটাস আপডেট—সব এক সহজ মোবাইল অ্যাপে। ওয়েব প্যানেল দরকার নেই।",
      riderAppPointOne: "পিকআপ ও ড্রপ-অফ রুট",
      riderAppPointTwo: "লাইভ স্ট্যাটাস আপডেট",
      riderAppPointThree: "আয়ের ও অর্ডারের সারাংশ",
      riderPhoneSmall: "নতুন ডেলিভারি",
      riderPhoneTitle: "পিকআপ: পার্টনার কিচেন",
      riderPhoneCopy: "ড্রপ-অফ পর্যন্ত ১৮ মিনিট",
      riderPhoneAction: "অর্ডার গ্রহণ",
      riderToolkitTitle: "রাইডারদের জন্য পরিষ্কার ডেলিভারি ফ্লো",
      riderToolkitCopy:
        "নিজের সুবিধামতো কাজের সময়, মোবাইল অ্যাপে পরিষ্কার রুট নির্দেশনা আর সহজ স্ট্যাটাস আপডেট দিয়ে কাজ এগিয়ে নিন।",
      riderBenefitTitle0: "সুবিধামতো আয়",
      riderBenefitCopy0:
        "নিজের সময় অনুযায়ী কাজের সময় বেছে নিন এবং আপনার সার্ভিস এলাকায় অর্ডার নিন।",
      riderBenefitTitle1: "লাইভ রুট নির্দেশনা",
      riderBenefitCopy1:
        "পিকআপ, ড্রপ-অফ, কাস্টমার নোট আর স্ট্যাটাস আপডেট এক সহজ জায়গায় থাকে।",
      riderBenefitTitle2: "দ্রুত অনবোর্ডিং",
      riderBenefitCopy2:
        "অনলাইনে আবেদন করুন, ডকুমেন্ট যাচাই করুন এবং প্রথম ডেলিভারির জন্য প্রস্তুত হন।",
      riderProcessTitle: "আবেদন থেকে প্রথম ডেলিভারি",
      riderProcessOneTitle: "আবেদন করুন",
      riderProcessOneCopy:
        "ফোন নম্বর, এলাকা এবং যানবাহনের ধরন দিয়ে রাইডার ফর্ম জমা দিন।",
      riderProcessTwoTitle: "ভেরিফাই করুন",
      riderProcessTwoCopy:
        "পরিচয়, সার্ভিস এলাকা এবং কাজের সময় Foodbela অনবোর্ডিং টিম যাচাই করবে।",
      riderProcessThreeTitle: "ডেলিভারি শুরু",
      riderProcessThreeCopy:
        "মোবাইল অ্যাপে অর্ডার গ্রহণ করুন, পিকআপ নির্দেশনা অনুসরণ করুন এবং স্ট্যাটাস আপডেট দিন।",
      riderFormTitle: "আপনার রাইডার তথ্য পাঠান।",
      riderFormCopy:
        "আবেদন দেখা শেষ হলে Foodbela টিম সার্ভিস এলাকা, ডকুমেন্ট এবং অ্যাক্টিভেশনের বিস্তারিত জানাবে।",
      riderFaqTitle: "রাইডারদের প্রশ্ন",
      riderFaqQuestion0: "রাইডার হিসেবে আবেদন করতে কী দরকার?",
      riderFaqAnswer0:
        "যোগাযোগ করা যাবে এমন ফোন নম্বর, NID তথ্য, সার্ভিস এলাকা এবং যানবাহনের তথ্য লাগবে।",
      riderFaqQuestion1: "আমি কি পার্ট-টাইম কাজ করতে পারবো?",
      riderFaqAnswer1:
        "হ্যাঁ। আপনার এলাকার চাহিদা অনুযায়ী Foodbela সুবিধামতো কাজের সময় সাপোর্ট করে।",
      riderFaqQuestion2: "কোথায় যেতে হবে কীভাবে জানবো?",
      riderFaqAnswer2:
        "যে অর্ডার গ্রহণ করবেন, তার পিকআপ, ড্রপ-অফ, কাস্টমার নোট এবং স্ট্যাটাস ধাপ রাইডার অ্যাপে দেখা যাবে।",
      aboutHeroTitle: "ফুড ডেলিভারি যেন দ্রুত, মানবিক আর বিশ্বাসযোগ্য লাগে।",
      aboutHeroCopy:
        "Foodbela কাস্টমার, রেস্টুরেন্ট আর রাইডারকে একই ডেলিভারি অভিজ্ঞতায় যুক্ত করছে। লক্ষ্য শুধু বেশি অর্ডার না; সবার প্রতিদিনের কাজ আরও সহজ করা।",
      aboutBeliefTitle: "আমাদের বিশ্বাস",
      aboutBeliefCopy:
        "প্রতিটি অর্ডারের পেছনে একজন ক্ষুধার্ত কাস্টমার, ব্যস্ত কিচেন এবং রাস্তায় চলা একজন রাইডার থাকে। Foodbela সেই বাস্তবতা মাথায় রেখে তৈরি।",
      aboutValueOneTitle: "এলাকাভিত্তিক ফোকাস",
      aboutValueOneCopy:
        "বড় হওয়ার আগে নির্দিষ্ট এলাকায় শক্তিশালী ডেলিভারি মান তৈরি করা।",
      aboutValueTwoTitle: "পরিষ্কার অপারেশন",
      aboutValueTwoCopy:
        "কাস্টমার, কিচেন এবং রাইডারের প্রতিটি ধাপ সহজে বোঝার মতো করা।",
      aboutValueThreeTitle: "পার্টনারকে সম্মান",
      aboutValueThreeCopy:
        "রেস্টুরেন্ট এবং রাইডারকে এমন টুল দেওয়া, যা তাদের প্রতিদিনের কাজ সহজ করে।",
      contactHeroTitle: "সাপোর্ট, অনবোর্ডিং বা পার্টনারশিপ নিয়ে কথা বলুন।",
      contactHeroCopy:
        "আপনার অনুরোধ কাস্টমার, রেস্টুরেন্ট, রাইডার বা পার্টনারশিপ সাপোর্ট টিমের কাছে পৌঁছে দেওয়া হবে।",
      contactCustomerTitle: "কাস্টমার সাপোর্ট",
      contactCustomerCopy: "অর্ডার, পেমেন্ট, রিফান্ড এবং অ্যাকাউন্ট সহায়তা।",
      contactRestaurantTitle: "রেস্টুরেন্ট সাপোর্ট",
      contactRestaurantCopy: "মেন্যু, পেমেন্ট এবং পার্টনার অনবোর্ডিং সহায়তা।",
      contactRestaurantLink: "রেস্টুরেন্ট আবেদন <span>→</span>",
      contactRiderTitle: "রাইডার সাপোর্ট",
      contactRiderCopy: "আবেদন, এলাকা এবং ডেলিভারি কাজের সহায়তা।",
      contactRiderLink: "রাইডার আবেদন <span>→</span>",
      contactPhoneTitle: "ফোন সাপোর্ট",
      contactPhoneCopy: "জরুরি সাপোর্ট বা দ্রুত follow-up দরকার হলে সরাসরি কল করুন।",
      formBusinessName: "রেস্টুরেন্টের নাম",
      formBusinessPlaceholder: "যেমন: Bella Kitchen",
      formName: "আপনার নাম",
      formNamePlaceholder: "পূর্ণ নাম",
      formPhone: "ফোন নম্বর",
      formEmail: "ইমেইল",
      formArea: "শহর বা এলাকা",
      formAreaPlaceholder: "ঢাকা, মিরপুর, ধানমন্ডি...",
      formCuisine: "খাবারের ধরন",
      formCuisinePlaceholder: "বার্গার, বিরিয়ানি, ডেজার্ট, ক্যাফে...",
      formVehicle: "যানবাহনের ধরন",
      formChooseArea: "একটি সার্ভিস এলাকা বেছে নিন",
      formChooseOne: "একটি বেছে নিন",
      vehicleBike: "বাইক",
      vehicleCycle: "সাইকেল",
      vehicleScooter: "স্কুটার",
      formMessage: "আর কিছু জানাতে চান?",
      formMessagePlaceholder: "আপনার লোকেশন, টিম, সময় বা প্রশ্ন লিখুন।",
      formHelp: "কীভাবে সাহায্য করতে পারি?",
      formHelpPlaceholder: "আপনার প্রয়োজনটি লিখুন।",
      restaurantLeadHeading: "রেস্টুরেন্ট পার্টনার আবেদন",
      restaurantLeadCopy:
        "প্রয়োজনীয় তথ্য দিন, Foodbela টিম আপনার সাথে যোগাযোগ করবে।",
      restaurantLeadButton: "রেস্টুরেন্ট আবেদন পাঠান",
      riderLeadHeading: "রাইডার আবেদন",
      riderLeadCopy: "প্রয়োজনীয় তথ্য দিন, টিম আপনাকে পরের ধাপ জানাবে।",
      riderLeadButton: "রাইডার আবেদন পাঠান",
      contactLeadHeading: "মেসেজ পাঠান",
      contactLeadCopy: "প্রয়োজনীয় তথ্য লিখুন, আমরা যোগাযোগ করবো।",
      contactLeadButton: "মেসেজ পাঠান",
      sending: "আপনার তথ্য পাঠানো হচ্ছে...",
      sendingShort: "পাঠানো হচ্ছে...",
      formCheck: "ফর্মটি আবার চেক করুন।",
      formSuccess: "ধন্যবাদ। Foodbela টিম শীঘ্রই যোগাযোগ করবে।",
      formFailed: "ফর্ম পাঠানো যায়নি। আবার চেষ্টা করুন।",
      backendUnavailable:
        "এই মুহূর্তে Foodbela সার্ভারের সাথে সংযোগ হচ্ছে না। একটু পর আবার চেষ্টা করুন।",
      downloadGuideKicker: "Foodbela কাস্টমার অ্যাপ",
      downloadGuideTitle: "Play Store থেকে Foodbela অ্যাপ ডাউনলোড করুন।",
      downloadGuideCopy:
        "কাছের রেস্টুরেন্ট খুঁজুন, অফার ব্যবহার করুন, অর্ডার ট্র্যাক করুন এবং সাপোর্ট নিন এক স্মার্ট কাস্টমার অ্যাপে।",
      downloadGuideButton: "Google Play থেকে ডাউনলোড",
      downloadGuideVideo: "ভিডিও গাইড দেখুন",
      downloadQrSmall: "দ্রুত স্ক্যান",
      downloadQrTitle: "মোবাইল দিয়ে স্ক্যান করে অ্যাপ ইনস্টল করুন",
      downloadQrCopy: "Play Store লিংক সরাসরি খুলবে।",
      downloadVideoSmall: "১ মিনিটের গাইড",
      downloadVideoTitle: "ডাউনলোড থেকে প্রথম অর্ডার পর্যন্ত",
      downloadStepsEyebrow: "সহজ শুরু",
      downloadStepsTitle: "তিন ধাপে Foodbela ব্যবহার শুরু করুন।",
      downloadStepOneTitle: "Play Store খুলুন",
      downloadStepOneCopy:
        "Google Play Store-এ Foodbela সার্চ করুন, অথবা এই পেজের ডাউনলোড বাটন ব্যবহার করুন।",
      downloadStepTwoTitle: "অ্যাপ ইনস্টল করুন",
      downloadStepTwoCopy:
        "ইনস্টল বাটনে ট্যাপ করুন, অ্যাপ খুলুন, তারপর ফোন নম্বর দিয়ে অ্যাকাউন্ট সেটআপ করুন।",
      downloadStepThreeTitle: "প্রথম অর্ডার দিন",
      downloadStepThreeCopy:
        "আপনার এলাকা বেছে নিন, রেস্টুরেন্ট নির্বাচন করুন, ভাউচার ব্যবহার করুন এবং লাইভ ট্র্যাকিং দেখুন।",
      downloadOfferEyebrow: "বর্তমান অফার",
      downloadFeatureVoucherTitle: "ভাউচার ও অফার",
      downloadFeatureVoucherCopy:
        "চলতি অফার দেখুন, ভাউচার ব্যবহার করুন এবং অর্ডারের আগে মোট খরচ বুঝে নিন।",
      downloadFeatureTrackingTitle: "লাইভ ট্র্যাকিং",
      downloadFeatureTrackingCopy:
        "রেস্টুরেন্টের প্রস্তুতি থেকে রাইডারের ড্রপ-অফ পর্যন্ত অর্ডারের পুরো পথ দেখুন।",
      downloadFeatureSupportTitle: "সহজ সাপোর্ট",
      downloadFeatureSupportCopy:
        "অর্ডার, পেমেন্ট বা রিফান্ড নিয়ে সাহায্য দরকার হলে Foodbela সাপোর্টের সাথে যোগাযোগ করুন।",
    },
    en: {
      navHome: "Home",
      navHow: "How to order",
      navService: "Service areas",
      navRestaurant: "Restaurants",
      navRider: "Riders",
      navContact: "Contact",
      navAbout: "About",
      downloadApp: "Download app",
      heroKicker: "Your city food delivery network",
      heroCopy:
        "Your local favorites, live tracking, and fast delivery in one app.",
      heroLiveOrderLabel: "Live order",
      heroLiveOrderText: "Order starts from the mobile app",
      heroKitchenLabel: "Partner kitchen",
      heroKitchenText: "Accepted → Preparing → Ready",
      heroRiderLabel: "Rider update",
      heroRiderText: "Pickup → On the way → Delivered",
      heroPhoneTitle: "Craving matched",
      heroPhoneCopy: "Restaurants near you",
      heroPhoneChip: "Rider en route",
      heroPhoneStatusOrder: "Order placed",
      heroPhoneStatusDelivered: "Delivered",
      heroPopupOrderSmall: "Mobile app",
      heroPopupOrderTitle: "Order placed",
      heroPopupAcceptedSmall: "Restaurant",
      heroPopupAcceptedTitle: "Accepted",
      heroPopupPreparingSmall: "Kitchen",
      heroPopupPreparingTitle: "Preparing",
      heroPopupReadySmall: "Kitchen",
      heroPopupReadyTitle: "Ready for pickup",
      heroPopupPickupSmall: "Rider",
      heroPopupPickupTitle: "Pickup done",
      heroPopupDeliveredSmall: "Customer",
      heroPopupDeliveredTitle: "Delivered",
      heroKitchenStepOne: "Accepted",
      heroKitchenStepTwo: "Preparing",
      heroKitchenStepThree: "Ready",
      lifeCustomerMeal: "Burger combo",
      lifeCustomerStore: "Haor Bangla Kitchen",
      lifeCustomerButton: "Order now",
      lifeCustomerStart: "Meal selected",
      lifeCustomerPlaced: "Order placed",
      lifeCustomerDelivered: "Delivered",
      lifePopOrder: "Order placed",
      lifeRestaurantPanel: "Restaurant panel",
      lifeRestaurantStore: "Haor Bangla Kitchen",
      lifeRestaurantLive: "Live",
      lifeRestaurantQueue: "3 active orders",
      lifeRestaurantSmall: "Restaurant panel",
      lifeRestaurantTitle: "New order received",
      lifeRestaurantItem: "Burger combo × 1",
      lifeRestaurantEta: "18 min",
      lifeAccepted: "Accepted",
      lifePreparing: "Preparing",
      lifeReady: "Ready",
      lifePopAccepted: "Accepted",
      lifePopPreparing: "Preparing",
      lifePopReady: "Ready for pickup",
      lifeRestaurantEarning: "+750tk",
      lifeRiderBrand: "Rider app",
      lifeRiderWait: "Ready order found",
      lifeRiderPickup: "Picked up",
      lifeRiderGoing: "On the way",
      lifePopPickup: "Picked up",
      lifePopRiderRoute: "Rider on the way",
      lifeComplete: "Delivered to customer",
      coverageEyebrow: "Service coverage",
      coverageTitle: "Where is Foodbela available?",
      coverageCopy:
        "Live, coming-soon, and paused coverage areas are shown here.",
      coverageRequestTitle: "Want Foodbela in your area?",
      coverageInfoCopy:
        "This request helps us understand where customers, restaurant partners, and riders want Foodbela next. The team reviews it during coverage planning.",
      coverageRequestCopy:
        "Send your city or area name and we will review it for launch planning.",
      coverageRewardBefore:
        "If we choose your suggested area and add Foodbela service there, you will receive a thank-you gift of",
      coverageRewardAfter: ".",
      coverageRequestButton: "Request coverage",
      areasHeroEyebrow: "Foodbela service areas",
      areasHeroTitle: "Where does Foodbela operate?",
      areasHeroCopy:
        "See live food delivery areas, future coverage planning, and restaurant/rider onboarding locations in one place.",
      areasRewardEyebrow: "Coverage reward",
      areasRewardTitle: "Suggest a promising area and unlock a bonus opportunity",
      areasRewardCopy:
        "If you know a place where Foodbela could create strong demand, tell us. We will keep it on the review list, and if service launches there, you can receive a bonus.",
      areasRewardAmountLabel: "Bonus",
      areasSuggestButton: "Suggest an area",
      areasDirectoryEyebrow: "Coverage directory",
      areasDirectoryTitle: "Foodbela coverage areas",
      areaLinkDelivery: "Food delivery",
      areaLinkRestaurants: "Restaurants",
      areaLinkPartner: "Partner",
      areaLinkRiders: "Riders",
      exploreBtn: "See the journey ↓",
      heroPlayStore: "Google Play",
      heroQrSmall: "Quick scan",
      heroQrTitle: "Scan with your phone to get the app",
      heroQrCopy: "The Play Store link opens instantly.",
      qrSceneSmall: "Foodbela App",
      qrSceneTitle: "Scan to start ordering",
      qrSceneCopy: "The Play Store link opens",
      dashboardSceneTitle: "Restaurant Dashboard",
      dashboardKpiEarnings: "Revenue",
      dashboardKpiOrders: "Total orders",
      dashboardKpiStatusValue: "4 cooking",
      dashboardKpiStatus: "Live status",
      dashboardMobileTitle: "Mobile app",
      dashboardMobileCopy: "Update orders on the go",
      dashboardWebTitle: "Web panel",
      dashboardWebCopy: "Manage from kitchen or counter",
      deliverySceneSmall: "Live Tracking",
      deliverySceneTitle: "Your rider is on the way",
      deliverySceneEta: "18-25 minutes",
      joinEyebrow: "Choose your Foodbela path",
      joinTitle: "How do you want to join Foodbela?",
      joinCopy:
        "Order food, grow your restaurant, or earn as a rider. Foodbela gives every side a clear, fast path.",
      joinCustomerTitle: "I want to order food",
      joinCustomerCopy:
        "Local restaurants, vouchers, live tracking, and support in one app.",
      joinRestaurantTitle: "I want to become a restaurant partner",
      joinRestaurantCopy:
        "Online orders, campaign support, menu setup, and clear payout flow.",
      joinRiderTitle: "I want to join as a rider",
      joinRiderCopy:
        "Flexible active time, pickup context, and delivery earning.",
      areaEyebrow: "Service zones",
      areaTitle: "Coverage today, expansion tomorrow.",
      stepOneTitle: "1. Find your craving 🍔",
      stepOneCopy:
        "Discover top local restaurants, thousands of menus, nearby offers, and your favorite food in just a few taps.",
      stepTwoTitle: "2. Kitchen magic 🔥",
      stepTwoCopy:
        "Restaurants see new orders instantly. They can accept orders, update preparation, and manage status from both the mobile app and web panel.",
      stepThreeTitle: "3. Superfast delivery 🚀",
      stepThreeCopy:
        "Riders get clear pickup-to-drop-off context while customers follow the full order journey with live tracking.",
      magicStatusSmall: "LIVE FOOD JOURNEY",
      magicStatusOne: "Craving matched nearby",
      magicStatusTwo: "Kitchen is preparing now",
      magicStatusThree: "Rider route is live",
      ecosystemTitle: "Our ecosystem 🌍",
      ecosystemCopy:
        "Foodbela is more than a customer app; it is a connected delivery network.",
      ecoNodeCustomerLabel: "Customer app",
      ecoNodeCustomerTitle: "Order placed",
      ecoNodeRestaurantLabel: "Partner kitchen",
      ecoNodeRestaurantTitle: "Preparing",
      ecoNodeRiderLabel: "Rider app",
      ecoNodeRiderTitle: "Pickup route",
      ecoNodeDeliveredLabel: "Customer door",
      ecoNodeDeliveredTitle: "Delivered",
      ecoEventOneKicker: "01 / Order created",
      ecoEventOneTitle: "Order placed from the phone",
      ecoEventOneCopy:
        "The customer chooses food, confirms the area, and the order enters the Foodbela network.",
      ecoEventOneMeta: "ETA and order ID created",
      ecoEventTwoKicker: "02 / Kitchen live",
      ecoEventTwoTitle: "Restaurant starts preparing",
      ecoEventTwoCopy:
        "The order appears in the restaurant mobile app or web panel. The kitchen accepts it, sets preparation time, and updates status.",
      ecoEventTwoMeta: "Preparing → Ready for pickup",
      ecoEventThreeKicker: "03 / Rider en route",
      ecoEventThreeTitle: "Rider goes to the restaurant",
      ecoEventThreeCopy:
        "The rider app shows pickup location, customer notes, and route context. Once food is ready, pickup is completed.",
      ecoEventThreeMeta: "Pickup → On the way",
      ecoEventFourKicker: "04 / At the door",
      ecoEventFourTitle: "Customer receives the food",
      ecoEventFourCopy:
        "Live tracking ends, the order is delivered, and both customer and partner have clear updates.",
      ecoEventFourMeta: "Delivered + support ready",
      customerCardTitle: "Customer experience",
      customerCardCopy:
        "Find local restaurants, use vouchers, track orders live, and get support without friction.",
      restaurantCardTitle: "Restaurant partnership",
      restaurantCardCopy:
        "Grow online with smart order flow, campaign support, and clear payout tracking.",
      riderCardTitle: "Rider onboarding",
      riderCardCopy:
        "Deliver in your area with flexible time, clear pickup context, and simple status updates.",
      downloadNow: "Download now <span>→</span>",
      joinNow: "Join now <span>→</span>",
      applyNow: "Apply now <span>→</span>",
      partnerCtaTitle: "Take your business to the next level 📈",
      partnerCtaCopy:
        "Join Foodbela's partner network today to reach more local customers. We bring the technology, you bring great food.",
      bePartner: "Become a partner",
      downloadEyebrow: "Foodbela apps",
      downloadTitle: "One brand, three smooth workflows.",
      downloadCopy:
        "Customers order, restaurants manage, and riders deliver through one connected ecosystem.",
      playStoreSmall: "GET IT ON",
      playStoreBig: "Google Play",
      partnerAppsSmall: "Partner apps",
      partnerAppsBig: "Get onboarded",
      footerCopy:
        "A food delivery ecosystem built for local cravings, busy kitchens, and riders who keep the city moving.",
      footerExplore: "Explore",
      footerPartner: "Partners",
      restaurantOnboarding: "Restaurant onboarding",
      riderOnboarding: "Rider onboarding",
      support: "Support",
      footerBottom: "Fresh food. Clear ops. Better delivery.",
      restaurantHeroTitle: "Make your kitchen stronger online.",
      restaurantHeroCopy:
        "Foodbela helps you reach nearby customers, manage orders, and keep payment records clear from both the mobile app and web panel.",
      restaurantApplyBtn: "Apply as a restaurant",
      seeProcess: "See the process",
      restaurantPlatformEyebrow: "Restaurant tools",
      restaurantPlatformTitle:
        "Manage your restaurant from both the mobile app and web panel.",
      restaurantPlatformCopy:
        "Use the web panel in the kitchen and the mobile app when you are away. New orders, preparation updates, menus, offers, and payment records stay connected in one Foodbela system.",
      restaurantPlatformPointOne: "Accept new orders",
      restaurantPlatformPointTwo: "Update preparation and status",
      restaurantPlatformPointThree: "Menus, offers, and payment records",
      restaurantWebPreviewTitle: "Web panel",
      restaurantWebMetricOne: "Revenue today",
      restaurantWebMetricTwo: "Total orders",
      restaurantWebMetricThree: "4 orders cooking now",
      restaurantMobilePreviewTitle: "Mobile app",
      restaurantMobilePreviewCopy: "New order received",
      restaurantMobilePreviewAction: "Update status",
      restaurantToolkitTitle: "Restaurant growth toolkit",
      restaurantToolkitCopy:
        "Onboarding, menu setup, and order management stay simple from day one across the mobile app and web panel.",
      restaurantBenefitTitle0: "More local demand",
      restaurantBenefitCopy0:
        "Show your menu to nearby customers when they are ready to order.",
      restaurantBenefitTitle1: "Simple order ops",
      restaurantBenefitCopy1:
        "Accept, prepare, and track orders from either the mobile app or web panel.",
      restaurantBenefitTitle2: "Campaign support",
      restaurantBenefitCopy2:
        "Run offers, visibility boosts, and launch campaigns without extra noise.",
      restaurantBenefitTitle3: "Clear payouts",
      restaurantBenefitCopy3:
        "Keep revenue, fees, and payment movement easy to understand.",
      restaurantProcessTitle: "From first call to first order",
      restaurantProcessOneTitle: "Apply online",
      restaurantProcessOneCopy:
        "Share restaurant name, contact person, area, and cuisine type.",
      restaurantProcessTwoTitle: "Set up menu and profile",
      restaurantProcessTwoCopy:
        "The Foodbela team helps organize menu, photos, availability, and delivery coverage.",
      restaurantProcessThreeTitle: "Go live",
      restaurantProcessThreeCopy:
        "Accept orders from the mobile app or web panel, update preparation, and monitor performance.",
      restaurantFormTitle: "Tell us about your restaurant.",
      restaurantFormCopy:
        "After you apply, the Foodbela team will review your restaurant and guide menu setup, mobile app/web panel access, and the next onboarding steps.",
      restaurantFaqTitle: "Questions from restaurant partners",
      restaurantFaqQuestion0: "How long does restaurant onboarding take?",
      restaurantFaqAnswer0:
        "Most restaurants can start after profile verification, menu setup, and a short order-flow check.",
      restaurantFaqQuestion1: "Can Foodbela help upload our menu?",
      restaurantFaqAnswer1:
        "Yes. The onboarding team can help structure categories, pricing, photos, and availability.",
      restaurantFaqQuestion2: "Do we need a separate device?",
      restaurantFaqAnswer2:
        "A smartphone can use the mobile app, and a computer can use the web panel. Either one is enough to manage incoming orders.",
      riderHeroTitle: "Earn by delivering in your own city.",
      riderHeroCopy:
        "Foodbela riders work from the mobile app only. Pickup, drop-off, customer notes, and order status all stay inside the app.",
      riderApplyBtn: "Apply as a rider",
      riderAppEyebrow: "Rider mobile app",
      riderAppTitle: "Rider work runs only from the mobile app.",
      riderAppCopy:
        "Accept orders, see pickup locations, follow drop-off instructions, read customer notes, and update status in one simple mobile app. No web panel needed.",
      riderAppPointOne: "Pickup and drop-off route",
      riderAppPointTwo: "Live status updates",
      riderAppPointThree: "Earning and order summary",
      riderPhoneSmall: "New delivery",
      riderPhoneTitle: "Pickup: partner kitchen",
      riderPhoneCopy: "18 minutes to drop-off",
      riderPhoneAction: "Accept order",
      riderToolkitTitle: "A clear delivery flow for riders",
      riderToolkitCopy:
        "Move with flexible active time, clear mobile route context, and simple status updates.",
      riderBenefitTitle0: "Flexible earning",
      riderBenefitCopy0:
        "Choose active slots around your day and take orders in your service area.",
      riderBenefitTitle1: "Live route context",
      riderBenefitCopy1:
        "Pickup, drop-off, customer notes, and status updates stay in one simple mobile app flow.",
      riderBenefitTitle2: "Fast onboarding",
      riderBenefitCopy2:
        "Apply online, verify documents, and get ready for your first delivery.",
      riderProcessTitle: "From application to first delivery",
      riderProcessOneTitle: "Apply",
      riderProcessOneCopy:
        "Submit your phone, area, and vehicle type through the rider form.",
      riderProcessTwoTitle: "Verify",
      riderProcessTwoCopy:
        "The onboarding team completes identity, service area, and availability checks.",
      riderProcessThreeTitle: "Start delivering",
      riderProcessThreeCopy:
        "Accept orders in the mobile app, follow pickup context, and update status as you move.",
      riderFormTitle: "Send your rider details.",
      riderFormCopy:
        "After review, the Foodbela team will share service area, document, and activation details.",
      riderFaqTitle: "Questions from riders",
      riderFaqQuestion0: "What do I need to apply as a rider?",
      riderFaqAnswer0:
        "You need a reachable phone number, NID information, service area, and vehicle details.",
      riderFaqQuestion1: "Can I work part-time?",
      riderFaqAnswer1:
        "Yes. Foodbela supports flexible active time based on demand in your area.",
      riderFaqQuestion2: "How will I know where to go?",
      riderFaqAnswer2:
        "Accepted orders show pickup, drop-off, customer notes, and status steps in the rider app.",
      aboutHeroTitle: "Food delivery should feel human, fast, and trustworthy.",
      aboutHeroCopy:
        "Foodbela connects customers, restaurants, and riders in one delivery experience. The goal is not only more orders, but smoother daily workflow for everyone.",
      aboutBeliefTitle: "Our belief",
      aboutBeliefCopy:
        "Behind every order there is a hungry customer, a busy kitchen, and a rider moving through real streets. Foodbela is built around that reality.",
      aboutValueOneTitle: "Local density",
      aboutValueOneCopy:
        "Build strong delivery quality in focused zones before expanding wider.",
      aboutValueTwoTitle: "Clear operations",
      aboutValueTwoCopy:
        "Make every handoff understandable for customers, kitchens, and riders.",
      aboutValueThreeTitle: "Partner respect",
      aboutValueThreeCopy:
        "Give restaurants and riders tools that make daily work easier.",
      contactHeroTitle: "Talk to us about support, onboarding, or partnership.",
      contactHeroCopy:
        "Your request will be routed to customer, restaurant, rider, or partnership support.",
      contactCustomerTitle: "Customer support",
      contactCustomerCopy: "Order, payment, refund, and account help.",
      contactRestaurantTitle: "Restaurant support",
      contactRestaurantCopy: "Menu, payout, and partner onboarding support.",
      contactRestaurantLink: "Restaurant application <span>→</span>",
      contactRiderTitle: "Rider support",
      contactRiderCopy: "Application, area, and delivery flow help.",
      contactRiderLink: "Rider application <span>→</span>",
      contactPhoneTitle: "Phone support",
      contactPhoneCopy: "Call us directly when you need urgent support or a quick follow-up.",
      formBusinessName: "Restaurant name",
      formBusinessPlaceholder: "Example: Bella Kitchen",
      formName: "Your name",
      formNamePlaceholder: "Full name",
      formPhone: "Phone number",
      formEmail: "Email",
      formArea: "City or area",
      formAreaPlaceholder: "Dhaka, Mirpur, Dhanmondi...",
      formCuisine: "Cuisine type",
      formCuisinePlaceholder: "Burger, biryani, dessert, cafe...",
      formVehicle: "Vehicle type",
      formChooseArea: "Choose a service area",
      formChooseOne: "Choose one",
      vehicleBike: "Bike",
      vehicleCycle: "Cycle",
      vehicleScooter: "Scooter",
      formMessage: "Anything we should know?",
      formMessagePlaceholder:
        "Tell us about your location, team, schedule, or questions.",
      formHelp: "How can we help?",
      formHelpPlaceholder: "Tell us what you need help with.",
      restaurantLeadHeading: "Restaurant partner application",
      restaurantLeadCopy: "Share the basics and our team will contact you.",
      restaurantLeadButton: "Send restaurant application",
      riderLeadHeading: "Rider application",
      riderLeadCopy: "Share the basics and our team will guide the next step.",
      riderLeadButton: "Send rider application",
      contactLeadHeading: "Send a message",
      contactLeadCopy: "Write the basics and we will get back to you.",
      contactLeadButton: "Send message",
      sending: "Sending your details...",
      sendingShort: "Sending...",
      formCheck: "Please check the form.",
      formSuccess: "Thanks. The Foodbela team will contact you soon.",
      formFailed: "Could not send the form. Please try again.",
      backendUnavailable:
        "Foodbela server connection is unavailable. Please try again in a moment.",
      downloadGuideKicker: "Foodbela customer app",
      downloadGuideTitle: "Download the Foodbela app from Play Store.",
      downloadGuideCopy:
        "Find nearby restaurants, use offers, track orders, and get support in one smart customer app.",
      downloadGuideButton: "Download from Google Play",
      downloadGuideVideo: "Watch video guide",
      downloadQrSmall: "Quick scan",
      downloadQrTitle: "Scan with your phone to install the app",
      downloadQrCopy: "The Play Store link opens directly.",
      downloadVideoSmall: "1-minute guide",
      downloadVideoTitle: "From download to first order",
      downloadStepsEyebrow: "Simple start",
      downloadStepsTitle: "Start using Foodbela in three steps.",
      downloadStepOneTitle: "Open Play Store",
      downloadStepOneCopy:
        "Search Foodbela on Google Play Store, or use the download button on this page.",
      downloadStepTwoTitle: "Install the app",
      downloadStepTwoCopy:
        "Tap Install, open the app, then set up your account with your phone number.",
      downloadStepThreeTitle: "Place your first order",
      downloadStepThreeCopy:
        "Choose your area, select a restaurant, apply vouchers, and follow live tracking.",
      downloadOfferEyebrow: "Current offer",
      downloadFeatureVoucherTitle: "Vouchers and offers",
      downloadFeatureVoucherCopy:
        "Check current offers, apply vouchers, and understand the total cost before ordering.",
      downloadFeatureTrackingTitle: "Live tracking",
      downloadFeatureTrackingCopy:
        "Follow the full journey from restaurant preparation to rider drop-off.",
      downloadFeatureSupportTitle: "Easy support",
      downloadFeatureSupportCopy:
        "Contact Foodbela support when you need help with orders, payments, or refunds.",
    },
  };
  let currentLanguage = "bn";
  let currentScene = "img1";
  let magicStatus = null;
  let magicContainer = null;
  let sceneLayers = [];
  const visitorId = getPersistentId("foodbela-visitor-id");
  const sessionId = getSessionId();

  function getPersistentId(key) {
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const next =
        window.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, next);
      return next;
    } catch {
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  function getSessionId() {
    try {
      const key = "foodbela-session-id";
      const timeKey = "foodbela-session-started-at";
      const existing = sessionStorage.getItem(key);
      if (existing) return existing;
      const next =
        window.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem(key, next);
      sessionStorage.setItem(timeKey, new Date().toISOString());
      return next;
    } catch {
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  function getDeviceMetadata() {
    const ua = navigator.userAgent || "";
    const isTablet = /ipad|tablet|playbook|silk/i.test(ua);
    const isMobile =
      !isTablet && /mobi|android|iphone|ipod|blackberry|iemobile/i.test(ua);
    const isBot = /bot|crawler|spider|crawling/i.test(ua);
    const browserName = /Edg/i.test(ua)
      ? "Edge"
      : /OPR|Opera/i.test(ua)
        ? "Opera"
        : /Chrome/i.test(ua)
          ? "Chrome"
          : /Safari/i.test(ua)
            ? "Safari"
            : /Firefox/i.test(ua)
              ? "Firefox"
              : "Unknown";
    const osName = /Windows/i.test(ua)
      ? "Windows"
      : /Android/i.test(ua)
        ? "Android"
        : /iPhone|iPad|iPod/i.test(ua)
          ? "iOS"
          : /Mac OS/i.test(ua)
            ? "macOS"
            : /Linux/i.test(ua)
              ? "Linux"
              : "Unknown";
    let referrerHost = "";
    try {
      referrerHost = document.referrer
        ? new URL(document.referrer).hostname
        : "";
    } catch {
      referrerHost = "";
    }

    return {
      deviceType: isBot
        ? "bot"
        : isTablet
          ? "tablet"
          : isMobile
            ? "mobile"
            : "desktop",
      browserName,
      osName,
      screenWidth: window.screen?.width || 0,
      screenHeight: window.screen?.height || 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      referrerHost,
      connectionType: navigator.connection?.effectiveType || "",
    };
  }

  function getStoredAreaContext() {
    try {
      const area = (localStorage.getItem("foodbela-selected-area") || "").trim();
      if (!area) return {};
      return {
        place: area,
        area,
        zoneName: area,
      };
    } catch {
      return {};
    }
  }

  function trackWebsiteEvent(eventName, metadata = {}) {
    const payload = {
      eventName,
      pagePath: window.location.pathname + window.location.search,
      visitorId,
      sessionId,
      language: currentLanguage,
      referrer: document.referrer || "",
      metadata: {
        ...getDeviceMetadata(),
        ...getStoredAreaContext(),
        ...metadata,
      },
    };

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/analytics/events", blob);
      return;
    }

    fetch("/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  }

  function setLanguage(lang) {
    const dictionary = translations[lang] || translations.bn;
    currentLanguage = lang;
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (!key || !dictionary[key]) return;
      node.innerHTML = dictionary[key];
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      const key = node.getAttribute("data-i18n-placeholder");
      if (!key || !dictionary[key]) return;
      node.setAttribute("placeholder", dictionary[key]);
    });
    document.querySelectorAll("[data-i18n-admin]").forEach((node) => {
      const text = node.getAttribute(
        lang === "en" ? "data-en-text" : "data-bn-text",
      );
      if (text) node.textContent = text;
    });
    updateMagicStatus();
    document.querySelectorAll("[data-lang-switch]").forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.getAttribute("data-lang-switch") === lang,
      );
    });
    try {
      localStorage.setItem("foodbela-lang", lang);
    } catch (error) {
      return undefined;
    }
    return undefined;
  }

  const savedLang = (() => {
    try {
      return localStorage.getItem("foodbela-lang");
    } catch (error) {
      return null;
    }
  })();
  setLanguage(savedLang === "en" ? "en" : "bn");

  document.querySelectorAll("[data-lang-switch]").forEach((button) => {
    button.addEventListener("click", () => {
      setLanguage(button.getAttribute("data-lang-switch") || "bn");
      trackWebsiteEvent("language_switch", {
        language: button.getAttribute("data-lang-switch") || "bn",
      });
    });
  });

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      const isOpen = navMenu.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navMenu.addEventListener("click", (event) => {
      if (!(event.target instanceof HTMLAnchorElement)) return;
      navMenu.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  }

  const lifecycleDemo = document.querySelector(".lifecycle-demo");
  if (lifecycleDemo && "IntersectionObserver" in window) {
    let lifecycleWasPlaying = lifecycleDemo.classList.contains("is-playing");
    const restartLifecycle = () => {
      lifecycleDemo.classList.remove("is-playing");
      void lifecycleDemo.offsetWidth;
      lifecycleDemo.classList.add("is-playing");
    };
    const setLifecyclePlayback = (shouldPlay) => {
      const canPlay = shouldPlay && !document.hidden && !reduceMotion;
      if (canPlay && !lifecycleWasPlaying) {
        restartLifecycle();
      } else if (!canPlay) {
        lifecycleDemo.classList.remove("is-playing");
      }
      lifecycleWasPlaying = canPlay;
    };
    const lifecycleObserver = new IntersectionObserver(
      ([entry]) => {
        setLifecyclePlayback(entry.isIntersecting && entry.intersectionRatio >= 0.18);
      },
      { threshold: [0, 0.18, 0.4] },
    );
    lifecycleObserver.observe(lifecycleDemo);
    document.addEventListener("visibilitychange", () => {
      const rect = lifecycleDemo.getBoundingClientRect();
      setLifecyclePlayback(rect.bottom > 0 && rect.top < window.innerHeight);
    });
  }

  if (
    cursorDot &&
    cursorOutline &&
    window.matchMedia("(hover: hover)").matches
  ) {
    window.addEventListener("mousemove", (event) => {
      cursorDot.style.left = `${event.clientX}px`;
      cursorDot.style.top = `${event.clientY}px`;

      cursorOutline.animate(
        {
          left: `${event.clientX}px`,
          top: `${event.clientY}px`,
        },
        { duration: 500, fill: "forwards" },
      );
    });

    document.querySelectorAll(".hover-trigger").forEach((item) => {
      item.addEventListener("mouseenter", () => {
        cursorOutline.style.width = "60px";
        cursorOutline.style.height = "60px";
        cursorOutline.style.backgroundColor = "rgba(248, 91, 138, 0.1)";
      });
      item.addEventListener("mouseleave", () => {
        cursorOutline.style.width = "40px";
        cursorOutline.style.height = "40px";
        cursorOutline.style.backgroundColor = "transparent";
      });
    });
  }

  const stepBlocks = Array.from(
    document.querySelectorAll(".step-block:not(.reset-step)"),
  );
  const magicImages = Array.from(document.querySelectorAll(".magic-img"));
  sceneLayers = Array.from(document.querySelectorAll(".scene-layer"));
  magicStatus = document.querySelector("[data-magic-status]");
  magicContainer = document.getElementById("magic");
  updateMagicStatus();

  function getStatusKey(sceneId) {
    if (sceneId === "img2") return "magicStatusTwo";
    if (sceneId === "img3") return "magicStatusThree";
    return "magicStatusOne";
  }

  function updateMagicStatus() {
    if (!magicStatus) return;
    const key = getStatusKey(currentScene);
    magicStatus.textContent =
      translations[currentLanguage][key] ||
      translations.bn[key] ||
      magicStatus.textContent;
  }

  function activateStep(block) {
    stepBlocks.forEach((item) => item.classList.remove("active"));
    block.classList.add("active");

    const color = block.getAttribute("data-color");
    if (color) document.body.style.backgroundColor = color;

    const targetImgId = block.getAttribute("data-img");
    if (targetImgId && targetImgId !== "none") {
      currentScene = targetImgId;
      updateMagicStatus();
      magicImages.forEach((image) => {
        image.classList.toggle("active", image.id === targetImgId);
      });
      sceneLayers.forEach((layer) => {
        layer.classList.toggle(
          "is-active",
          layer.getAttribute("data-scene") === targetImgId,
        );
      });
    }
  }

  function syncBodyBackground() {
    if (!magicContainer) {
      document.body.style.backgroundColor = baseBackground;
      return;
    }

    const rect = magicContainer.getBoundingClientRect();
    const beforeMagic = rect.top > window.innerHeight * 0.5;
    const afterMagic = rect.bottom < window.innerHeight * 0.45;

    if (beforeMagic || afterMagic) {
      document.body.style.backgroundColor = baseBackground;
    }
  }

  function initAnimations() {
    if (reduceMotion) return;

    const shouldUseScrollTrigger =
      window.gsap &&
      window.ScrollTrigger &&
      !window.matchMedia("(max-width: 900px)").matches;

    if (shouldUseScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);

      stepBlocks.forEach((block) => {
        window.ScrollTrigger.create({
          trigger: block,
          start: "top 50%",
          end: "bottom 50%",
          onEnter: () => activateStep(block),
          onEnterBack: () => activateStep(block),
        });
      });

      window.gsap.utils.toArray(".gs-fade").forEach((element) => {
        window.gsap.from(element, {
          scrollTrigger: {
            trigger: element,
            start: "top 80%",
          },
          y: 50,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
        });
      });

      return;
    }

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            if (entry.target.classList.contains("step-block")) {
              activateStep(entry.target);
            }
            entry.target.classList.add("is-visible");
          });
        },
        { threshold: 0.4 },
      );

      document
        .querySelectorAll(".step-block, .gs-fade")
        .forEach((node) => observer.observe(node));
    }
  }

  window.addEventListener("load", initAnimations);
  window.addEventListener("load", syncBodyBackground);
  window.addEventListener("load", () => {
    trackWebsiteEvent("page_view", {
      title: document.title,
    });
  });
  window.addEventListener("scroll", syncBodyBackground, { passive: true });

  document.querySelectorAll("a.hover-trigger").forEach((link) => {
    link.addEventListener("click", () => {
      trackWebsiteEvent("cta_click", {
        label: link.textContent?.trim() || "",
        href: link.getAttribute("href") || "",
      });
    });
  });

  document.querySelectorAll("[data-faq-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const isExpanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!isExpanded));
    });
  });

  const websiteModal = document.querySelector("[data-website-modal]");

  function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function getModalStorageKey(modal) {
    const modalId = modal.getAttribute("data-modal-id") || "default";
    return `foodbela-website-modal:${modalId}`;
  }

  function shouldShowWebsiteModal(modal) {
    const frequency = modal.getAttribute("data-modal-frequency") || "session";
    if (frequency === "always") return true;

    const key = getModalStorageKey(modal);
    try {
      if (frequency === "daily") {
        return localStorage.getItem(key) !== getTodayKey();
      }
      return sessionStorage.getItem(key) !== "closed";
    } catch {
      return true;
    }
  }

  function rememberWebsiteModal(modal) {
    const frequency = modal.getAttribute("data-modal-frequency") || "session";
    if (frequency === "always") return;

    const key = getModalStorageKey(modal);
    try {
      if (frequency === "daily") {
        localStorage.setItem(key, getTodayKey());
      } else {
        sessionStorage.setItem(key, "closed");
      }
    } catch {
      // Storage can be unavailable in private contexts; the modal still works.
    }
  }

  function openWebsiteModal() {
    if (!websiteModal || !shouldShowWebsiteModal(websiteModal)) return;
    websiteModal.classList.add("is-open");
    websiteModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    trackWebsiteEvent("modal_impression", {
      modalId: websiteModal.getAttribute("data-modal-id") || "default",
      frequency: websiteModal.getAttribute("data-modal-frequency") || "session",
    });
  }

  function closeWebsiteModal() {
    if (!websiteModal) return;
    websiteModal.classList.remove("is-open");
    websiteModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    rememberWebsiteModal(websiteModal);
  }

  if (websiteModal) {
    document.querySelectorAll("[data-website-modal-close]").forEach((button) => {
      button.addEventListener("click", closeWebsiteModal);
    });

    document.querySelectorAll("[data-website-modal-cta]").forEach((link) => {
      link.addEventListener("click", () => {
        trackWebsiteEvent("modal_click", {
          modalId: websiteModal.getAttribute("data-modal-id") || "default",
          href: link.getAttribute("href") || "",
          label: link.textContent?.trim() || "",
        });
        closeWebsiteModal();
      });
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && websiteModal.classList.contains("is-open")) {
        closeWebsiteModal();
      }
    });

    window.addEventListener("load", () => {
      const delay = Number(websiteModal.getAttribute("data-modal-delay") || 0);
      window.setTimeout(openWebsiteModal, Math.max(0, delay) * 1000);
    });
  }

  const videoModal = document.querySelector("[data-video-modal]");
  const videoFrame = document.querySelector("[data-video-frame]");

  function normalizeYouTubeEmbedUrl(input) {
    const cleanInput = (input || "").trim();
    if (!cleanInput) return "";
    if (/^[a-zA-Z0-9_-]{8,}$/.test(cleanInput) && !cleanInput.includes("/")) {
      return `https://www.youtube.com/embed/${encodeURIComponent(cleanInput)}`;
    }

    try {
      const url = new URL(cleanInput, window.location.origin);
      const host = url.hostname.replace(/^www\./, "");
      let videoId = "";

      if (host === "youtu.be") {
        videoId = url.pathname.split("/").filter(Boolean)[0] || "";
      } else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts[0] === "watch") {
          videoId = url.searchParams.get("v") || "";
        } else if (
          parts[0] === "shorts" ||
          parts[0] === "embed" ||
          parts[0] === "live" ||
          parts[0] === "v"
        ) {
          videoId = parts[1] || "";
        }
      }

      if (!videoId) return cleanInput;
      return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
    } catch {
      if (/^[a-zA-Z0-9_-]{8,}$/.test(cleanInput)) {
        return `https://www.youtube.com/embed/${encodeURIComponent(cleanInput)}`;
      }
      return cleanInput;
    }
  }

  function addVideoParams(src) {
    if (!src) return "";
    try {
      const url = new URL(src, window.location.origin);
      url.searchParams.set("autoplay", "1");
      url.searchParams.set("rel", "0");
      url.searchParams.set("playsinline", "1");
      url.searchParams.set("origin", window.location.origin);
      return url.toString();
    } catch {
      const separator = src.includes("?") ? "&" : "?";
      return `${src}${separator}autoplay=1&rel=0&playsinline=1`;
    }
  }

  function openVideoModal() {
    if (!videoModal || !videoFrame) return;
    const rawSrc = videoFrame.getAttribute("data-src") || "";
    const src = normalizeYouTubeEmbedUrl(rawSrc);
    videoFrame.setAttribute("src", addVideoParams(src));
    videoModal.classList.add("is-open");
    videoModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    trackWebsiteEvent("video_open", { video: rawSrc, embedUrl: src });
  }

  function closeVideoModal() {
    if (!videoModal || !videoFrame) return;
    videoFrame.setAttribute("src", "");
    videoModal.classList.remove("is-open");
    videoModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  document.querySelectorAll("[data-video-open]").forEach((button) => {
    button.addEventListener("click", openVideoModal);
  });
  document.querySelectorAll("[data-video-close]").forEach((button) => {
    button.addEventListener("click", closeVideoModal);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeVideoModal();
  });

  document.querySelectorAll("[data-lead-form]").forEach((form) => {
    const areaSelect = form.querySelector('[name="area"]');
    if (areaSelect) {
      areaSelect.addEventListener("change", () => {
        try {
          const selectedArea = String(areaSelect.value || "").trim();
          if (selectedArea) {
            localStorage.setItem("foodbela-selected-area", selectedArea);
          }
        } catch {
          return undefined;
        }
        return undefined;
      });
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const status = form.querySelector("[data-form-status]");
      const submit = form.querySelector("button[type='submit']");
      const submitLabel = form.querySelector("[data-submit-label]");
      const originalSubmitText = submitLabel?.textContent || "";
      form
        .querySelectorAll(".has-error")
        .forEach((node) => node.classList.remove("has-error"));

      if (status) {
        status.className = "form-status";
        status.textContent = translations[currentLanguage].sending;
      }
      if (submit) {
        submit.disabled = true;
        submit.classList.add("is-loading");
        submit.setAttribute("aria-busy", "true");
      }
      if (submitLabel)
        submitLabel.textContent = translations[currentLanguage].sendingShort;

      try {
        const formData = new FormData(form);
        formData.set(
          "landingPage",
          window.location.pathname + window.location.search,
        );
        formData.set("referrer", document.referrer || "");
        formData.set("language", currentLanguage);
        formData.set("visitorId", visitorId);
        formData.set("sessionId", sessionId);
        if (formData.get("area")) {
          try {
            localStorage.setItem(
              "foodbela-selected-area",
              String(formData.get("area") || "").trim(),
            );
          } catch {
            // Ignore storage failures; lead submission should continue.
          }
        }

        const response = await fetch("/leads", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: new URLSearchParams(formData),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (payload.errors) {
            Object.keys(payload.errors).forEach((field) => {
              const input = form.querySelector(`[name="${field}"]`);
              const label = input ? input.closest("label") : null;
              if (label) label.classList.add("has-error");
            });
          }
          throw new Error(
            payload.code === "BACKEND_UNAVAILABLE"
              ? translations[currentLanguage].backendUnavailable
              : payload.message || translations[currentLanguage].formCheck,
          );
        }

        form.reset();
        trackWebsiteEvent("lead_submit", {
          type: formData.get("type") || "contact",
          area: formData.get("area") || "",
        });
        if (status) {
          status.className = "form-status is-success";
          status.textContent = translations[currentLanguage].formSuccess;
        }
      } catch (error) {
        if (status) {
          status.className = "form-status is-error";
          status.textContent =
            error.message || translations[currentLanguage].formFailed;
        }
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.classList.remove("is-loading");
          submit.removeAttribute("aria-busy");
        }
        if (submitLabel) submitLabel.textContent = originalSubmitText;
      }
    });
  });
})();
