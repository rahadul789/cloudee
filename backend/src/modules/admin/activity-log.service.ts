import { AdminActivityLogModel } from "./activity-log.model";

export async function createAdminActivityLog(params: {
  action: string;
  entityType: string;
  entityId: string;
  title: string;
  description: string;
  adminId?: string;
  adminName?: string;
  metadata?: Record<string, unknown>;
}) {
  await AdminActivityLogModel.create({
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    title: params.title,
    description: params.description,
    adminId: params.adminId ?? "",
    adminName: params.adminName ?? "",
    metadata: params.metadata ?? {},
  });
}

export async function listAdminActivityLogs(params?: {
  entityType?: string;
  entityId?: string;
  page?: number;
  pageSize?: number;
  includeTotal?: boolean;
  zoneId?: string;
  districtId?: string;
}) {
  const query: Record<string, any> = {};
  if (params?.entityType) query.entityType = params.entityType;
  if (params?.entityId) query.entityId = params.entityId;
  if (params?.zoneId?.trim()) {
    const zoneId = params.zoneId.trim();
    query.$or = [
      { "metadata.zoneId": zoneId },
      { "metadata.serviceArea.zoneId": zoneId },
      { "metadata.serviceAreaSnapshot.zoneId": zoneId },
      { "metadata.scope.zoneId": zoneId },
    ];
  } else if (params?.districtId?.trim()) {
    const districtId = params.districtId.trim();
    query.$or = [
      { "metadata.districtId": districtId },
      { "metadata.serviceArea.districtId": districtId },
      { "metadata.serviceAreaSnapshot.districtId": districtId },
      { "metadata.scope.districtId": districtId },
    ];
  }

  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20));
  const includeTotal = params?.includeTotal !== false;

  const items = await AdminActivityLogModel.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();
  const total = includeTotal ? await AdminActivityLogModel.countDocuments(query) : items.length;

  return {
    items: items.map((item) => ({
      id: item._id.toString(),
      action: String(item.action ?? ""),
      entityType: String(item.entityType ?? ""),
      entityId: String(item.entityId ?? ""),
      title: String(item.title ?? ""),
      description: String(item.description ?? ""),
      adminId: String(item.adminId ?? ""),
      adminName: String(item.adminName ?? ""),
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      metadata:
        item.metadata && typeof item.metadata === "object" ? item.metadata : {},
    })),
    total,
  };
}
