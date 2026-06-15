import mongoose from "mongoose";

import { connectDatabase } from "../config/db";
import { logger } from "../config/logger";
import { VoucherModel, VoucherRedemptionModel } from "../modules/customer/customer.model";

// One-time migration: initialise Voucher.redeemedCount and mark existing active
// redemptions as countedTowardTotal for vouchers that enforce a global usage cap
// (maxTotalUses > 0). Safe to re-run — it recomputes from the current redemption
// state each time.
async function backfillVoucherRedeemedCount() {
  await connectDatabase();

  const vouchers = await VoucherModel.find(
    { maxTotalUses: { $gt: 0 } },
    { _id: 1 },
  ).lean();

  logger.info(
    { voucherCount: vouchers.length },
    "Backfilling redeemedCount for capped vouchers",
  );

  let updated = 0;
  for (const voucher of vouchers) {
    const activeCount = await VoucherRedemptionModel.countDocuments({
      voucherId: voucher._id,
      releasedAt: null,
    });

    await VoucherRedemptionModel.updateMany(
      { voucherId: voucher._id, releasedAt: null },
      { $set: { countedTowardTotal: true } },
    );

    await VoucherModel.updateOne(
      { _id: voucher._id },
      { $set: { redeemedCount: activeCount } },
    );

    updated += 1;
  }

  logger.info({ updated }, "Voucher redeemedCount backfill complete");
  await mongoose.disconnect();
}

backfillVoucherRedeemedCount().catch((error) => {
  logger.error(error, "Voucher redeemedCount backfill failed");
  process.exit(1);
});
