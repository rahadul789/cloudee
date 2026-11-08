import { buildWalletAreaFilter, resolveWalletAreaSnapshot } from "../src/modules/admin/finance-wallet-scope";
import { ServiceZoneModel, ServiceDistrictModel } from "../src/modules/service-area/service-area.model";

describe("wallet area accounting", () => {
  afterEach(() => jest.restoreAllMocks());

  it("includes legacy, platform-wide and every zone in All areas", () => {
    expect(buildWalletAreaFilter({})).toEqual({});
    expect(buildWalletAreaFilter({ zoneId: "all", districtId: "all" })).toEqual({});
  });

  it("isolates zone entries and includes zone entries in their district", async () => {
    const zoneId = "507f1f77bcf86cd799439011";
    const districtId = "507f1f77bcf86cd799439012";
    jest.spyOn(ServiceZoneModel, "findById").mockReturnValue({ lean: async () => ({ name: "Zone A", districtId, districtName: "District A" }) } as any);
    const snapshot = await resolveWalletAreaSnapshot({ zoneId });
    expect(snapshot.districtId).toBe(districtId);
    expect(buildWalletAreaFilter({ zoneId })).toEqual({ "serviceAreaSnapshot.zoneId": zoneId });
    expect(buildWalletAreaFilter({ districtId })).toEqual({ "serviceAreaSnapshot.districtId": districtId });
    await expect(resolveWalletAreaSnapshot({ zoneId, districtId: "507f1f77bcf86cd799439013" })).rejects.toMatchObject({ code: "INVALID_WALLET_AREA" });
  });

  it("keeps district-level and platform-wide entries separate from zone entries", async () => {
    const districtId = "507f1f77bcf86cd799439012";
    jest.spyOn(ServiceDistrictModel, "findById").mockReturnValue({ lean: async () => ({ name: "District A" }) } as any);
    expect(await resolveWalletAreaSnapshot({ districtId })).toEqual({ zoneId: "", zoneName: "", districtId, districtName: "District A" });
    expect(await resolveWalletAreaSnapshot({})).toEqual({ zoneId: "", zoneName: "", districtId: "", districtName: "" });
    await expect(resolveWalletAreaSnapshot({ zoneId: "invalid" })).rejects.toMatchObject({ code: "INVALID_WALLET_AREA" });
  });
});
