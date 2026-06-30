import { z } from "zod"
import { StatusCodes } from "http-status-codes"

import { AdminModel } from "../admin/admin.model"
import { AppError } from "../../common/utils/app-error"
import { fetchWithTimeout } from "../../common/utils/fetch-with-timeout"
import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache"
import { emitSocketEvent } from "../../config/socket"
import { CustomerModel } from "../customer/customer.model"
import { sendPushToCustomer } from "../customer/push.service"
import { OrderModel } from "../owner/operational.model"
import { ServiceZoneModel } from "../service-area/service-area.model"
import { buildOrderServiceAreaScopeFilter } from "../service-area/service-area.service"
import { PublicContentModel } from "./content.model"
import { platformContent } from "./content"

export const defaultAuthRateLimitSettings = {
  signinAttemptsPerWindow: 10,
  signupAttemptsPerWindow: 5,
  otpSendPerPhoneWindow: 5,
  otpSendPerIpWindow: 12,
  otpVerifyAttemptsPerWindow: 8,
  passwordRecoveryPerWindow: 5,
  refreshPerWindow: 30,
  paymentInitiatePerWindow: 8,
  orderPlacePerWindow: 12,
  orderActionPerWindow: 10,
  cartQuotePerWindow: 300,
  couponAttemptPerWindow: 20,
  supportWritePerWindow: 20,
  analyticsEventsPerWindow: 240,
  riderLocationPerWindow: 900,
  adminWritePerWindow: 240,
  ownerWritePerWindow: 240,
  otpPhoneHourlySendLimit: 5,
  otpPhoneDailySendLimit: 15,
  otpIpDailySendLimit: 60,
  otpFailedVerifyLimit: 5,
  otpVerifyLockMinutes: 15,
}

const helpArticleSectionSchema = z.object({
  title: z.string().trim().min(1),
  paragraphs: z.array(z.string().trim().min(1)).optional(),
  bullets: z.array(z.string().trim().min(1)).optional(),
  steps: z.array(z.string().trim().min(1)).optional(),
})

const defaultMapStyleAssignments = {
  default: "app_default",
  "customer.location_picker": "app_default",
  "customer.order_tracking": "app_default",
  "delivery.order_details": "app_default",
  "delivery.map_tab": "app_default",
}

