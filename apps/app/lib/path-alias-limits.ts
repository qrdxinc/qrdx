// Limits of path aliases (lib/path-aliases.ts), apart so product facts
// (lib/product-facts.ts) can quote them without importing the app.

/** Longest path, the leading "/" included. */
export const PATH_ALIAS_MAX_LENGTH = 200;
/** Parts between slashes. */
export const PATH_ALIAS_MAX_SEGMENTS = 8;
/** Aliases one code can have on its domain. */
export const PATH_ALIASES_PER_CODE = 5;
