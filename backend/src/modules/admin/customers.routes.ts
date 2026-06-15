import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import {
  deleteAdminCustomerGroup,
  deleteAdminCustomerGroupMember,
  deleteAdminCustomerOffer,
  getAdminCustomer,
  getAdminCustomerGroups,
  getAdminCustomerOrders,
  getAdminCustomers,
  patchAdminCustomerStatus,
  patchAdminCustomerGroup,
  postAdminCustomerGroup,
  postAdminCustomerGroupMembers,
} from "./customers.controller";

export const adminCustomersRouter = Router();

adminCustomersRouter.use(requireAuth, requireRole("admin"));

adminCustomersRouter.get("/customers", getAdminCustomers);
adminCustomersRouter.get("/customer-groups", getAdminCustomerGroups);
adminCustomersRouter.post("/customer-groups", postAdminCustomerGroup);
adminCustomersRouter.patch("/customer-groups/:groupId", patchAdminCustomerGroup);
adminCustomersRouter.delete("/customer-groups/:groupId", deleteAdminCustomerGroup);
adminCustomersRouter.post(
  "/customer-groups/:groupId/members",
  postAdminCustomerGroupMembers,
);
adminCustomersRouter.delete(
  "/customer-groups/:groupId/members/:customerId",
  deleteAdminCustomerGroupMember,
);
adminCustomersRouter.get("/customers/:customerId", getAdminCustomer);
adminCustomersRouter.get("/customers/:customerId/orders", getAdminCustomerOrders);
adminCustomersRouter.delete(
  "/customers/:customerId/offers/:notificationId",
  deleteAdminCustomerOffer,
);
adminCustomersRouter.patch("/customers/:customerId/status", patchAdminCustomerStatus);