const defaultMapStyleSettings = {
  styles: [
    {
      id: "app_default",
      name: "Google default map",
      description:
        "Uses the native Google map design without any custom JSON styling.",
      isActive: true,
      styleJson: [],
    },
    {
      id: "foodbela_clean",
      name: "Foodbela clean",
      description:
        "Bright delivery map with clear roads, soft land colors, and hidden POI clutter.",
      isActive: true,
      styleJson: [
        { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "poi.business", stylers: [{ visibility: "off" }] },
        { featureType: "poi.school", stylers: [{ visibility: "off" }] },
        { featureType: "poi.medical", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
        { featureType: "administrative", elementType: "labels.text.fill", stylers: [{ color: "#334155" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }, { weight: 1.35 }] },
        { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#F9FBF7" }] },
        { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#DCE4EC" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#F7A8C9" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#334155" }] },
        { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }] },
        { featureType: "water", stylers: [{ color: "#99D8EF" }] },
        { featureType: "landscape", stylers: [{ color: "#EAF4E4" }] },
        { featureType: "landscape.man_made", stylers: [{ color: "#F3EEE6" }] },
      ],
    },
    {
      id: "night_mode",
      name: "Night mode",
      description:
        "Dark map for evening operations with visible roads and muted labels.",
      isActive: true,
      styleJson: [
        { elementType: "geometry", stylers: [{ color: "#1F2937" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#D1D5DB" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#111827" }] },
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#374151" }] },
        { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#4B5563" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#DB2777" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#F3F4F6" }] },
        { featureType: "water", stylers: [{ color: "#0F3A4A" }] },
        { featureType: "landscape", stylers: [{ color: "#172033" }] },
        { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#4B5563" }] },
      ],
    },
    {
      id: "high_visibility",
      name: "High visibility",
      description:
        "High contrast roads and labels for outdoor sunlight and low-end screens.",
      isActive: true,
      styleJson: [
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#111827" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }, { weight: 4 }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }, { weight: 1.8 }] },
        { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#F8FAFC" }] },
        { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#CBD5E1" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#FF2B85" }] },
        { featureType: "water", stylers: [{ color: "#7DD3FC" }] },
        { featureType: "landscape", stylers: [{ color: "#ECFDF5" }] },
        { featureType: "landscape.man_made", stylers: [{ color: "#F8FAFC" }] },
      ],
    },
    {
      id: "minimal_tracking",
      name: "Minimal tracking",
      description:
        "Very quiet map focused on route, rider, customer, and essential road shapes.",
      isActive: true,
      styleJson: [
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
        { featureType: "administrative", elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
        { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#F3F4F6" }] },
        { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#E5E7EB" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#F9A8D4" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
        { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }] },
        { featureType: "water", stylers: [{ color: "#BAE6FD" }] },
        { featureType: "landscape", stylers: [{ color: "#F7F7F2" }] },
      ],
    },
  ],
  assignments: defaultMapStyleAssignments,
}

const mapStyleElementSchema = z.record(z.string(), z.unknown())

const mapStylesSchema = z
  .object({
    styles: z
      .array(
        z.object({
          id: z
            .string()
            .trim()
            .regex(/^[a-z0-9][a-z0-9_-]{1,62}$/),
          name: z.string().trim().min(1).max(80),
          description: z.string().trim().max(200).optional().default(""),
          isActive: z.boolean().optional().default(true),
          styleJson: z.array(mapStyleElementSchema).max(250).optional().default([]),
        })
      )
      .min(1)
      .max(20)
      .optional()
      .default(defaultMapStyleSettings.styles),
    assignments: z
      .record(z.string(), z.string())
      .optional()
      .default(defaultMapStyleAssignments),
  })
  .refine(
    (value) => new Set(value.styles.map((style) => style.id)).size === value.styles.length,
    {
      message: "Map style ids must be unique.",
      path: ["styles"],
    }
  )
  .optional()
  .default(defaultMapStyleSettings)

function homeRestaurantSectionSchema(
  defaultTitle: string,
  defaultSubtitle: string,
  defaultSource: "auto" | "manual",
  defaultMaxItems: number,
  defaultPosition: number,
  defaultLayout: "horizontal" | "vertical",
) {
  return z
    .object({
      isActive: z.boolean().optional().default(true),
      title: z.string().trim().optional().default(defaultTitle),
      subtitle: z.string().trim().optional().default(defaultSubtitle),
      source: z.enum(["auto", "manual"]).optional().default(defaultSource),
      selectedRestaurantIds: z.array(z.string().trim()).optional().default([]),
      maxItems: z.number().int().min(1).max(20).optional().default(defaultMaxItems),
      position: z.number().int().min(1).max(20).optional().default(defaultPosition),
      layout: z.enum(["horizontal", "vertical"]).optional().default(defaultLayout),
      allowRepeatAcrossSections: z.boolean().optional().default(true),
    })
    .optional()
    .default({
      isActive: true,
      title: defaultTitle,
      subtitle: defaultSubtitle,
      source: defaultSource,
      selectedRestaurantIds: [],
      maxItems: defaultMaxItems,
      position: defaultPosition,
      layout: defaultLayout,
      allowRepeatAcrossSections: true,
    })
}

const platformContentSchema = z.object({
  branding: z.object({
    platformName: z.string().trim().min(1),
    tagline: z.string().trim().min(1),
  }),
  customerApp: z.object({
    homeBanner: z.object({
      isActive: z.boolean(),
      title: z.string().trim().min(1),
      subtitle: z.string().trim().min(1),
      ctaLabel: z.string().trim().min(1),
      ctaPath: z.string().trim().min(1),
      tone: z.enum(["sky", "mint", "amber", "rose"]),
    }),
    homeCms: z.object({
      offerStrip: z.object({
        isActive: z.boolean(),
        showVoucherStrip: z.boolean().optional().default(true),
        showRestaurantOfferSection: z.boolean().optional().default(true),
        mode: z.enum(["voucher_strip", "promo_block", "hidden"]),
        title: z.string().trim(),
        subtitle: z.string().trim(),
        variant: z.enum(["text", "image", "image_text", "carousel"]),
        buttonStyle: z.enum(["pill", "soft", "outline", "dark"]),
        imageUrl: z.string().trim(),
        imagePublicId: z.string().trim(),
        carouselImageUrls: z.array(z.string().trim()),
        carouselImages: z.array(
          z.object({
            url: z.string().trim(),
            publicId: z.string().trim(),
            ctaPath: z.string().trim().optional(),
          })
        ),
        ctaLabel: z.string().trim(),
        ctaPath: z.string().trim(),
        backgroundColor: z.string().trim(),
        textColor: z.string().trim(),
        accentColor: z.string().trim(),
      }),
      homeCategories: z.object({
        isActive: z.boolean().optional().default(true),
        title: z.string().trim().optional().default("What are you craving?"),
        subtitle: z.string().trim().optional().default("Quickly find popular food around you."),
        items: z
          .array(
            z.object({
              id: z.string().trim().optional(),
              label: z.string().trim(),
              searchQuery: z.string().trim(),
              icon: z.string().trim().optional().default("restaurant-outline"),
              color: z.string().trim().optional().default("#FFF0F6"),
              position: z.number().optional().default(1),
              isActive: z.boolean().optional().default(true),
            }),
          )
          .optional()
          .default([]),
      }).optional().default({
        isActive: true,
        title: "What are you craving?",
        subtitle: "Quickly find popular food around you.",
        items: [],
      }),
      restaurantSections: z
        .object({
          featured: homeRestaurantSectionSchema("Featured restaurants", "Featured picks for you", "manual", 6, 1, "horizontal"),
          offers: homeRestaurantSectionSchema("Offers for you", "Places with deals you can use today.", "auto", 8, 2, "horizontal"),
          discoverNew: homeRestaurantSectionSchema("Discover new places", "Fresh restaurants you may not have tried yet.", "auto", 6, 3, "horizontal"),
          popularNearYou: homeRestaurantSectionSchema("Popular restaurants", "Most ordered and top rated places on Foodbela.", "auto", 6, 4, "horizontal"),
          nearby: homeRestaurantSectionSchema("Nearby", "Places deliver near your selected pin.", "auto", 8, 5, "vertical"),
        })
        .optional()
        .default({
          featured: {
            isActive: true,
            title: "Featured restaurants",
            subtitle: "Featured picks for you",
            source: "manual",
            selectedRestaurantIds: [],
            maxItems: 6,
            position: 1,
            layout: "horizontal",
            allowRepeatAcrossSections: true,
          },
          offers: {
            isActive: true,
            title: "Offers for you",
            subtitle: "Places with deals you can use today.",
            source: "auto",
            selectedRestaurantIds: [],
            maxItems: 8,
            position: 2,
            layout: "horizontal",
            allowRepeatAcrossSections: true,
          },
          discoverNew: {
            isActive: true,
            title: "Discover new places",
            subtitle: "Fresh restaurants you may not have tried yet.",
            source: "auto",
            selectedRestaurantIds: [],
            maxItems: 6,
            position: 3,
            layout: "horizontal",
            allowRepeatAcrossSections: true,
          },
          popularNearYou: {
            isActive: true,
            title: "Popular restaurants",
            subtitle: "Most ordered and top rated places on Foodbela.",
            source: "auto",
            selectedRestaurantIds: [],
            maxItems: 6,
            position: 4,
            layout: "horizontal",
            allowRepeatAcrossSections: true,
          },
          nearby: {
            isActive: true,
            title: "Nearby",
            subtitle: "Places deliver near your selected pin.",
            source: "auto",
            selectedRestaurantIds: [],
            maxItems: 8,
            position: 5,
            layout: "vertical",
            allowRepeatAcrossSections: true,
          },
        }),
      timeBasedSection: z
        .object({
          isActive: z.boolean().optional().default(true),
          source: z.enum(["auto", "manual"]).optional().default("auto"),
          layout: z.enum(["horizontal", "vertical"]).optional().default("horizontal"),
          position: z.number().int().min(1).max(20).optional().default(1),
          maxItems: z.number().int().min(1).max(20).optional().default(8),
          windows: z
            .array(
              z.object({
                id: z.string().trim().min(1),
                label: z.string().trim().optional().default(""),
                title: z.string().trim().min(1),
                subtitle: z.string().trim().optional().default(""),
                emoji: z.string().trim().optional().default(""),
                icon: z.string().trim().optional().default("time-outline"),
                accentColor: z.string().trim().optional().default("#FF5C93"),
                // 0-23 start hour, 1-24 end hour (Asia/Dhaka). end <= start means
                // the window wraps past midnight (e.g. 22 -> 2).
                startHour: z.number().min(0).max(23).optional().default(0),
                endHour: z.number().min(1).max(24).optional().default(24),
                matchTags: z.array(z.string().trim()).optional().default([]),
                selectedRestaurantIds: z.array(z.string().trim()).optional().default([]),
                isActive: z.boolean().optional().default(true),
              }),
            )
            .optional()
            .default([]),
        })
        .optional()
        .default({
          isActive: true,
          source: "auto",
          layout: "horizontal",
          position: 1,
          maxItems: 8,
          windows: [],
        }),
      cartRecommendations: z
        .object({
          isActive: z.boolean().optional().default(true),
          source: z.enum(["manual", "auto", "both"]).optional().default("both"),
          title: z.string().trim().optional().default("Recommended add-ons"),
          subtitle: z.string().trim().optional().default("Small extras that go well with this cart."),
          maxItems: z.number().int().min(1).max(20).optional().default(8),
        })
        .optional()
        .default({
          isActive: true,
          source: "both",
          title: "Recommended add-ons",
          subtitle: "Small extras that go well with this cart.",
          maxItems: 8,
        }),
      modal: z.object({
        isActive: z.boolean(),
        title: z.string().trim(),
        subtitle: z.string().trim(),
        imageUrl: z.string().trim(),
        imagePublicId: z.string().trim(),
        ctaLabel: z.string().trim(),
        ctaPath: z.string().trim(),
        delaySeconds: z.number().int().min(0).max(3600),
        frequency: z.enum(["once_per_session", "every_refresh"]),
        backgroundColor: z.string().trim(),
        textColor: z.string().trim(),
        accentColor: z.string().trim(),
      }),
      howToOrderGuide: z.object({
        isActive: z.boolean(),
        audience: z.enum(["all_users", "new_users"]),
        title: z.string().trim(),
        subtitle: z.string().trim(),
        youtubeUrl: z.string().trim(),
        ctaLabel: z.string().trim(),
        placement: z.enum(["after_search", "after_offers", "before_restaurants"]),
        backgroundColor: z.string().trim(),
        textColor: z.string().trim(),
        accentColor: z.string().trim(),
        guideImages: z.array(
          z.object({
            url: z.string().trim(),
            publicId: z.string().trim(),
            title: z.string().trim().optional(),
          })
        ),
      }),
      pushCampaign: z.object({
        contentType: z.enum(["text", "image", "image_text"]),
        title: z.string().trim(),
        body: z.string().trim(),
        imageUrl: z.string().trim(),
        imagePublicId: z.string().trim(),
        path: z.string().trim(),
        currentCampaignId: z.string().trim(),
        audienceType: z.enum(["all_users", "new_users", "returning_users", "selected_users"]),
        selectedCustomerIds: z.array(z.string().trim()),
        customerGroupKey: z.string().trim(),
        restaurantScope: z.enum(["all_restaurants", "selected_restaurants"]),
        selectedRestaurantIds: z.array(z.string().trim()),
        abTest: z.object({
          enabled: z.boolean(),
          splitPercent: z.number().int().min(1).max(99),
          variantBTitle: z.string().trim(),
          variantBBody: z.string().trim(),
          variantBPath: z.string().trim(),
        }),
        lastSentAt: z.string().nullable(),
        totalTargets: z.number().int().min(0),
        sentCount: z.number().int().min(0),
        disabledCount: z.number().int().min(0),
        openCount: z.number().int().min(0),
        recipientEvents: z.array(
          z.object({
            customerId: z.string().trim(),
            customerName: z.string().trim(),
            customerPhone: z.string().trim(),
            sentAt: z.string().trim(),
            status: z.enum(["sent", "in_app_only", "preference_disabled", "failed"]),
            expoTokenCount: z.number().int().min(0),
            ticketIds: z.array(z.string().trim()).optional(),
            receiptStatus: z
              .enum(["pending", "delivered_to_provider", "failed", "device_not_registered"])
              .optional(),
            receiptCheckedAt: z.string().trim().nullable().optional(),
            receiptError: z.string().trim().optional(),
            variant: z.enum(["A", "B"]).optional(),
          })
        ),
        openEvents: z.array(
          z.object({
            customerId: z.string().trim(),
            customerName: z.string().trim(),
            customerPhone: z.string().trim(),
            openedAt: z.string().trim(),
            path: z.string().trim(),
            campaignId: z.string().trim().optional(),
            variant: z.enum(["A", "B"]).optional(),
          })
        ),
        receiptCheckedAt: z.string().nullable(),
        conversionWindowDays: z.number().int().min(1).max(30),
        scheduledAt: z.string().nullable(),
        scheduleStatus: z.enum(["none", "scheduled", "sending", "sent", "cancelled", "failed"]),
        scheduledByAdminId: z.string().trim(),
        scheduledCreatedAt: z.string().nullable(),
        scheduleHistory: z.array(
          z.object({
            action: z.enum(["scheduled", "cancelled", "sent", "failed"]),
            scheduledAt: z.string().nullable(),
            occurredAt: z.string().trim(),
            adminId: z.string().trim(),
            note: z.string().trim(),
          })
        ),
        conversions: z.object({
          orderCount: z.number().int().min(0),
          deliveredOrderCount: z.number().int().min(0),
          deliveredRevenue: z.number().min(0),
          uniqueOrderingCustomers: z.number().int().min(0),
          conversionRate: z.number().min(0),
          refreshedAt: z.string().nullable(),
          convertedOrders: z.array(
            z.object({
              orderId: z.string().trim(),
              orderNumber: z.string().trim(),
              customerId: z.string().trim(),
              customerName: z.string().trim(),
              status: z.string().trim(),
              total: z.number().min(0),
              createdAt: z.string().trim(),
            })
          ),
        }),
        campaignHistory: z.array(z.any()),
      }),
      analytics: z.object({
        stripImpressions: z.number().int().min(0),
        stripClicks: z.number().int().min(0),
        blockImpressions: z.number().int().min(0),
        blockClicks: z.number().int().min(0),
        modalImpressions: z.number().int().min(0),
        modalClicks: z.number().int().min(0),
        guideImpressions: z.number().int().min(0),
        guideVideoClicks: z.number().int().min(0),
        guideImageClicks: z.number().int().min(0),
        pushOpens: z.number().int().min(0),
        lastEventAt: z.string().nullable(),
      }),
      analyticsEvents: z.array(
        z.object({
          eventType: z.enum([
            "strip_impression",
            "strip_click",
            "block_impression",
            "block_click",
            "modal_impression",
            "modal_click",
            "guide_impression",
            "guide_video_click",
            "guide_image_click",
          ]),
          customerId: z.string().trim(),
          customerName: z.string().trim(),
          customerPhone: z.string().trim(),
          occurredAt: z.string().trim(),
        })
      ),
    }),
  }),
  operations: z.object({
    ownerApp: z
      .object({
        webDashboardUrl: z
          .string()
          .trim()
          .url()
          .max(500)
          .optional()
          .default("http://localhost:5173"),
        showCustomerPhoneNumbers: z.boolean().optional().default(true),
      })
      .optional()
      .default({
        webDashboardUrl: "http://localhost:5173",
        showCustomerPhoneNumbers: true,
      }),
    serviceArea: z.object({
      name: z.string().trim().min(1),
      centerLatitude: z.number().min(-90).max(90),
      centerLongitude: z.number().min(-180).max(180),
      radiusKm: z.number().positive().max(50),
    }),
    deliveryPricing: z.object({
      baseFeeTaka: z.number().int().min(0).max(5000).optional().default(20),
      distanceSurchargeEnabled: z.boolean().optional().default(false),
      surchargeStartsAfterKm: z.number().min(0).max(100).optional().default(2),
      surchargeStepMeters: z.number().int().min(100).max(10000).optional().default(500),
      surchargeAmountTaka: z.number().int().min(0).max(5000).optional().default(5),
    }),
    reviewRequests: z
      .object({
        autoEnabled: z.boolean().optional().default(true),
        riderReviewEnabled: z.boolean().optional().default(true),
        delayMinutes: z.number().int().min(0).max(1440).optional().default(20),
        maxReminders: z.number().int().min(1).max(5).optional().default(2),
        reminderGapHours: z.number().min(1).max(168).optional().default(24),
        windowHours: z.number().min(1).max(336).optional().default(72),
        quietHoursStart: z.number().int().min(0).max(23).optional().default(22),
        quietHoursEnd: z.number().int().min(0).max(23).optional().default(9),
        pushTitle: z
          .string()
          .trim()
          .optional()
          .default("How was your order? ⭐"),
        pushBody: z
          .string()
          .trim()
          .optional()
          .default("Tap to rate — your feedback helps others order with confidence."),
      })
      .optional()
      .default({
        autoEnabled: true,
        riderReviewEnabled: true,
        delayMinutes: 20,
        maxReminders: 2,
        reminderGapHours: 24,
        windowHours: 72,
        quietHoursStart: 22,
        quietHoursEnd: 9,
        pushTitle: "How was your order? ⭐",
        pushBody: "Tap to rate — your feedback helps others order with confidence.",
      }),
    routing: z
      .object({
        provider: z.enum(["google", "haversine"]).optional().default("google"),
        fallbackSpeedKmph: z.number().min(5).max(120).optional().default(22),
        pickupBufferMinutes: z.number().int().min(0).max(60).optional().default(5),
        costMode: z.enum(["economy", "balanced", "precision"]).optional().default("balanced"),
        googleMonthlyLimit: z.number().int().min(0).max(1_000_000).optional().default(10000),
        maxGoogleCallsPerOrder: z.number().int().min(0).max(100).optional().default(5),
        routeSessionTtlMinutes: z.number().int().min(5).max(240).optional().default(45),
        rerouteCooldownSeconds: z.number().int().min(30).max(1800).optional().default(180),
        offRouteThresholdMeters: z.number().int().min(20).max(500).optional().default(90),
        offRouteConsecutiveUpdates: z.number().int().min(1).max(10).optional().default(3),
        periodicRefreshMinutes: z.number().int().min(0).max(60).optional().default(5),
        nearDestinationMeters: z.number().int().min(50).max(1000).optional().default(220),
      })
      .optional()
      .default({
        provider: "google",
        fallbackSpeedKmph: 22,
        pickupBufferMinutes: 5,
        costMode: "balanced",
        googleMonthlyLimit: 10000,
        maxGoogleCallsPerOrder: 5,
        routeSessionTtlMinutes: 45,
        rerouteCooldownSeconds: 180,
        offRouteThresholdMeters: 90,
        offRouteConsecutiveUpdates: 3,
        periodicRefreshMinutes: 5,
        nearDestinationMeters: 220,
      }),
    mapStyles: mapStylesSchema,
    liveTracking: z.object({
      mode: z.enum(["balanced", "battery_saver", "high_accuracy"]).optional().default("balanced"),
      updateIntervalSeconds: z.number().int().min(10).max(60).optional().default(15),
      distanceIntervalMeters: z.number().int().min(30).max(100).optional().default(60),
      passiveHeartbeatSeconds: z.number().int().min(30).max(180).optional().default(60),
    }),
    failedDelivery: z
      .object({
        customerFaultRefundPercent: z.number().min(0).max(100).optional().default(80),
        restaurantCompensationPercent: z.number().min(0).max(200).optional().default(100),
        riderFailedTripPay: z.number().min(0).max(100_000).optional().default(30),
      })
      .optional()
      .default({
        customerFaultRefundPercent: 80,
        restaurantCompensationPercent: 100,
        riderFailedTripPay: 30,
      }),
    payments: z.object({
      cashOnDeliveryEnabled: z.boolean().optional().default(true),
      bkashEnabled: z.boolean().optional().default(false),
      bkashLabel: z.string().trim().min(1).max(40).optional().default("bKash"),
      bkashSubtitle: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .optional()
        .default("Continue to the official hosted payment page."),
      bkashRefundEtaMinutes: z.number().int().min(1).max(24 * 60).optional().default(60),
      bkashRefundSmsEnabled: z.boolean().optional().default(true),
      bkashRefundSmsTemplate: z
        .string()
        .trim()
        .min(20)
        .max(320)
        .optional()
        .default(
          "{{platformName}}: Refund completed for {{orderNumber}}. Amount {{amount}}. Ref {{refundReference}}."
        ),
    }),
    finance: z
      .object({
        settlementDelayDays: z.number().int().min(0).max(30).optional().default(3),
        minimumPayoutAmountEnabled: z.boolean().optional().default(true),
        minimumPayoutAmountTaka: z.number().int().min(0).max(100000).optional().default(500),
        oneActivePayoutRequest: z.boolean().optional().default(true),
      })
      .optional()
      .default({
        settlementDelayDays: 3,
        minimumPayoutAmountEnabled: true,
        minimumPayoutAmountTaka: 500,
        oneActivePayoutRequest: true,
      }),
    adminNotifications: z
      .object({
        orderPlaced: z.boolean().optional().default(true),
        customerOrderUpdates: z.boolean().optional().default(false),
        orderDelays: z.boolean().optional().default(true),
        preparationDelays: z.boolean().optional().default(true),
        riderDelays: z.boolean().optional().default(true),
        deliveryDelays: z.boolean().optional().default(true),
        paymentExceptions: z.boolean().optional().default(true),
        payoutRequests: z.boolean().optional().default(true),
        support: z.boolean().optional().default(true),
        security: z.boolean().optional().default(true),
        campaigns: z.boolean().optional().default(true),
      })
      .optional()
      .default({
        orderPlaced: true,
        customerOrderUpdates: false,
        orderDelays: true,
        preparationDelays: true,
        riderDelays: true,
        deliveryDelays: true,
        paymentExceptions: true,
        payoutRequests: true,
        support: true,
        security: true,
        campaigns: true,
      }),
    referrals: z
      .object({
        enabled: z.boolean().optional().default(true),
        rewardAmountTaka: z.number().int().min(1).max(10000).optional().default(50),
        minimumOrderAmountTaka: z.number().int().min(0).max(100000).optional().default(250),
        voucherExpiryDays: z.number().int().min(1).max(365).optional().default(30),
        monthlyRewardCapPerCustomer: z.number().int().min(1).max(100).optional().default(5),
        shareLinkTemplate: z
          .string()
          .trim()
          .min(1)
          .max(500)
          .optional()
          .default("foodbela://checkout?ref={{code}}"),
        shareMessageTemplate: z
          .string()
          .trim()
          .min(1)
          .max(700)
          .optional()
          .default(
            "Use my Foodbela referral code {{code}} at checkout before your first delivered order. After your first delivered order, I get a Tk {{rewardAmount}} reward voucher. {{link}}"
          ),
      })
      .optional()
      .default({
        enabled: true,
        rewardAmountTaka: 50,
        minimumOrderAmountTaka: 250,
        voucherExpiryDays: 30,
        monthlyRewardCapPerCustomer: 5,
        shareLinkTemplate: "foodbela://checkout?ref={{code}}",
        shareMessageTemplate:
          "Use my Foodbela referral code {{code}} at checkout before your first delivered order. After your first delivered order, I get a Tk {{rewardAmount}} reward voucher. {{link}}",
      }),
    dispatch: z.object({
      autoAssignmentEnabled: z.boolean(),
      autoReassignTimedOutOrders: z.boolean(),
      dispatchMode: z.enum(["fleet", "primary_rider"]),
      primaryRiderId: z.string(),
      primaryRiderFallbackEnabled: z.boolean(),
      algorithm: z.enum(["nearest_eligible_balanced", "least_loaded_first"]),
      ownerAcceptanceTimeoutMinutes: z.number().int().min(1).max(180),
      maxActiveOrdersPerRider: z.number().int().min(1).max(50),
      staleLocationCutoffMinutes: z.number().int().min(1).max(180),
      assignmentTimeoutMinutes: z.number().int().min(1).max(180),
      prepStartGraceMinutes: z.number().int().min(1).max(180).optional().default(3),
      preparationMaxExtraMinutes: z.number().int().min(0).max(180).optional().default(20),
      prepLateGraceMinutes: z.number().int().min(0).max(180).optional().default(5),
      pickupLateGraceMinutes: z.number().int().min(1).max(180).optional().default(10),
      deliveryLateGraceMinutes: z.number().int().min(1).max(180).optional().default(10),
      deliveryWatchAfterPickupMinutes: z.number().int().min(1).max(240).optional().default(20),
      deliveryLateAfterPickupMinutes: z.number().int().min(1).max(240).optional().default(25),
      deliveryCriticalAfterPickupMinutes: z.number().int().min(1).max(240).optional().default(30),
      riderEtaSpeedKmph: z.number().min(6).max(45).optional().default(24),
      riderEtaRouteFactor: z.number().min(1).max(2).optional().default(1.1),
      retryCooldownMinutes: z.number().int().min(1).max(60),
      surgeReadyOrderThreshold: z.number().int().min(1).max(100),
      surgeUnassignedOrderThreshold: z.number().int().min(1).max(100),
      autoCancelUnacceptedOrdersEnabled: z.boolean().optional().default(true),
      autoCancelAfterMinutes: z.number().int().min(2).max(240).optional().default(12),
      autoCancelNotifyBeforeMinutes: z.number().int().min(1).max(60).optional().default(3),
    }),
  }),
  auth: z.object({
    otp: z.object({
      expiresInSeconds: z.number().int().min(60).max(900),
      resendCooldownSeconds: z.number().int().min(15).max(300),
      messageTemplate: z
        .string()
        .trim()
        .min(20)
        .max(320)
        .refine((value) => value.includes("{{code}}"), {
          message: "OTP message template must include {{code}}",
        }),
    }),
    rateLimits: z
      .object({
        signinAttemptsPerWindow: z.number().int().min(2).max(100).optional().default(10),
        signupAttemptsPerWindow: z.number().int().min(1).max(50).optional().default(5),
        otpSendPerPhoneWindow: z.number().int().min(1).max(30).optional().default(5),
        otpSendPerIpWindow: z.number().int().min(3).max(100).optional().default(12),
        otpVerifyAttemptsPerWindow: z.number().int().min(3).max(30).optional().default(8),
        passwordRecoveryPerWindow: z.number().int().min(1).max(30).optional().default(5),
        refreshPerWindow: z.number().int().min(10).max(300).optional().default(30),
        paymentInitiatePerWindow: z.number().int().min(2).max(60).optional().default(8),
        orderPlacePerWindow: z.number().int().min(2).max(100).optional().default(12),
        orderActionPerWindow: z.number().int().min(2).max(100).optional().default(10),
        cartQuotePerWindow: z.number().int().min(60).max(1000).optional().default(300),
        couponAttemptPerWindow: z.number().int().min(5).max(200).optional().default(20),
        supportWritePerWindow: z.number().int().min(5).max(200).optional().default(20),
        analyticsEventsPerWindow: z.number().int().min(60).max(2000).optional().default(240),
        riderLocationPerWindow: z.number().int().min(120).max(3000).optional().default(900),
        adminWritePerWindow: z.number().int().min(60).max(1000).optional().default(240),
        ownerWritePerWindow: z.number().int().min(60).max(1000).optional().default(240),
        otpPhoneHourlySendLimit: z.number().int().min(1).max(60).optional().default(5),
        otpPhoneDailySendLimit: z.number().int().min(1).max(200).optional().default(15),
        otpIpDailySendLimit: z.number().int().min(5).max(1000).optional().default(60),
        otpFailedVerifyLimit: z.number().int().min(3).max(20).optional().default(5),
        otpVerifyLockMinutes: z.number().int().min(5).max(1440).optional().default(15),
      })
      .optional()
      .default(defaultAuthRateLimitSettings),
  }),
  supportContact: z.object({
    email: z.string().trim().email(),
    phone: z.string().trim().min(1),
    supportHours: z.string().trim().min(1),
    reportLabel: z.string().trim().min(1),
    directHelpNote: z.string().trim().min(1),
  }),
  helpCenter: z.object({
    categories: z.array(
      z.object({
        id: z.string().trim().min(1),
        name: z.string().trim().min(1),
        description: z.string().trim().min(1),
        iconKey: z.string().trim().min(1),
      })
    ),
    articles: z.array(
      z.object({
        id: z.string().trim().min(1),
        categoryId: z.string().trim().min(1),
        title: z.string().trim().min(1),
        excerpt: z.string().trim().min(1),
        readTime: z.string().trim().min(1),
        sections: z.array(helpArticleSectionSchema),
      })
    ),
    faqs: z.array(
      z.object({
        id: z.string().trim().min(1),
        categoryId: z.string().trim().min(1),
        question: z.string().trim().min(1),
        answer: z.string().trim().min(1),
      })
    ),
  }),
  legal: z.object({
    privacyPolicy: z.object({
      title: z.string().trim().min(1),
      label: z.string().trim().min(1),
      description: z.string().trim().min(1),
      lastUpdated: z.string().trim().min(1),
      effectiveDate: z.string().trim().min(1),
      overviewTitle: z.string().trim().min(1),
      overviewDescription: z.string().trim().min(1),
      trustTitle: z.string().trim().min(1),
      trustDescription: z.string().trim().min(1),
      sections: z.array(
        z.object({
          id: z.string().trim().min(1),
          title: z.string().trim().min(1),
          body: z.array(z.string().trim().min(1)),
        })
      ),
    }),
    termsAndConditions: z.object({
      title: z.string().trim().min(1),
      label: z.string().trim().min(1),
      description: z.string().trim().min(1),
      noticeTitle: z.string().trim().min(1),
      noticeDescription: z.string().trim().min(1),
      sections: z.array(
        z.object({
          id: z.string().trim().min(1),
          title: z.string().trim().min(1),
          body: z.array(z.string().trim().min(1)),
        })
      ),
    }),
  }),
})

type PlatformContent = z.infer<typeof platformContentSchema>
type PlatformContentScope = { zoneId?: string; districtId?: string }
const defaultPlatformContent = platformContentSchema.parse(platformContent)
export type OperationalFinanceSettings = PlatformContent["operations"]["finance"]
export type AuthRateLimitSettings = PlatformContent["auth"]["rateLimits"]
type CustomerHomeCms = PlatformContent["customerApp"]["homeCms"]
type AdminEditablePlatformContent = {
  content: PlatformContent
  meta: {
    updatedAt: string | null
    updatedByAdminId: string | null
    updatedByAdminName: string
  }
  history: Array<{
    updatedAt: string
    updatedByAdminId: string | null
    updatedByAdminName: string
    changedSections: string[]
  }>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function deepMerge<T>(base: T, override: unknown): T {
  if (Array.isArray(base)) {
    return (Array.isArray(override) ? override : base) as T
  }

  if (!isObject(base) || !isObject(override)) {
    return (override ?? base) as T
  }

  const result: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key]
    result[key] =
      isObject(baseValue) && isObject(value)
        ? deepMerge(baseValue, value)
        : Array.isArray(baseValue)
          ? (Array.isArray(value) ? value : baseValue)
          : value
  }

  return result as T
}

function normalizeHomeCmsForRuntime(homeCms: CustomerHomeCms): CustomerHomeCms {
  const offerStrip = {
    ...homeCms.offerStrip,
    showVoucherStrip: homeCms.offerStrip.showVoucherStrip !== false,
    showRestaurantOfferSection:
      homeCms.offerStrip.showRestaurantOfferSection !== false,
    carouselImageUrls: Array.isArray(homeCms.offerStrip.carouselImageUrls)
      ? homeCms.offerStrip.carouselImageUrls.filter((url) => url.trim())
      : [],
    carouselImages: Array.isArray(homeCms.offerStrip.carouselImages)
      ? homeCms.offerStrip.carouselImages.filter((image) => image.url.trim())
      : [],
  }

  return {
    ...homeCms,
    offerStrip:
      offerStrip.mode === "promo_block"
        ? offerStrip
        : {
            ...offerStrip,
            isActive: false,
          },
  }
}

function normalizePlatformContentHomeCms<T extends PlatformContent>(content: T): T {
  const contentWithMapStyles = withDefaultMapStyles(content)

  return {
    ...contentWithMapStyles,
    customerApp: {
      ...contentWithMapStyles.customerApp,
      homeCms: normalizeHomeCmsForRuntime(contentWithMapStyles.customerApp.homeCms),
    },
  } as T
}

function withDefaultHomeCategories(content: PlatformContent): PlatformContent {
  const defaultCategories = defaultPlatformContent.customerApp.homeCms.homeCategories.items
  const currentCategories = content.customerApp.homeCms.homeCategories
  const currentItems = Array.isArray(currentCategories.items)
    ? currentCategories.items
    : []
  const currentIds = new Set(currentItems.map((item) => item.id).filter(Boolean))
  const currentLabels = new Set(currentItems.map((item) => item.label.trim().toLowerCase()).filter(Boolean))
  const missingDefaults = defaultCategories.filter((item) => {
    if (item.id && currentIds.has(item.id)) return false
    return !currentLabels.has(item.label.trim().toLowerCase())
  })

  if (!missingDefaults.length) return content
  const maxPosition = currentItems.reduce((max, item, index) => {
    const position = typeof item.position === "number" ? item.position : index + 1
    return Math.max(max, position)
  }, 0)
  const itemsToAppend = currentItems.length
    ? missingDefaults.map((item, index) => ({
        ...item,
        position: maxPosition + index + 1,
      }))
    : missingDefaults

  return {
    ...content,
    customerApp: {
      ...content.customerApp,
      homeCms: {
        ...content.customerApp.homeCms,
        homeCategories: {
          ...currentCategories,
          items: [...currentItems, ...itemsToAppend],
        },
      },
    },
  }
}

function withDefaultMapStyles(content: PlatformContent): PlatformContent {
  const defaultMapStyles = defaultPlatformContent.operations.mapStyles
  const currentMapStyles = content.operations.mapStyles
  const rawDefaultStyle = defaultMapStyles.styles.find((style) => style.id === "app_default")
  const currentStyles = Array.isArray(currentMapStyles.styles)
    ? currentMapStyles.styles.map((style) =>
        style.id === "app_default" && rawDefaultStyle
          ? { ...rawDefaultStyle }
          : style
      )
    : []
  const currentStyleIds = new Set(currentStyles.map((style) => style.id))
  const missingStyles = defaultMapStyles.styles.filter(
    (style) => !currentStyleIds.has(style.id)
  )
  const assignments = {
    ...defaultMapStyles.assignments,
    ...(currentMapStyles.assignments ?? {}),
  }

  if (!missingStyles.length) {
    return {
      ...content,
      operations: {
        ...content.operations,
        mapStyles: {
          ...currentMapStyles,
          assignments,
        },
      },
    }
  }

  return {
    ...content,
    operations: {
      ...content.operations,
      mapStyles: {
        ...currentMapStyles,
        styles: [...currentStyles, ...missingStyles],
        assignments,
      },
    },
  }
}

function contentScopeKey(scope?: PlatformContentScope) {
  return scope?.zoneId?.trim()
    ? `zone:${scope.zoneId.trim()}`
    : scope?.districtId?.trim()
      ? `district:${scope.districtId.trim()}`
      : ""
}

function contentScopeKeys(scope?: PlatformContentScope) {
  return [
    scope?.zoneId?.trim() ? `zone:${scope.zoneId.trim()}` : "",
    scope?.districtId?.trim() ? `district:${scope.districtId.trim()}` : "",
  ].filter(Boolean)
}

function getHomeCmsAreaOverrides(content: Record<string, any>) {
  const customerApp = content.customerApp ?? {}
  return customerApp.homeCmsAreaOverrides && typeof customerApp.homeCmsAreaOverrides === "object"
    ? customerApp.homeCmsAreaOverrides as Record<string, unknown>
    : {}
}

function buildHomeCmsAreaOverride(homeCms: PlatformContent["customerApp"]["homeCms"]) {
  const normalizedHomeCms = normalizeHomeCmsForRuntime(homeCms)
  return {
    offerStrip: normalizedHomeCms.offerStrip,
    homeCategories: normalizedHomeCms.homeCategories,
    restaurantSections: normalizedHomeCms.restaurantSections,
    timeBasedSection: normalizedHomeCms.timeBasedSection,
    cartRecommendations: normalizedHomeCms.cartRecommendations,
    modal: normalizedHomeCms.modal,
    howToOrderGuide: normalizedHomeCms.howToOrderGuide,
    pushCampaign: normalizedHomeCms.pushCampaign,
  }
}

function applyHomeCmsAreaOverride<T extends PlatformContent>(
  content: T,
  scope?: PlatformContentScope,
): T {
  const overrides = getHomeCmsAreaOverrides(content as unknown as Record<string, any>)
  const override = contentScopeKeys(scope)
    .map((key) => overrides[key])
    .find(Boolean)
  if (!override) return normalizePlatformContentHomeCms(content)

  return normalizePlatformContentHomeCms(deepMerge(content, {
    customerApp: {
      homeCms: {
        ...(override as Record<string, unknown>),
      },
    },
  }))
}

export function applyServiceAreaHomeCmsOverride<T extends PlatformContent>(
  content: T,
  serviceArea?: { zoneId?: string; districtId?: string } | null,
) {
  return applyHomeCmsAreaOverride(content, serviceArea ?? undefined)
}

const CONTENT_KEY = "platform-content"
const platformContentCacheTtlMs = 30_000
const platformContentHistoryLimit = 6
const platformContentCache = createInMemoryAsyncCache<PlatformContent>({
  ttlMs: platformContentCacheTtlMs,
  maxEntries: 1,
})
const adminEditablePlatformContentCache =
  createInMemoryAsyncCache<AdminEditablePlatformContent>({
    ttlMs: platformContentCacheTtlMs,
    maxEntries: 1,
  })
const platformContentInvalidationListeners = new Set<() => void>()

export function registerPlatformContentInvalidationListener(listener: () => void) {
  platformContentInvalidationListeners.add(listener)
  return () => platformContentInvalidationListeners.delete(listener)
}

function notifyPlatformContentInvalidated() {
  for (const listener of platformContentInvalidationListeners) {
    try {
      listener()
    } catch {
      // Cache invalidation listeners must never block CMS publishing.
    }
  }
}

function emitPlatformContentUpdated(payload: {
  updatedAt: string
  updatedByAdminId: string
  updatedByAdminName: string
  changedSections: string[]
}) {
  emitSocketEvent("admin:ops", "admin.platform-content.updated", payload)
}

const SECTION_LABELS = {
  branding: "Branding",
  customerApp: "Customer App",
  operations: "Operations",
  auth: "Authentication",
  supportContact: "Support Contact",
  helpCategories: "Help Categories",
  helpArticles: "Help Guides",
  helpFaqs: "FAQs",
  privacyPolicy: "Privacy Policy",
  termsAndConditions: "Terms & Conditions",
} as const

function isEqualSection(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function getChangedSections(
  previousContent: PlatformContent | null,
  nextContent: PlatformContent
) {
  if (!previousContent) {
    return Object.values(SECTION_LABELS)
  }

  const changedSections: string[] = []

  if (!isEqualSection(previousContent.branding, nextContent.branding)) {
    changedSections.push(SECTION_LABELS.branding)
  }

  if (!isEqualSection(previousContent.customerApp, nextContent.customerApp)) {
    changedSections.push(SECTION_LABELS.customerApp)
  }

  if (!isEqualSection(previousContent.operations, nextContent.operations)) {
    changedSections.push(SECTION_LABELS.operations)
  }

  if (!isEqualSection(previousContent.auth, nextContent.auth)) {
    changedSections.push(SECTION_LABELS.auth)
  }

  if (!isEqualSection(previousContent.supportContact, nextContent.supportContact)) {
    changedSections.push(SECTION_LABELS.supportContact)
  }

  if (
    !isEqualSection(
      previousContent.helpCenter.categories,
      nextContent.helpCenter.categories
    )
  ) {
    changedSections.push(SECTION_LABELS.helpCategories)
  }

  if (
    !isEqualSection(previousContent.helpCenter.articles, nextContent.helpCenter.articles)
  ) {
    changedSections.push(SECTION_LABELS.helpArticles)
  }

  if (!isEqualSection(previousContent.helpCenter.faqs, nextContent.helpCenter.faqs)) {
    changedSections.push(SECTION_LABELS.helpFaqs)
  }

  if (
    !isEqualSection(previousContent.legal.privacyPolicy, nextContent.legal.privacyPolicy)
  ) {
    changedSections.push(SECTION_LABELS.privacyPolicy)
  }

  if (
    !isEqualSection(
      previousContent.legal.termsAndConditions,
      nextContent.legal.termsAndConditions
    )
  ) {
    changedSections.push(SECTION_LABELS.termsAndConditions)
  }

  return changedSections.length > 0 ? changedSections : ["No visible section change"]
}

function mapAdminEditablePlatformContent(
  content: PlatformContent,
  contentDoc?: {
    updatedAt?: Date | string | null
    updatedByAdminId?: string | null
    updatedByAdminName?: string | null
    history?: Array<{
      updatedAt: Date | string
      updatedByAdminId?: string | null
      updatedByAdminName?: string | null
      changedSections?: string[] | null
    }>
  } | null
) {
  const toIsoStringOrNull = (value: Date | string | null | undefined) => {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  return {
    content,
    meta: {
      updatedAt: toIsoStringOrNull(contentDoc?.updatedAt),
      updatedByAdminId: contentDoc?.updatedByAdminId ?? null,
      updatedByAdminName: contentDoc?.updatedByAdminName ?? "",
    },
    history:
      contentDoc?.history?.map((entry) => ({
        updatedAt: toIsoStringOrNull(entry.updatedAt) ?? "",
        updatedByAdminId:
          typeof entry.updatedByAdminId === "string" ? entry.updatedByAdminId : null,
        updatedByAdminName:
          typeof entry.updatedByAdminName === "string" ? entry.updatedByAdminName : "",
        changedSections:
          Array.isArray(entry.changedSections) && entry.changedSections.length > 0
            ? entry.changedSections.filter((value): value is string => typeof value === "string")
            : ["Unknown change"],
      })) ?? [],
  } satisfies AdminEditablePlatformContent
}

export async function getPlatformContent(scope?: PlatformContentScope) {
  const baseContent = await platformContentCache.getOrSet(CONTENT_KEY, async () => {
    const contentDoc = await PublicContentModel.findOne({ key: CONTENT_KEY })
      .select({ content: 1 })
      .lean()
    const content = contentDoc?.content
      ? deepMerge(defaultPlatformContent, contentDoc.content)
      : defaultPlatformContent
    return normalizePlatformContentHomeCms(withDefaultHomeCategories(content))
  })
  return applyHomeCmsAreaOverride(baseContent, scope)
}

export async function getAuthRateLimitSettings(): Promise<AuthRateLimitSettings> {
  const content = await getPlatformContent()
  return content.auth.rateLimits
}

export async function getOperationalFinanceSettings(): Promise<OperationalFinanceSettings> {
  const content = await getPlatformContent()
  const finance = content.operations.finance
  return {
    ...finance,
    minimumPayoutAmountTaka:
      finance.minimumPayoutAmountEnabled === false
        ? 0
        : Math.max(0, finance.minimumPayoutAmountTaka ?? 0),
  }
}

export async function getAdminEditablePlatformContent(scope?: PlatformContentScope) {
  const cacheKey = `${CONTENT_KEY}|${contentScopeKey(scope) || "all"}`
  return adminEditablePlatformContentCache.getOrSet(cacheKey, async () => {
    const contentDoc = await PublicContentModel.findOne({ key: CONTENT_KEY })
      .select({
        content: 1,
        updatedAt: 1,
        updatedByAdminId: 1,
        updatedByAdminName: 1,
        history: 1,
      })
      .slice("history", -platformContentHistoryLimit)
      .lean()
    const content = contentDoc?.content
      ? deepMerge(defaultPlatformContent, contentDoc.content)
      : defaultPlatformContent

    return mapAdminEditablePlatformContent(
      applyHomeCmsAreaOverride(withDefaultHomeCategories(content), scope),
      contentDoc,
    )
  })
}

export async function updatePlatformContent(params: {
  content: unknown
  adminId: string
  scope?: PlatformContentScope
}) {
  platformContentCache.clear()
  adminEditablePlatformContentCache.clear()
  const parsed = normalizePlatformContentHomeCms(
    platformContentSchema.parse(params.content),
  )
  const [admin, currentDoc] = await Promise.all([
    AdminModel.findById(params.adminId).select({ fullName: 1 }).lean(),
    PublicContentModel.findOne({ key: CONTENT_KEY }).select({ content: 1 }).lean(),
  ])
  const adminName = admin?.fullName ?? "Support Team"
  const currentContent = currentDoc?.content
    ? normalizePlatformContentHomeCms(
        withDefaultHomeCategories(deepMerge(defaultPlatformContent, currentDoc.content)),
      )
    : null
  const scopeKey = contentScopeKey(params.scope)
  const baseContent = currentContent ?? normalizePlatformContentHomeCms(
    withDefaultHomeCategories(defaultPlatformContent),
  )
  const currentHomeCmsAreaOverrides = {
    ...getHomeCmsAreaOverrides(baseContent as unknown as Record<string, any>),
  }
  const districtScopeId =
    params.scope?.districtId?.trim() && !params.scope.zoneId?.trim()
      ? params.scope.districtId.trim()
      : ""
  if (districtScopeId) {
    const districtZones = await ServiceZoneModel.find({
      districtId: districtScopeId,
      status: { $ne: "archived" },
    })
      .select({ _id: 1 })
      .lean()
    for (const zone of districtZones) {
      delete currentHomeCmsAreaOverrides[`zone:${zone._id.toString()}`]
    }
  }
  const nextContent: PlatformContent = scopeKey
    ? deepMerge(baseContent, {
        customerApp: {
          homeCmsAreaOverrides: {
            ...currentHomeCmsAreaOverrides,
            [scopeKey]: buildHomeCmsAreaOverride(parsed.customerApp.homeCms),
          },
        },
      })
    : deepMerge(parsed, {
        customerApp: {
          homeCmsAreaOverrides: currentContent
            ? getHomeCmsAreaOverrides(currentContent as unknown as Record<string, any>)
            : {},
        },
      })
  const nextUpdatedAt = new Date()
  const changedSections = scopeKey
    ? [`Customer App (${scopeKey})`]
    : getChangedSections(currentContent, parsed)
  const nextHistoryEntry = {
    updatedByAdminId: params.adminId,
    updatedByAdminName: adminName,
    updatedAt: nextUpdatedAt,
    changedSections,
    content: nextContent,
  }

  await PublicContentModel.updateOne(
    { key: CONTENT_KEY },
    {
      $set: {
        key: CONTENT_KEY,
        content: nextContent,
        updatedByAdminId: params.adminId,
        updatedByAdminName: adminName,
      },
      $push: {
        history: {
          $each: [nextHistoryEntry],
          $slice: -platformContentHistoryLimit,
        },
      },
    },
    {
      upsert: true,
      setDefaultsOnInsert: true,
    }
  )

  const mapped = mapAdminEditablePlatformContent(applyHomeCmsAreaOverride(nextContent, params.scope), {
    updatedAt: nextUpdatedAt,
    updatedByAdminId: params.adminId,
    updatedByAdminName: adminName,
    history: [nextHistoryEntry],
  })
  adminEditablePlatformContentCache.clear()
  platformContentCache.clear()
  notifyPlatformContentInvalidated()
  emitPlatformContentUpdated({
    updatedAt: nextUpdatedAt.toISOString(),
    updatedByAdminId: params.adminId,
    updatedByAdminName: adminName,
    changedSections,
  })
  return mapped
}

export async function recordCustomerHomeCmsEvent(params: {
  eventType:
    | "strip_impression"
    | "strip_click"
    | "block_impression"
    | "block_click"
    | "modal_impression"
    | "modal_click"
    | "guide_impression"
    | "guide_video_click"
    | "guide_image_click"
  customerId?: string
}) {
  const incrementKeyByEvent = {
    strip_impression: "content.customerApp.homeCms.analytics.stripImpressions",
    strip_click: "content.customerApp.homeCms.analytics.stripClicks",
    block_impression: "content.customerApp.homeCms.analytics.blockImpressions",
    block_click: "content.customerApp.homeCms.analytics.blockClicks",
    modal_impression: "content.customerApp.homeCms.analytics.modalImpressions",
    modal_click: "content.customerApp.homeCms.analytics.modalClicks",
    guide_impression: "content.customerApp.homeCms.analytics.guideImpressions",
    guide_video_click: "content.customerApp.homeCms.analytics.guideVideoClicks",
    guide_image_click: "content.customerApp.homeCms.analytics.guideImageClicks",
  } as const
  const incrementKey = incrementKeyByEvent[params.eventType]
  const occurredAt = new Date().toISOString()
  const customer = params.customerId
    ? await CustomerModel.findById(params.customerId).select("fullName phone").lean()
    : null
  const event = {
    eventType: params.eventType,
    customerId: params.customerId ?? "",
    customerName: String(customer?.fullName ?? ""),
    customerPhone: String(customer?.phone ?? ""),
    occurredAt,
  }

  await PublicContentModel.updateOne(
    { key: CONTENT_KEY },
    {
      $inc: { [incrementKey]: 1 },
      $set: { "content.customerApp.homeCms.analytics.lastEventAt": occurredAt },
      $push: {
        "content.customerApp.homeCms.analyticsEvents": {
          $each: [event],
          $position: 0,
          $slice: 300,
        },
      },
    },
    { upsert: false }
  )

  return { recorded: true }
}

function hasPlatformContentScope(scope?: PlatformContentScope) {
  return Boolean(scope?.zoneId?.trim() || scope?.districtId?.trim())
}

function mergeCustomerIdInFilter(query: Record<string, unknown>, customerIds: unknown[]) {
  const ids = customerIds.map((id) => String(id)).filter(Boolean)
  const currentIdFilter = typeof query._id === "object" && query._id
    ? query._id as Record<string, unknown>
    : {}
  const currentIn = Array.isArray(currentIdFilter.$in)
    ? currentIdFilter.$in.map((id) => String(id)).filter(Boolean)
    : null
  const currentInSet = currentIn ? new Set(currentIn) : null
  const nextIn = currentIn
    ? ids.filter((id) => currentInSet?.has(id))
    : ids
  query._id = { ...currentIdFilter, $in: nextIn }
}

function mergeCustomerIdNinFilter(query: Record<string, unknown>, customerIds: unknown[]) {
  const currentIdFilter = typeof query._id === "object" && query._id
    ? query._id as Record<string, unknown>
    : {}
  const currentNin = Array.isArray(currentIdFilter.$nin)
    ? currentIdFilter.$nin.map((id) => String(id)).filter(Boolean)
    : []
  const nextNin = [
    ...currentNin,
    ...customerIds.map((id) => String(id)).filter(Boolean),
  ]
  query._id = { ...currentIdFilter, $nin: Array.from(new Set(nextNin)) }
}

async function getHomePushScopedCustomerIds(scope?: PlatformContentScope) {
  if (!hasPlatformContentScope(scope)) return null
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(scope)
  if (Object.keys(orderScopeFilter).length === 0) return null
  return OrderModel.distinct("customerId", {
    ...orderScopeFilter,
    customerId: { $type: "string", $ne: "" },
  })
}

async function buildHomePushCustomerQuery(
  pushCampaign: PlatformContent["customerApp"]["homeCms"]["pushCampaign"],
  scope?: PlatformContentScope,
) {
  const query: Record<string, unknown> = { status: "active" }
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(scope)
  const scopedCustomerIds = await getHomePushScopedCustomerIds(scope)
  if (scopedCustomerIds) {
    mergeCustomerIdInFilter(query, scopedCustomerIds)
  }

  if (pushCampaign.audienceType === "selected_users") {
    mergeCustomerIdInFilter(query, pushCampaign.selectedCustomerIds)
  } else if (pushCampaign.audienceType === "new_users") {
    mergeCustomerIdNinFilter(query, await OrderModel.distinct("customerId", orderScopeFilter))
  } else if (pushCampaign.audienceType === "returning_users") {
    mergeCustomerIdInFilter(query, await OrderModel.distinct("customerId", orderScopeFilter))
  }

  if (pushCampaign.customerGroupKey === "has_push_token") {
    query["pushTokens.0"] = { $exists: true }
  } else if (pushCampaign.customerGroupKey === "ordered_last_30_days") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const customerIds = await OrderModel.distinct("customerId", {
      ...orderScopeFilter,
      createdAt: { $gte: since },
    })
    mergeCustomerIdInFilter(query, customerIds)
  } else if (pushCampaign.customerGroupKey === "inactive_30_days") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const customerIds = await OrderModel.distinct("customerId", {
      ...orderScopeFilter,
      createdAt: { $gte: since },
    })
    mergeCustomerIdNinFilter(query, customerIds)
  } else if (pushCampaign.customerGroupKey === "high_value_customers") {
    const rows = await OrderModel.aggregate([
      { $match: { ...orderScopeFilter, status: "Delivered" } },
      { $group: { _id: "$customerId", totalSpend: { $sum: { $toDouble: { $ifNull: ["$pricing.total", 0] } } } } },
      { $match: { totalSpend: { $gte: 1000 } } },
      { $limit: 2000 },
    ])
    const customerIds = rows.map((row) => String(row._id)).filter(Boolean)
    mergeCustomerIdInFilter(query, customerIds)
  }

  if (
    pushCampaign.restaurantScope === "selected_restaurants" &&
    pushCampaign.selectedRestaurantIds.length > 0
  ) {
    const customerIds = await OrderModel.distinct("customerId", {
      ...orderScopeFilter,
      restaurantId: { $in: pushCampaign.selectedRestaurantIds },
    })
    mergeCustomerIdInFilter(query, customerIds)
  }

  return query
}

async function calculateCampaignConversions(params: {
  sentAt: string
  customerIds: string[]
  windowDays: number
}) {
  const start = new Date(params.sentAt)
  const end = new Date(start.getTime() + params.windowDays * 24 * 60 * 60 * 1000)
  const orders = await OrderModel.find(
    {
      customerId: { $in: params.customerIds },
      createdAt: { $gte: start, $lte: end },
    },
    { customerId: 1, status: 1, pricing: 1, orderNumber: 1, customerSnapshot: 1, createdAt: 1 }
  ).lean()
  const deliveredOrders = orders.filter((order) => order.status === "Delivered")
  const deliveredRevenue = deliveredOrders.reduce(
    (sum, order) => sum + Number((order.pricing as { total?: number } | undefined)?.total ?? 0),
    0
  )
  const uniqueOrderingCustomers = new Set(orders.map((order) => String(order.customerId))).size

  return {
    orderCount: orders.length,
    deliveredOrderCount: deliveredOrders.length,
    deliveredRevenue,
    uniqueOrderingCustomers,
    conversionRate: params.customerIds.length
      ? Math.round((uniqueOrderingCustomers / params.customerIds.length) * 10000) / 100
      : 0,
    refreshedAt: new Date().toISOString(),
    convertedOrders: orders.slice(0, 200).map((order) => ({
      orderId: String(order._id),
      orderNumber: String(order.orderNumber ?? ""),
      customerId: String(order.customerId ?? ""),
      customerName: String((order.customerSnapshot as { fullName?: string; name?: string } | undefined)?.fullName ?? (order.customerSnapshot as { name?: string } | undefined)?.name ?? ""),
      status: String(order.status ?? ""),
      total: Number((order.pricing as { total?: number } | undefined)?.total ?? 0),
      createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
    })),
  }
}

export async function sendCustomerHomeCmsPushCampaign(params: {
  adminId: string
  scope?: PlatformContentScope
}) {
  const editor = await getAdminEditablePlatformContent(params.scope)
  const content = editor.content
  const pushCampaign = content.customerApp.homeCms.pushCampaign

  if (!pushCampaign.title.trim() || !pushCampaign.body.trim()) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "HOME_PUSH_NOT_READY",
      "Push title and body are required"
    )
  }

  const customerQuery = await buildHomePushCustomerQuery(pushCampaign, params.scope)
  const customers = await CustomerModel.find(customerQuery, { _id: 1, fullName: 1, phone: 1 }).limit(5000).lean()
  let sentCount = 0
  let disabledCount = 0
  const sentExpoTokens = new Set<string>()
  const sentAt = new Date().toISOString()
  const campaignId = `home-${Date.now()}`
  const recipientEvents: Array<{
    customerId: string
    customerName: string
    customerPhone: string
    sentAt: string
    status: "sent" | "in_app_only" | "preference_disabled" | "failed"
    expoTokenCount: number
    ticketIds: string[]
    receiptStatus: "pending" | "failed"
    receiptCheckedAt: null
    receiptError: string
    variant: "A" | "B"
  }> = []

  for (const [index, customer] of customers.entries()) {
    const useVariantB =
      pushCampaign.abTest.enabled &&
      Boolean(pushCampaign.abTest.variantBTitle.trim()) &&
      Boolean(pushCampaign.abTest.variantBBody.trim()) &&
      index % 100 < pushCampaign.abTest.splitPercent
    const variant = useVariantB ? "B" : "A"
    const title = useVariantB ? pushCampaign.abTest.variantBTitle : pushCampaign.title
    const body = useVariantB ? pushCampaign.abTest.variantBBody : pushCampaign.body
    const path = useVariantB && pushCampaign.abTest.variantBPath ? pushCampaign.abTest.variantBPath : pushCampaign.path
    const result = await sendPushToCustomer({
      customerId: String(customer._id),
      excludeExpoTokens: sentExpoTokens,
      zoneId: params.scope?.zoneId,
      districtId: params.scope?.districtId,
      payload: {
        title: pushCampaign.contentType === "image" ? title || "Foodbela" : title,
        body: pushCampaign.contentType === "image" ? body || "Open Foodbela to see this offer." : body,
        imageUrl:
          pushCampaign.contentType === "image" || pushCampaign.contentType === "image_text"
            ? pushCampaign.imageUrl
            : undefined,
        data: {
          type: "promotion",
          path: path || "/(tabs)/browse",
          source: "customer_home_cms",
          campaignId,
          variant,
          imageUrl: pushCampaign.imageUrl,
          contentType: pushCampaign.contentType,
          zoneId: params.scope?.zoneId ?? "",
          districtId: params.scope?.districtId ?? "",
        },
      },
    })
    sentCount += result.sent
    disabledCount += result.disabled
    result.sentExpoTokens.forEach((token) => sentExpoTokens.add(token))
    recipientEvents.push({
      customerId: String(customer._id),
      customerName: String(customer.fullName ?? ""),
      customerPhone: String(customer.phone ?? ""),
      sentAt,
      status: result.skipped
        ? "preference_disabled"
        : result.sent > 0
          ? "sent"
          : result.disabled > 0
            ? "failed"
            : "in_app_only",
      expoTokenCount: result.sent,
      ticketIds: result.ticketIds,
      receiptStatus: result.sent > 0 && result.ticketIds.length > 0 ? "pending" : "failed",
      receiptCheckedAt: null,
      receiptError:
        result.sent > 0
          ? ""
          : result.skipped
            ? "Customer notification preference disabled"
            : "No active push token or Expo rejected the push",
      variant,
    })
  }

  const nextContent: PlatformContent = {
    ...content,
    customerApp: {
      ...content.customerApp,
      homeCms: {
        ...content.customerApp.homeCms,
        pushCampaign: {
          ...pushCampaign,
          currentCampaignId: campaignId,
          lastSentAt: sentAt,
          totalTargets: customers.length,
          sentCount,
          disabledCount,
          openCount: 0,
          recipientEvents: recipientEvents.slice(0, 500),
          openEvents: [],
          receiptCheckedAt: null,
          scheduledAt: null,
          scheduleStatus: "sent",
          scheduledByAdminId: "",
          scheduledCreatedAt: null,
          scheduleHistory:
            pushCampaign.scheduleStatus === "sending" || pushCampaign.scheduleStatus === "scheduled"
              ? [
                  {
                    action: "sent" as const,
                    scheduledAt: pushCampaign.scheduledAt,
                    occurredAt: sentAt,
                    adminId: params.adminId,
                    note: pushCampaign.title,
                  },
                  ...(pushCampaign.scheduleHistory ?? []),
                ].slice(0, 20)
              : pushCampaign.scheduleHistory,
          conversions: {
            orderCount: 0,
            deliveredOrderCount: 0,
            deliveredRevenue: 0,
            uniqueOrderingCustomers: 0,
            conversionRate: 0,
            refreshedAt: null,
            convertedOrders: [],
          },
          campaignHistory: [
            {
              campaignId,
              contentType: pushCampaign.contentType,
              title: pushCampaign.title,
              body: pushCampaign.body,
              imageUrl: pushCampaign.imageUrl,
              path: pushCampaign.path,
              audienceType: pushCampaign.audienceType,
              restaurantScope: pushCampaign.restaurantScope,
              zoneId: params.scope?.zoneId ?? "",
              districtId: params.scope?.districtId ?? "",
              abTest: pushCampaign.abTest,
              sentAt,
              totalTargets: customers.length,
              sentCount,
              disabledCount,
              openCount: 0,
              recipientEvents: recipientEvents.slice(0, 500),
              openEvents: [],
              receiptCheckedAt: null,
              conversionWindowDays: pushCampaign.conversionWindowDays,
              conversions: {
                orderCount: 0,
                deliveredOrderCount: 0,
                deliveredRevenue: 0,
                uniqueOrderingCustomers: 0,
                conversionRate: 0,
                refreshedAt: null,
                convertedOrders: [],
              },
            },
            ...pushCampaign.campaignHistory,
          ].slice(0, 20),
        },
      },
    },
  }

  await updatePlatformContent({
    content: nextContent,
    adminId: params.adminId,
    scope: params.scope,
  })

  return {
    totalTargets: customers.length,
    sentCount,
    disabledCount,
  }
}

export async function sendCustomerHomeCmsTestPush(params: {
  adminId: string
  customerId: string
  scope?: PlatformContentScope
}) {
  const editor = await getAdminEditablePlatformContent(params.scope)
  const pushCampaign = editor.content.customerApp.homeCms.pushCampaign

  if (!params.customerId.trim()) {
    throw new AppError(StatusCodes.BAD_REQUEST, "TEST_CUSTOMER_REQUIRED", "Test customer is required")
  }
  if (!pushCampaign.title.trim() || !pushCampaign.body.trim()) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "HOME_PUSH_NOT_READY",
      "Push title and body are required"
    )
  }
  if (pushCampaign.contentType !== "text" && !pushCampaign.imageUrl.trim()) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PUSH_IMAGE_REQUIRED",
      "Image is required for image push campaigns"
    )
  }

  const result = await sendPushToCustomer({
    customerId: params.customerId,
    zoneId: params.scope?.zoneId,
    districtId: params.scope?.districtId,
    payload: {
      title: `[TEST] ${pushCampaign.contentType === "image" ? pushCampaign.title || "Foodbela" : pushCampaign.title}`,
      body:
        pushCampaign.contentType === "image"
          ? pushCampaign.body || "Open Foodbela to see this offer."
          : pushCampaign.body,
      imageUrl:
        pushCampaign.contentType === "image" || pushCampaign.contentType === "image_text"
          ? pushCampaign.imageUrl
          : undefined,
      data: {
        type: "promotion",
        path: pushCampaign.path || "/(tabs)/browse",
        source: "customer_home_cms_test",
        campaignId: "customer_home_cms_test",
        imageUrl: pushCampaign.imageUrl,
        contentType: pushCampaign.contentType,
        zoneId: params.scope?.zoneId ?? "",
        districtId: params.scope?.districtId ?? "",
      },
    },
  })

  return {
    sentCount: result.sent,
    disabledCount: result.disabled,
    ticketIds: result.ticketIds,
  }
}

export async function recordCustomerHomePushOpen(params: {
  customerId: string
  path?: string
  campaignId?: string
  variant?: "A" | "B"
}) {
  const customer = await CustomerModel.findById(params.customerId)
    .select("fullName phone")
    .lean()
  const openedAt = new Date().toISOString()
  const event = {
    customerId: params.customerId,
    customerName: String(customer?.fullName ?? ""),
    customerPhone: String(customer?.phone ?? ""),
    openedAt,
    path: params.path ?? "",
    campaignId: params.campaignId ?? "",
    variant: params.variant,
  }
  const contentDoc = await PublicContentModel.findOne({ key: CONTENT_KEY })
    .select({ content: 1 })
    .lean()
  const content = normalizePlatformContentHomeCms(
    withDefaultHomeCategories(
      contentDoc?.content
        ? deepMerge(defaultPlatformContent, contentDoc.content)
        : defaultPlatformContent,
    ),
  )
  const basePushCampaign = content.customerApp.homeCms.pushCampaign
  const campaignId = params.campaignId || basePushCampaign.currentCampaignId
  const campaignMatches = (pushCampaign: PlatformContent["customerApp"]["homeCms"]["pushCampaign"]) =>
    pushCampaign.currentCampaignId === campaignId ||
    pushCampaign.campaignHistory.some((campaign) => campaign.campaignId === campaignId)

  let scopeKey = ""
  let pushCampaign = basePushCampaign
  if (!campaignMatches(basePushCampaign)) {
    const overrides = getHomeCmsAreaOverrides(content as unknown as Record<string, any>)
    for (const [key, override] of Object.entries(overrides)) {
      const overridePushCampaign = (override as Record<string, any>)?.pushCampaign
      if (
        overridePushCampaign &&
        (overridePushCampaign.currentCampaignId === campaignId ||
          (overridePushCampaign.campaignHistory ?? []).some(
            (campaign: Record<string, unknown>) => campaign.campaignId === campaignId,
          ))
      ) {
        scopeKey = key
        pushCampaign = applyHomeCmsAreaOverride(
          content,
          parsePlatformContentScopeKey(key) ?? undefined,
        ).customerApp.homeCms.pushCampaign
        break
      }
    }
  }

  const nextHistory = pushCampaign.campaignHistory.map((campaign: any) =>
    campaign.campaignId === campaignId
      ? {
          ...campaign,
          openCount: Number(campaign.openCount ?? 0) + 1,
          openEvents: [event, ...(campaign.openEvents ?? [])].slice(0, 100),
        }
      : campaign
  )
  const nextPushCampaign = {
    ...pushCampaign,
    openCount: Number(pushCampaign.openCount ?? 0) + 1,
    openEvents: [event, ...(pushCampaign.openEvents ?? [])].slice(0, 100),
    campaignHistory: nextHistory,
  }
  const nextAnalytics = {
    ...content.customerApp.homeCms.analytics,
    pushOpens: Number(content.customerApp.homeCms.analytics.pushOpens ?? 0) + 1,
    lastEventAt: openedAt,
  }
  const currentOverrides = {
    ...getHomeCmsAreaOverrides(content as unknown as Record<string, any>),
  }
  const nextContent = scopeKey
    ? {
        ...content,
        customerApp: {
          ...content.customerApp,
          homeCms: {
            ...content.customerApp.homeCms,
            analytics: nextAnalytics,
          },
          homeCmsAreaOverrides: {
            ...currentOverrides,
            [scopeKey]: buildHomeCmsAreaOverride({
              ...applyHomeCmsAreaOverride(
                content,
                parsePlatformContentScopeKey(scopeKey) ?? undefined,
              ).customerApp.homeCms,
              pushCampaign: nextPushCampaign,
            }),
          },
        },
      }
    : {
        ...content,
        customerApp: {
          ...content.customerApp,
          homeCms: {
            ...content.customerApp.homeCms,
            analytics: nextAnalytics,
            pushCampaign: nextPushCampaign,
          },
        },
      }

  await PublicContentModel.updateOne(
    { key: CONTENT_KEY },
    {
      $set: {
        content: nextContent,
      },
    }
  )
  platformContentCache.clear()
  adminEditablePlatformContentCache.clear()
  notifyPlatformContentInvalidated()

  return { recorded: true }
}

export async function checkCustomerHomeCmsPushReceipts(params: {
  adminId: string
  scope?: PlatformContentScope
}) {
  const editor = await getAdminEditablePlatformContent(params.scope)
  const content = editor.content
  const pushCampaign = content.customerApp.homeCms.pushCampaign
  const ticketIds = pushCampaign.recipientEvents.flatMap((event) => event.ticketIds ?? [])

  if (!ticketIds.length) {
    return {
      checked: 0,
      deliveredToProvider: 0,
      failed: 0,
      deviceNotRegistered: 0,
    }
  }

  const response = await fetchWithTimeout("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ ids: ticketIds.slice(0, 1000) }),
    timeoutMs: 5_000,
  })

  if (!response.ok) {
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "PUSH_RECEIPT_CHECK_FAILED",
      "Expo receipt check failed"
    )
  }

  const payload = (await response.json()) as {
    data?: Record<
      string,
      {
        status?: "ok" | "error"
        message?: string
        details?: { error?: string }
      }
    >
  }
  const receipts = payload.data ?? {}
  const checkedAt = new Date().toISOString()
  let deliveredToProvider = 0
  let failed = 0
  let deviceNotRegistered = 0

  const nextRecipientEvents = pushCampaign.recipientEvents.map((event) => {
    const eventTicketIds = event.ticketIds ?? []
    const eventReceipts = eventTicketIds.map((ticketId) => receipts[ticketId]).filter(Boolean)

    if (!eventReceipts.length) return event

    const errorReceipt = eventReceipts.find((receipt) => receipt.status === "error")
    if (errorReceipt) {
      failed += 1
      if (errorReceipt.details?.error === "DeviceNotRegistered") {
        deviceNotRegistered += 1
        return {
          ...event,
          status: "failed" as const,
          receiptStatus: "device_not_registered" as const,
          receiptCheckedAt: checkedAt,
          receiptError: "Device not registered. The app may be uninstalled or the token expired.",
        }
      }
      return {
        ...event,
        status: "failed" as const,
        receiptStatus: "failed" as const,
        receiptCheckedAt: checkedAt,
        receiptError: errorReceipt.message ?? errorReceipt.details?.error ?? "Expo delivery failed",
      }
    }

    deliveredToProvider += 1
    return {
      ...event,
      receiptStatus: "delivered_to_provider" as const,
      receiptCheckedAt: checkedAt,
      receiptError: "",
    }
  })
  const nextHistory = pushCampaign.campaignHistory.map((campaign: any) =>
    campaign.campaignId === pushCampaign.currentCampaignId
      ? {
          ...campaign,
          recipientEvents: nextRecipientEvents,
          receiptCheckedAt: checkedAt,
        }
      : campaign
  )

  const nextContent: PlatformContent = {
    ...content,
    customerApp: {
      ...content.customerApp,
      homeCms: {
        ...content.customerApp.homeCms,
        pushCampaign: {
          ...pushCampaign,
          recipientEvents: nextRecipientEvents,
          receiptCheckedAt: checkedAt,
          campaignHistory: nextHistory,
        },
      },
    },
  }

  await updatePlatformContent({
    content: nextContent,
    adminId: params.adminId,
    scope: params.scope,
  })

  return {
    checked: ticketIds.length,
    deliveredToProvider,
    failed,
    deviceNotRegistered,
  }
}

