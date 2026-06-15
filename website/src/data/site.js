const site = {
  name: "Foodbela",
  tagline: "Food, partners, and riders moving in one smooth flow.",
  phone: "+880 1700-000000",
  email: "hello@foodbela.com",
  navLinks: [
    { label: "Home", href: "/" },
    { label: "Restaurants", href: "/restaurants" },
    { label: "Riders", href: "/riders" },
    { label: "Service Areas", href: "/areas" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  socialLinks: [
    { label: "Facebook", href: "#" },
    { label: "Instagram", href: "#" },
    { label: "LinkedIn", href: "#" },
  ],
};

const restaurantBenefits = [
  {
    title: "আরও লোকাল অর্ডার",
    copy: "আপনার এলাকার কাস্টমার যখন খাবার খুঁজবে, Foodbela তাদের সামনে আপনার মেন্যু পৌঁছে দেবে।",
    tone: "coral",
  },
  {
    title: "মোবাইল অ্যাপ ও ওয়েব প্যানেল",
    copy: "রেস্টুরেন্ট মালিক মোবাইল অ্যাপ অথবা ওয়েব প্যানেল দিয়ে অর্ডার গ্রহণ, প্রস্তুতি ও স্ট্যাটাস পরিচালনা করতে পারবেন।",
    tone: "sky",
  },
  {
    title: "প্রচার সহায়তা",
    copy: "অফার, visibility এবং launch campaign দিয়ে নতুন কাস্টমারের কাছে পৌঁছানো সহজ হবে।",
    tone: "pink",
  },
  {
    title: "পরিষ্কার পেমেন্ট হিসাব",
    copy: "অর্ডার, কমিশন, আয় এবং পেমেন্টের হিসাব সহজভাবে দেখার জন্য স্মার্ট রিপোর্ট থাকবে।",
    tone: "mint",
  },
];

const riderBenefits = [
  {
    title: "সুবিধামতো আয়",
    copy: "নিজের সময় অনুযায়ী কাজ করুন এবং Foodbela রাইডার অ্যাপ দিয়ে অর্ডার ডেলিভারি করুন।",
    tone: "mint",
  },
  {
    title: "লাইভ রুট নির্দেশনা",
    copy: "রাইডার অ্যাপে pickup, drop-off, customer note এবং status update এক জায়গায় দেখা যাবে।",
    tone: "sky",
  },
  {
    title: "দ্রুত অনবোর্ডিং",
    copy: "অনলাইনে আবেদন করুন, তথ্য যাচাই সম্পন্ন করুন এবং আপনার এলাকায় ডেলিভারি কাজ শুরু করুন।",
    tone: "coral",
  },
];

const faqs = {
  restaurants: [
    {
      question: "Foodbela রেস্টুরেন্ট অনবোর্ডিং কত সময় লাগে?",
      answer:
        "প্রোফাইল যাচাই, মেন্যু সেটআপ এবং ছোট অর্ডার টেস্ট শেষ হলে বেশিরভাগ রেস্টুরেন্ট দ্রুত live হতে পারে।",
    },
    {
      question: "রেস্টুরেন্ট মালিক কীভাবে অর্ডার ম্যানেজ করবেন?",
      answer:
        "মালিক মোবাইল অ্যাপ ও ওয়েব প্যানেল দুটো দিয়েই নতুন অর্ডার গ্রহণ, preparing, ready এবং delivery status আপডেট করতে পারবেন।",
    },
    {
      question: "Foodbela কি মেন্যু সেটআপে সাহায্য করবে?",
      answer:
        "হ্যাঁ। Foodbela অনবোর্ডিং টিম category, price, item details, photo এবং opening hours সেটআপে সহায়তা করবে।",
    },
  ],
  riders: [
    {
      question: "Foodbela রাইডার হিসেবে আবেদন করতে কী দরকার?",
      answer:
        "যোগাযোগ করা যাবে এমন ফোন নম্বর, NID তথ্য, সার্ভিস এলাকা এবং যানবাহনের তথ্য লাগবে।",
    },
    {
      question: "রাইডাররা কীভাবে অর্ডার পাবে?",
      answer:
        "রাইডার মোবাইল অ্যাপে pickup, delivery route, customer note এবং status update দেখা যাবে।",
    },
    {
      question: "Foodbela রাইডার অ্যাপ কি mobile-only?",
      answer:
        "হ্যাঁ। রাইডারদের জন্য Foodbela মোবাইল অ্যাপ ব্যবহার করা হবে, যাতে চলার পথে অর্ডার ম্যানেজ করা সহজ হয়।",
    },
  ],
};

module.exports = {
  faqs,
  restaurantBenefits,
  riderBenefits,
  site,
};
