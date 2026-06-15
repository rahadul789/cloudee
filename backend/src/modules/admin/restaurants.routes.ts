import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import {
  deleteAdminRestaurantController,
  deleteAdminRestaurantReviewController,
  getAdminRestaurant,
  getAdminRestaurantOrders,
  getAdminRestaurantPromotionTargets,
  getAdminRestaurants,
  patchAdminRestaurantCommission,
  patchAdminRestaurantDeliveryPricing,
  patchAdminRestaurantEnforcement,
  patchAdminRestaurantMerchandising,
  patchAdminRestaurantPayoutStatus,
  patchAdminRestaurantVisibility,
  postAdminRestaurantFinanceReconcile,
  postAdminRestaurant,
  restoreAdminRestaurantReviewController,
} from "./restaurants.controller";

export const adminRestaurantsRouter = Router();

adminRestaurantsRouter.use(requireAuth, requireRole("admin"));

adminRestaurantsRouter.get("/restaurants", getAdminRestaurants);
adminRestaurantsRouter.post("/restaurants", postAdminRestaurant);
adminRestaurantsRouter.get("/restaurants/:restaurantId", getAdminRestaurant);
adminRestaurantsRouter.delete(
  "/restaurants/:restaurantId",
  deleteAdminRestaurantController,
);
adminRestaurantsRouter.get(
  "/restaurants/:restaurantId/orders",
  getAdminRestaurantOrders,
);
adminRestaurantsRouter.get(
  "/restaurants/:restaurantId/promotion-targets",
  getAdminRestaurantPromotionTargets,
);
adminRestaurantsRouter.delete(
  "/restaurants/:restaurantId/reviews/:reviewId",
  deleteAdminRestaurantReviewController,
);
adminRestaurantsRouter.patch(
  "/restaurants/:restaurantId/reviews/:reviewId/restore",
  restoreAdminRestaurantReviewController,
);
adminRestaurantsRouter.post(
  "/restaurants/:restaurantId/finance/reconcile",
  postAdminRestaurantFinanceReconcile,
);
adminRestaurantsRouter.patch(
  "/restaurants/:restaurantId/payouts/:payoutId/status",
  patchAdminRestaurantPayoutStatus,
);
adminRestaurantsRouter.patch(
  "/restaurants/:restaurantId/visibility",
  patchAdminRestaurantVisibility,
);
adminRestaurantsRouter.patch(
  "/restaurants/:restaurantId/enforcement",
  patchAdminRestaurantEnforcement,
);
adminRestaurantsRouter.patch(
  "/restaurants/:restaurantId/merchandising",
  patchAdminRestaurantMerchandising,
);
adminRestaurantsRouter.patch(
  "/restaurants/:restaurantId/commission",
  patchAdminRestaurantCommission,
);
adminRestaurantsRouter.patch(
  "/restaurants/:restaurantId/delivery-pricing",
  patchAdminRestaurantDeliveryPricing,
);