export async function refreshCustomerHomeCmsPushConversions(params: {
  adminId: string
  scope?: PlatformContentScope
}) {
  const editor = await getAdminEditablePlatformContent(params.scope)
  const content = editor.content
  const pushCampaign = content.customerApp.homeCms.pushCampaign
  const currentCustomerIds = pushCampaign.recipientEvents.map((event) => event.customerId).filter(Boolean)
  const currentConversions = pushCampaign.lastSentAt
    ? await calculateCampaignConversions({
        sentAt: pushCampaign.lastSentAt,
        customerIds: currentCustomerIds,
        windowDays: pushCampaign.conversionWindowDays,
      })
    : pushCampaign.conversions

  const nextHistory = await Promise.all(
    pushCampaign.campaignHistory.map(async (campaign: any) => ({
      ...campaign,
      conversions: await calculateCampaignConversions({
        sentAt: campaign.sentAt,
        customerIds: (campaign.recipientEvents ?? []).map((event: { customerId?: string }) => event.customerId).filter(Boolean),
        windowDays: campaign.conversionWindowDays ?? pushCampaign.conversionWindowDays,
      }),
    }))
  )

  const nextContent: PlatformContent = {
    ...content,
    customerApp: {
      ...content.customerApp,
      homeCms: {
        ...content.customerApp.homeCms,
        pushCampaign: {
          ...pushCampaign,
          conversions: currentConversions,
          campaignHistory: nextHistory,
        },
      },
    },
  }

  await updatePlatformContent({
    content: nextContent,
    adminId: params.adminId,
    scope: params.scope,
  })

  return currentConversions
}

