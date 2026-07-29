export type RestaurantClosedReason =
  | "restricted"
  | "service_window"
  | "schedule"
  | "owner_busy";

export type RestaurantAvailability = {
  isOpen: boolean;
  closedReason: RestaurantClosedReason | null;
  /** e.g. "11:00 AM" / "Tomorrow 2:00 PM" — present for service_window & schedule. */
  opensAtLabel: string | null;
  /** Absolute reopen instant; countdown = opensAtEpochMs - Date.now(). null if unknown. */
  opensAtEpochMs: number | null;
  /** Absolute instant the current OPEN window closes; drives the "Closing in …" countdown. null unless open + bounded window. */
  closesAtEpochMs?: number | null;
};

export type AreaServiceWindow = {
  isOpen: boolean;
  opensAtLabel: string | null;
  opensAtEpochMs: number | null;
  /** Absolute instant the current OPEN window closes; drives the "Closing in …" countdown. null unless open + bounded window. */
  closesAtEpochMs?: number | null;
};

export type DiscoverableRestaurant = {
  _id: string;
  name: string;
  slug: string;
  isOpen?: boolean;
  availability?: RestaurantAvailability;
  description?: string;
  cuisineTypes?: string[];
  tags?: string[];
  logo?: {
    url?: string;
  };
  coverImage?: {
    url?: string;
  };
  address?: {
    address?: string;
    city?: string;
  };
  location?: {
    latitude?: number | null;
    longitude?: number | null;
  };
  discovery?: {
    isFeatured?: boolean;
    featuredSortOrder?: number;
    isSponsored?: boolean;
  };
  preparationTimeMinutes?: number | null;
  lowestMenuPrice?: number | null;
  distanceKm?: number | null;
  deliveryRadiusKm?: number | null;
  isServiceableForSelectedLocation?: boolean | null;
  avgRating?: number | null;
  reviewCount?: number;
  orderNote?: {
    enabled: boolean;
    label: string;
    placeholder: string;
  };
};

export type CustomerRestaurantCategory = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  displayOrder?: number;
};

export type CustomerMenuVariantOption = {
  label: string;
  priceDelta: number;
};

export type CustomerMenuVariantGroup = {
  name: string;
  minSelect?: number;
  maxSelect?: number;
  options: CustomerMenuVariantOption[];
};

export type CustomerMenuAddOnOption = {
  label: string;
  price: number;
};

export type CustomerMenuAddOnGroup = {
  name: string;
  minSelect?: number;
  maxSelect?: number;
  options: CustomerMenuAddOnOption[];
};

export type CustomerMenuItemMarkdown = {
  ruleId: string;
  discountType: "flat" | "percentage";
  discountValue: number;
  /** Threshold + cap so the app can recompute the exact markdown for the selected variant. */
  minItemPrice: number;
  maxDiscountAmount: number;
  /** Full (pre-markdown) starting price, shown struck-through. */
  originalPrice: number;
  /** Discounted starting price the card shows (equals originalPrice when partialVariants). */
  effectivePrice: number;
  /** True when the markdown actually lowers the displayed starting price. */
  hasMarkdown: boolean;
  /** True when only pricier variants qualify — show a "select sizes" badge, not a struck price. */
  partialVariants: boolean;
  discountLabel: string;
};

export type CustomerRestaurantMenuItem = {
  _id: string;
  categoryId: string;
  name: string;
  slug: string;
  description?: string;
  images?: { url?: string }[];
  basePrice: number;
  kind?: "simple" | "variant";
  availability?: "available" | "unavailable";
  isPopular?: boolean;
  recommendedItemIds?: string[];
  variants?: CustomerMenuVariantGroup[];
  addOnGroups?: CustomerMenuAddOnGroup[];
  markdown?: CustomerMenuItemMarkdown | null;
};

