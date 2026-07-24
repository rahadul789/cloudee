/**
 * Hard bounds for a restaurant's preparation-time estimate. Anything longer than the
 * maximum is not a realistic prep time and mostly hurts the customer's delivery ETA,
 * so the owner app, owner web and onboarding all validate against these.
 */
export const MIN_PREPARATION_TIME_MINUTES = 5;
export const MAX_PREPARATION_TIME_MINUTES = 45;
