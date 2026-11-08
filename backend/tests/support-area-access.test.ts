import { assertAdminCustomerAreaAccess } from "../src/modules/admin/customers.service";
import { buildSupportQuery } from "../src/modules/admin/support.service";
import { CustomerModel } from "../src/modules/customer/customer.model";
import { OrderModel } from "../src/modules/owner/operational.model";
import { RestaurantModel, RiderModel } from "../src/modules/auth/auth.model";
import * as areas from "../src/modules/service-area/service-area.service";

describe("support and customer messaging area access", () => {
  const customerId = "507f1f77bcf86cd799439011";
  beforeEach(() => {
    jest.spyOn(areas, "buildCustomerServiceAreaScopeFilter").mockReturnValue({ "serviceArea.zoneId": "zone-a" });
    jest.spyOn(areas, "buildOrderServiceAreaScopeFilter").mockReturnValue({ "serviceAreaSnapshot.zoneId": "zone-a" });
    jest.spyOn(areas, "buildRestaurantServiceAreaScopeFilter").mockReturnValue({ "serviceArea.zoneId": "zone-a" });
    jest.spyOn(areas, "buildRiderServiceAreaScopeFilter").mockReturnValue({ "serviceArea.assignedZoneIds": "zone-a" });
  });
  afterEach(() => jest.restoreAllMocks());

  it("allows messaging customers with orders in the selected area even without a matching profile address", async () => {
    jest.spyOn(CustomerModel, "exists").mockResolvedValue(null);
    jest.spyOn(OrderModel, "exists").mockResolvedValue({ _id: "order" } as any);
    await expect(assertAdminCustomerAreaAccess(customerId, { zoneId: "zone-a" })).resolves.toBeUndefined();
    expect(OrderModel.exists).toHaveBeenCalledWith({ customerId, "serviceAreaSnapshot.zoneId": "zone-a" });
  });

  it("rejects a customer belonging to another area", async () => {
    jest.spyOn(CustomerModel, "exists").mockResolvedValue(null);
    jest.spyOn(OrderModel, "exists").mockResolvedValue(null);
    await expect(assertAdminCustomerAreaAccess(customerId, { zoneId: "zone-a" })).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
  });

  it("uses saved ticket area first and limits legacy fallback to tickets without an area", async () => {
    jest.spyOn(RestaurantModel, "distinct").mockResolvedValue([]);
    jest.spyOn(RiderModel, "distinct").mockResolvedValue([]);
    jest.spyOn(CustomerModel, "distinct").mockResolvedValue([]);
    jest.spyOn(OrderModel, "distinct").mockImplementation((field: any) => Promise.resolve(field === "customerId" ? [customerId] : []) as any);
    const query = await buildSupportQuery({ zoneId: "zone-a" });
    expect(query.$and).toEqual(expect.arrayContaining([expect.objectContaining({ $or: expect.arrayContaining([
      { "serviceAreaSnapshot.zoneId": "zone-a" },
      expect.objectContaining({ $and: expect.arrayContaining([
        expect.objectContaining({ $or: expect.arrayContaining([{ serviceAreaSnapshot: null }]) }),
        expect.objectContaining({ $or: expect.arrayContaining([{ customerId: { $in: [customerId] } }]) }),
      ]) }),
    ]) })]));
  });
});