export async function scheduleCustomerHomeCmsPushCampaign(params: {
  adminId: string
  scheduledAt: string
  scope?: PlatformContentScope
}) {
  const scheduledDate = new Date(params.scheduledAt)
  if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_PUSH_SCHEDULE",
      "Schedule time must be in the future"
    )
  }

  const editor = await getAdminEditablePlatformContent(params.scope)
  const content = editor.content
  const pushCampaign = content.customerApp.homeCms.pushCampaign
  const occurredAt = new Date().toISOString()

  if (pushCampaign.contentType !== "text" && !pushCampaign.imageUrl.trim()) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PUSH_IMAGE_REQUIRED",
      "Image is required for image push campaigns"
    )
  }

  const nextContent: PlatformContent = {
    ...content,
    customerApp: {
      ...content.customerApp,
      homeCms: {
        ...content.customerApp.homeCms,
        pushCampaign: {
          ...pushCampaign,
          scheduledAt: scheduledDate.toISOString(),
          scheduleStatus: "scheduled",
          scheduledByAdminId: params.adminId,
          scheduledCreatedAt: occurredAt,
          scheduleHistory: [
            {
              action: "scheduled" as const,
              scheduledAt: scheduledDate.toISOString(),
              occurredAt,
              adminId: params.adminId,
              note: pushCampaign.title,
            },
            ...(pushCampaign.scheduleHistory ?? []),
          ].slice(0, 20),
        },
      },
    },
  }

  await updatePlatformContent({
    content: nextContent,
    adminId: params.adminId,
    scope: params.scope,
  })

  return {
    scheduledAt: scheduledDate.toISOString(),
    scheduleStatus: "scheduled",
  }
}

