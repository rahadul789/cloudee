import { StatusCodes } from "http-status-codes";
import { AppError } from "../../common/utils/app-error";
import { ServiceDistrictModel, ServiceZoneModel } from "../service-area/service-area.model";

type AreaScope = { zoneId?: string | null; districtId?: string | null };
const scopeId = (value?: string | null) => value?.trim() === "all" ? "" : value?.trim() || "";

export function buildWalletAreaFilter(scope: AreaScope = {}) {
  const filter: Record<string, string> = {};
  const zoneId = scopeId(scope.zoneId);
  const districtId = scopeId(scope.districtId);
  if (zoneId) filter["serviceAreaSnapshot.zoneId"] = zoneId;
  if (districtId) filter["serviceAreaSnapshot.districtId"] = districtId;
  return filter;
}

export async function resolveWalletAreaSnapshot(scope: AreaScope) {
  const zoneId = scopeId(scope.zoneId);
  const districtId = scopeId(scope.districtId);
  if (zoneId) {
    const zone = /^[a-f\d]{24}$/i.test(zoneId) ? await ServiceZoneModel.findById(zoneId).lean() : null;
    if (!zone || (districtId && String(zone.districtId) !== districtId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, "INVALID_WALLET_AREA", "Selected wallet zone or district is invalid");
    }
    return { zoneId, zoneName: zone.name, districtId: String(zone.districtId), districtName: zone.districtName };
  }
  if (districtId) {
    const district = /^[a-f\d]{24}$/i.test(districtId) ? await ServiceDistrictModel.findById(districtId).lean() : null;
    if (!district) throw new AppError(StatusCodes.BAD_REQUEST, "INVALID_WALLET_AREA", "Selected wallet district is invalid");
    return { zoneId: "", zoneName: "", districtId, districtName: district.name };
  }
  return { zoneId: "", zoneName: "", districtId: "", districtName: "" };
}
