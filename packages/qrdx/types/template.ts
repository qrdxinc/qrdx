import { z } from "zod";

// A custom template: artwork you draw in code around the code (`customTemplate`,
// with its own props in `customProps`). The built-in templates became frames
// in qrdx 0.0.64, which also dropped this hook; it's back since 0.0.65.

// Zod schemas
export const baseTemplatePropsSchema = z.object({
  fgColor: z.string().optional(),
  bgColor: z.string().optional(),
});

/**
 * The third argument of a template's wrapper: the code's `url` (its value)
 * and `pixelSize`, one module's width in the template's 300 × 300 drawing.
 *
 * @example
 * ```tsx
 * wrapper: (children, props, config) => {
 *   // Size decorative dots from the module width
 *   const dotRadius = (config?.pixelSize ?? 10) * 0.5;
 *   return <svg viewBox="0 0 300 300">...</svg>;
 * }
 * ```
 */
export const templateConfigSchema = z.object({
  pixelSize: z.number(),
  url: z.string(),
});

// Note: TemplateDefinition cannot be fully represented in Zod due to its element and function types
// We'll keep the type definition but add validation for the serializable parts
export const templateDefinitionBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

// Inferred types
export type BaseTemplateProps = z.infer<typeof baseTemplatePropsSchema>;
export type TemplateConfig = z.infer<typeof templateConfigSchema>;

/**
 * What a template wrapper receives and returns: React elements when a React
 * component draws the code, the core's plain nodes (`QRNode`) otherwise. A
 * wrapper written with JSX or `h` from "qrdx/core" works in both.
 */
export type TemplateNode = any;

// Generic template definition that allows custom props
export interface TemplateDefinition<TCustomProps = Record<string, never>> {
  id: string;
  name: string;
  description?: string;
  wrapper: (
    children: TemplateNode,
    props?: BaseTemplateProps & TCustomProps,
    templateConfig?: TemplateConfig
  ) => TemplateNode;
}