export async function cancelCustomerHomeCmsPushSchedule(params: {
  adminId: string
  scope?: PlatformContentScope
}) {
  const editor = await getAdminEditablePlatformContent(params.scope)
  const content = editor.content
  const pushCampaign = content.customerApp.homeCms.pushCampaign
  const occurredAt = new Date().toISOString()
  const nextContent: PlatformContent = {
    ...content,
    customerApp: {
      ...content.customerApp,
      homeCms: {
        ...content.customerApp.homeCms,
        pushCampaign: {
          ...pushCampaign,
          scheduledAt: null,
          scheduleStatus: "cancelled",
          scheduledByAdminId: "",
          scheduledCreatedAt: null,
          scheduleHistory: [
            {
              action: "cancelled" as const,
              scheduledAt: pushCampaign.scheduledAt,
              occurredAt,
              adminId: params.adminId,
              note: pushCampaign.title,
            },
            ...(pushCampaign.scheduleHistory ?? []),
          ].slice(0, 20),
        },
      },
    },
  }

  await updatePlatformContent({
    content: nextContent,
    adminId: params.adminId,
    scope: params.scope,
  })
  return { scheduleStatus: "cancelled" }
}

function parsePlatformContentScopeKey(scopeKey: string): PlatformContentScope | null {
  if (scopeKey.startsWith("zone:")) {
    const zoneId = scopeKey.replace("zone:", "").trim()
    return zoneId ? { zoneId } : null
  }
  if (scopeKey.startsWith("district:")) {
    const districtId = scopeKey.replace("district:", "").trim()
    return districtId ? { districtId } : null
  }
  return null
}

