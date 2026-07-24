import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import {
  blockAdminFirstOrderOfferDeviceController,
  blockAdminWelcomeOfferDeviceController,
  getAdminFirstOrderOfferDevice,
  getAdminFirstOrderOfferDevices,
  getAdminFirstOrderOffer,
  getAdminFirstOrderOffers,
  getAdminReferralRiskDevice,
  getAdminReferralRiskDevices,
  getAdminReferral,
  getAdminReferrals,
  getAdminWelcomeOfferDevice,
  getAdminWelcomeOfferDevices,
} from "./referrals.controller";

export const adminReferralsRouter = Router();

adminReferralsRouter.use(requireAuth, requireRole("admin"));
adminReferralsRouter.get("/referrals/welcome-devices", getAdminWelcomeOfferDevices);
adminReferralsRouter.get("/referrals/welcome-devices/:deviceId", getAdminWelcomeOfferDevice);
adminReferralsRouter.post(
  "/referrals/welcome-devices/:deviceId/block",
  blockAdminWelcomeOfferDeviceController,
);
adminReferralsRouter.get("/referrals/ffo/devices", getAdminFirstOrderOfferDevices);
adminReferralsRouter.get("/referrals/ffo/devices/:deviceId", getAdminFirstOrderOfferDevice);
adminReferralsRouter.post(
  "/referrals/ffo/devices/:deviceId/block",
  blockAdminFirstOrderOfferDeviceController,
);
adminReferralsRouter.get("/referrals/ffo", getAdminFirstOrderOffers);
adminReferralsRouter.get("/referrals/ffo/:claimId", getAdminFirstOrderOffer);
adminReferralsRouter.get("/referrals/risk/devices", getAdminReferralRiskDevices);
adminReferralsRouter.get("/referrals/risk/devices/:deviceId", getAdminReferralRiskDevice);
adminReferralsRouter.get("/referrals", getAdminReferrals);
adminReferralsRouter.get("/referrals/:referralId", getAdminReferral);
