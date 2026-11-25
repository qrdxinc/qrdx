import { dashboardEntry } from "@/lib/workspace-paths";
import { PAGE_TYPE_IDS } from "./page-type-ids";

// URLs for the public template gallery and demos. Kept free of the template
// registry so the dashboard picker can link to demos without loading it.

/** The public template gallery. */
export const TEMPLATES_PATH = "/templates";

/** Live demo of one template: /templates/<type>/<template id>. */
export function demoPath(type: string, variantId: string): string {
  return `${TEMPLATES_PATH}/${encodeURIComponent(type)}/${encodeURIComponent(variantId)}`;
}

/** Gallery section of a page type: /templates#<type>. */
export function gallerySectionPath(type: string): string {
  return `${TEMPLATES_PATH}#${encodeURIComponent(type)}`;
}

/** The `ref` tag on the "Made with QRdx" badge (lib/analytics/handoff-tags.ts). */
const MADE_WITH_QRDX_REF = "made-with-qrdx";

const PAGE_TYPES: ReadonlySet<string> = new Set(PAGE_TYPE_IDS);

/**
 * Where a Free hosted page's "Made with QRdx" badge leads: the template
 * gallery, narrowed to the page's own type (its section's hash), so a
 * scanner who wants a page like it sees how to make one. The `ref` tag
 * marks the visit as the badge's. The gallery is English only
 * (packages/i18n/localized-paths.json), so the path has no language.
 */
export function madeWithQrdxPath(type: string): string {
  const path = `${TEMPLATES_PATH}?ref=${MADE_WITH_QRDX_REF}`;
  return PAGE_TYPES.has(type) ? `${path}#${encodeURIComponent(type)}` : path;
}

/**
 * The dashboard's "New page" dialog with the type and template preselected
 * (read by app/(app)/dashboard/[workspace]/pages/page.tsx), in the reader's
 * default workspace.
 */
export function templateStartPath(type: string, variantId: string): string {
  return dashboardEntry("pages", { new: type, template: variantId });
}