function isCustomerHomePushScheduleDue(
  pushCampaign: PlatformContent["customerApp"]["homeCms"]["pushCampaign"],
) {
  if (pushCampaign.scheduleStatus !== "scheduled" || !pushCampaign.scheduledAt) {
    return false
  }
  return new Date(pushCampaign.scheduledAt).getTime() <= Date.now()
}

async function processDueCustomerHomeCmsPushCampaign(scope?: PlatformContentScope) {
  const editor = await getAdminEditablePlatformContent(scope)
  const pushCampaign = editor.content.customerApp.homeCms.pushCampaign
  if (!isCustomerHomePushScheduleDue(pushCampaign)) {
    return { processed: false }
  }

  const sendingContent: PlatformContent = {
    ...editor.content,
    customerApp: {
      ...editor.content.customerApp,
      homeCms: {
        ...editor.content.customerApp.homeCms,
        pushCampaign: {
          ...pushCampaign,
          scheduleStatus: "sending",
        },
      },
    },
  }
  await updatePlatformContent({
    content: sendingContent,
    adminId: pushCampaign.scheduledByAdminId || "system-admin",
    scope,
  })

  try {
    const result = await sendCustomerHomeCmsPushCampaign({
      adminId: pushCampaign.scheduledByAdminId || "system-admin",
      scope,
    })
    return { processed: true, result }
  } catch (error) {
    const failedEditor = await getAdminEditablePlatformContent(scope)
    const failedPush = failedEditor.content.customerApp.homeCms.pushCampaign
    const occurredAt = new Date().toISOString()
    await updatePlatformContent({
      adminId: pushCampaign.scheduledByAdminId || "system-admin",
      scope,
      content: {
        ...failedEditor.content,
        customerApp: {
          ...failedEditor.content.customerApp,
          homeCms: {
            ...failedEditor.content.customerApp.homeCms,
            pushCampaign: {
              ...failedPush,
              scheduleStatus: "failed",
              scheduleHistory: [
                {
                  action: "failed" as const,
                  scheduledAt: failedPush.scheduledAt,
                  occurredAt,
                  adminId: pushCampaign.scheduledByAdminId || "system-admin",
                  note: error instanceof Error ? error.message : "Scheduled push failed",
                },
                ...(failedPush.scheduleHistory ?? []),
              ].slice(0, 20),
            },
          },
        },
      },
    })
    throw error
  }
}

