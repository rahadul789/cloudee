// Mirrors the backend bounds (backend/src/common/constants/preparation.ts). Anything
// longer than the maximum is not a realistic prep time and only inflates the customer's
// delivery ETA, so the server rejects it — keep these two in sync.
export const MIN_PREPARATION_TIME_MINUTES = 5;
export const MAX_PREPARATION_TIME_MINUTES = 45;
