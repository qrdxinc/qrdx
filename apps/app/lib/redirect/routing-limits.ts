// How much smart routing a dynamic code can hold. Pure, so pages that quote
// the limits (/dynamic-qr-code) don't load the redirect engine
// (lib/redirect/routing.ts, which validates against them and re-exports them).

/** Routing rules per code */
export const MAX_RULES = 20;
/** Conditions per rule */
export const MAX_CONDITIONS = 8;
/** A/B variants per rule */
export const MAX_VARIANTS = 5;
/** Custom UTM parameters per code */
export const MAX_CUSTOM_PARAMS = 10;