export async function processDueCustomerHomeCmsPushCampaigns() {
  const editor = await getAdminEditablePlatformContent()
  const content = editor.content
  const dueScopes: Array<PlatformContentScope | undefined> = []

  if (isCustomerHomePushScheduleDue(content.customerApp.homeCms.pushCampaign)) {
    dueScopes.push(undefined)
  }

  for (const scopeKey of Object.keys(getHomeCmsAreaOverrides(content as unknown as Record<string, any>))) {
    const scope = parsePlatformContentScopeKey(scopeKey)
    if (!scope) continue
    const scopedContent = applyHomeCmsAreaOverride(content, scope)
    if (isCustomerHomePushScheduleDue(scopedContent.customerApp.homeCms.pushCampaign)) {
      dueScopes.push(scope)
    }
  }

  if (!dueScopes.length) {
    return { processed: false }
  }

  const results = []
  for (const scope of dueScopes) {
    results.push(await processDueCustomerHomeCmsPushCampaign(scope))
  }
  return {
    processed: results.some((result) => result.processed),
    results,
  }
}

export async function rollbackPlatformContent(params: {
  updatedAt: string
  adminId: string
}) {
  adminEditablePlatformContentCache.clear()
  platformContentCache.clear()
  const rollbackUpdatedAt = new Date(params.updatedAt)
  if (Number.isNaN(rollbackUpdatedAt.getTime())) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_ROLLBACK_TARGET",
      "Choose a valid content history entry to restore."
    )
  }

  const admin = await AdminModel.findById(params.adminId)
    .select({ fullName: 1 })
    .lean()
  const adminName = admin?.fullName ?? "Support Team"
  const currentDoc = await PublicContentModel.findOne({
    key: CONTENT_KEY,
    "history.updatedAt": rollbackUpdatedAt,
  })
    .select({
      content: 1,
      updatedAt: 1,
      updatedByAdminId: 1,
      updatedByAdminName: 1,
      history: { $elemMatch: { updatedAt: rollbackUpdatedAt } },
    })
    .lean()

  if (!currentDoc) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "PLATFORM_CONTENT_NOT_FOUND",
      "No platform content is available to roll back."
    )
  }

  const historyEntry = currentDoc.history?.[0]

  if (!historyEntry?.content) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "ROLLBACK_ENTRY_NOT_FOUND",
      "The selected history entry could not be found."
    )
  }

  const restoredParsed = platformContentSchema.parse(
    deepMerge(defaultPlatformContent, historyEntry.content)
  )
  const restoredContent = normalizePlatformContentHomeCms(
    deepMerge(restoredParsed, {
      customerApp: {
        homeCmsAreaOverrides: getHomeCmsAreaOverrides(
          historyEntry.content as unknown as Record<string, any>,
        ),
      },
    })
  )
  const currentContent = currentDoc.content
    ? normalizePlatformContentHomeCms(
        withDefaultHomeCategories(deepMerge(defaultPlatformContent, currentDoc.content)),
      )
    : null
  const nextUpdatedAt = new Date()
  const changedSections = [
    ...getChangedSections(currentContent, restoredContent),
    "Rollback",
  ]
  const nextHistoryEntry = {
    updatedByAdminId: params.adminId,
    updatedByAdminName: adminName,
    updatedAt: nextUpdatedAt,
    changedSections,
    content: restoredContent,
  }

  await PublicContentModel.updateOne(
    { key: CONTENT_KEY },
    {
      $set: {
        key: CONTENT_KEY,
        content: restoredContent,
        updatedByAdminId: params.adminId,
        updatedByAdminName: adminName,
      },
      $push: {
        history: {
          $each: [nextHistoryEntry],
          $slice: -platformContentHistoryLimit,
        },
      },
    }
  )

  const mapped = mapAdminEditablePlatformContent(restoredContent, {
    updatedAt: nextUpdatedAt,
    updatedByAdminId: params.adminId,
    updatedByAdminName: adminName,
    history: [nextHistoryEntry],
  })
  adminEditablePlatformContentCache.clear()
  platformContentCache.clear()
  notifyPlatformContentInvalidated()
  emitPlatformContentUpdated({
    updatedAt: nextUpdatedAt.toISOString(),
    updatedByAdminId: params.adminId,
    updatedByAdminName: adminName,
    changedSections,
  })
  return mapped
}
