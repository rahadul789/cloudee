export type DiscoverableRestaurant = {
  _id: string;
  name: string;
  slug: string;
  isOpen?: boolean;
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
    carouselImageUrls: string[];
    carouselImages?: { url: string; publicId?: string; ctaPath?: string }[];
    ctaLabel: string;
    ctaPath: string;
    backgroundColor: string;
    textColor: string;
    accentColor: string;
  };
  homeCategories?: {
    isActive: boolean;
    title: string;
    subtitle: string;
    items: {
      id?: string;
      label: string;
      searchQuery: string;
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

export type CustomerDiscoveryHome = {
  homeBanner: CustomerHomeBanner | null;
  homeCms?: CustomerHomeCms;
  featuredRestaurants: DiscoverableRestaurant[];
  restaurantsWithOffers: DiscoverableRestaurant[];
  discoverNewRestaurants?: DiscoverableRestaurant[];
  popularNearYouRestaurants?: DiscoverableRestaurant[];
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
};

export type CustomerRestaurantDetails = {
  restaurant: DiscoverableRestaurant;
  categories: CustomerRestaurantCategory[];
  menuItems: CustomerRestaurantMenuItem[];
  activeOffers: CustomerVoucherOffer[];
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