export type CustomerVoucherOffer = {
  _id: string;
  restaurantId?: string;
  restaurantIds?: string[];
  scopeType?: string;
  name: string;
  mode?: "auto" | "coupon";
  type?: "flat" | "percentage" | "free_delivery";
  code?: string;
  discountValue?: number;
  minimumOrderAmount?: number;
  maximumDiscountAmount?: number;
  display?: CustomerCampaignDisplay;
};

export type CustomerCampaignDisplay = {
  showOnHome?: boolean;
  showInOfferStrip?: boolean;
  placement?: "top" | "after_banner" | "offers_row";
  variant?: "chip" | "block" | "image" | "carousel";
  position?: number;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  carouselImageUrls?: string[];
  openInModal?: boolean;
  ctaLabel?: string;
  ctaPath?: string;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
};

export type CustomerCampaignPlacement = {
  _id: string;
  voucherId: string;
  name: string;
  code?: string;
  scopeType?: string;
  audienceType?: string;
  display: CustomerCampaignDisplay;
};

export type CustomerHomeBanner = {
  isActive: boolean;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaPath: string;
  tone: "sky" | "mint" | "amber" | "rose";
};

export type CustomerHomeCms = {
  offerStrip: {
    isActive: boolean;
    showVoucherStrip?: boolean;
    showRestaurantOfferSection?: boolean;
    mode: "voucher_strip" | "promo_block" | "hidden";
    title: string;
    subtitle: string;
    variant: "text" | "image" | "image_text" | "carousel";
    buttonStyle?: "pill" | "soft" | "outline" | "dark";
    imageUrl: string;
    imagePublicId?: string;
    carouselAutoPlayEnabled?: boolean;
    carouselIntervalSeconds?: number;
    carouselImageUrls: string[];
    carouselImages?: {
      url: string;
      publicId?: string;
      linkEnabled?: boolean;
      ctaPath?: string;
      /** "Sponsored" ad-label badge; shows only while enabled and before `sponsoredUntil`. */
      sponsored?: boolean;
      sponsoredUntil?: string;
    }[];
    ctaLabel: string;
    ctaPath: string;
    backgroundColor: string;
    textColor: string;
    accentColor: string;
  };
  myOfferSection?: {
    enabled: boolean;
    activeFrom?: string;
  };
  homeCategories?: {
    isActive: boolean;
    title: string;
    subtitle: string;
    items: {
      id?: string;
      label: string;
      searchQuery: string;
      /** Optional Cloudinary image; empty → app falls back to `icon` on `color`. */
      imageUrl?: string;
      imagePublicId?: string;
      icon?: string;
      color?: string;
      position?: number;
      isActive?: boolean;
    }[];
  };
  restaurantSections?: {
    featured: CustomerHomeRestaurantSectionConfig;
    offers: CustomerHomeRestaurantSectionConfig;
    discoverNew: CustomerHomeRestaurantSectionConfig;
    popularNearYou: CustomerHomeRestaurantSectionConfig;
    nearby: CustomerHomeRestaurantSectionConfig;
  };
  cartRecommendations?: CustomerCartRecommendationConfig;
  modal: {
    isActive: boolean;
    title: string;
    subtitle: string;
    imageUrl: string;
    imagePublicId?: string;
    ctaLabel: string;
    ctaPath: string;
    delaySeconds: number;
    frequency: "once_per_session" | "every_refresh";
    backgroundColor: string;
    textColor: string;
    accentColor: string;
  };
  howToOrderGuide?: {
    isActive: boolean;
    audience: "all_users" | "new_users";
    title: string;
    subtitle: string;
    youtubeUrl: string;
    ctaLabel: string;
    placement: "after_search" | "after_offers" | "before_restaurants";
    backgroundColor: string;
    textColor: string;
    accentColor: string;
    guideImages: { url: string; publicId?: string; title?: string }[];
  };
  analytics?: {
    stripImpressions: number;
    stripClicks: number;
    blockImpressions: number;
    blockClicks: number;
    modalImpressions: number;
    modalClicks: number;
    guideImpressions?: number;
    guideVideoClicks?: number;
    guideImageClicks?: number;
    pushOpens?: number;
    lastEventAt: string | null;
  };
  analyticsEvents?: {
    eventType:
      | "strip_impression"
      | "strip_click"
      | "block_impression"
      | "block_click"
      | "modal_impression"
      | "modal_click"
      | "guide_impression"
      | "guide_video_click"
      | "guide_image_click";
    customerId: string;
    customerName: string;
    customerPhone: string;
    occurredAt: string;
  }[];
};

