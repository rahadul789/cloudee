import { sendOperationalAlert } from "../modules/monitoring/alert-notifier";

async function main() {
  await sendOperationalAlert({
    dedupeKey: `manual-test:${Date.now()}`,
    severity: "info",
    title: "Foodbela alert email test",
    body:
      "This is a manual test alert from the Foodbela backend. If you received this email, SMTP alert delivery is working.",
    details: {
      environment: process.env.NODE_ENV ?? "development",
      recipient: process.env.ALERT_RECIPIENT_EMAILS ?? "",
      sentAt: new Date().toISOString(),
    },
  });

  console.log("Test alert send attempted. Check the recipient inbox and backend logs for delivery errors.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