export type CustomerHomeRestaurantSectionConfig = {
  isActive?: boolean;
  title: string;
  subtitle: string;
  source?: "auto" | "manual";
  selectedRestaurantIds?: string[];
  maxItems?: number;
  position?: number;
  layout?: "horizontal" | "vertical";
  allowRepeatAcrossSections?: boolean;
};

export type CustomerCartRecommendationConfig = {
  isActive?: boolean;
  source?: "manual" | "auto" | "both";
  title?: string;
  subtitle?: string;
  maxItems?: number;
};

export type CustomerHomeTimeBasedSection = {
  isActive: boolean;
  windowId: string;
  title: string;
  subtitle: string;
  emoji?: string;
  icon?: string;
  accentColor?: string;
  layout?: "horizontal" | "vertical";
  position?: number;
  /** Whether the section renders above or below the Featured restaurants row. */
  placement?: "above_featured" | "below_featured";
  maxItems?: number;
  restaurants: DiscoverableRestaurant[];
};

export type CustomerActivePoll = {
  pollId: string;
  question: string;
  imageUrl: string;
  options: { id: string; label: string }[];
  allowFeedback: boolean;
  feedbackPrompt: string;
  showResultsToUser: boolean;
  thanksMessage: string;
  endsAt: string | null;
};

export type CustomerHomeDealOffer = {
  id: string;
  name: string;
  discountLabel: string;
  conditionLabel: string;
  type: "auto" | "coupon";
  code: string;
  minimumOrderAmount: number;
};

export type CustomerHomeDealsSection = {
  enabled: boolean;
  title: string;
  offers: CustomerHomeDealOffer[];
};

export type CustomerDiscoveryHome = {
  homeBanner: CustomerHomeBanner | null;
  dealsSection?: CustomerHomeDealsSection;
  areaServiceWindow?: AreaServiceWindow;
  activePoll?: CustomerActivePoll | null;
  homeCms?: CustomerHomeCms;
  timeBasedSection?: CustomerHomeTimeBasedSection | null;
  featuredRestaurants: DiscoverableRestaurant[];
  restaurantsWithOffers: DiscoverableRestaurant[];
  discoverNewRestaurants?: DiscoverableRestaurant[];
  popularNearYouRestaurants?: DiscoverableRestaurant[];
  nearbyRestaurants?: DiscoverableRestaurant[];
  campaignPlacements?: CustomerCampaignPlacement[];
  activeOffers: CustomerVoucherOffer[];
};

export type DiscoverableRestaurantsPage = {
  items: DiscoverableRestaurant[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  hasNextPage: boolean;
  nextPage: number | null;
  /** Does the location have ANY serviceable restaurant, regardless of the active filter?
   *  Lets Browse tell "everything's closed right now" apart from "not in this area yet". */
  areaHasRestaurants?: boolean;
};

export type CustomerRestaurantDetails = {
  restaurant: DiscoverableRestaurant;
  categories: CustomerRestaurantCategory[];
  menuItems: CustomerRestaurantMenuItem[];
  activeOffers: CustomerVoucherOffer[];
  firstOrderDiscount?: {
    eligible: boolean;
    amount: number;
    minimumOrderAmount: number;
  };
  cartRecommendations?: CustomerCartRecommendationConfig;
  recentReviews: {
    id: string;
    rating: number;
    comment?: string;
    createdAt?: string;
    customerName?: string;
    ownerReply?: {
      message: string;
      createdAt?: string | null;
      updatedAt?: string | null;
    } | null;
  }[];
};
