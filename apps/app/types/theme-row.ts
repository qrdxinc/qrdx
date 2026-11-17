import type { qrPreset } from "@repo/database";
import type { InferSelectModel } from "drizzle-orm";
import type { ThemeStyles } from "@/types/theme";

/**
 * A saved theme's database row. Kept apart from types/theme.ts, which the
 * public generator widgets import, so their code never names the database
 * package (tests/repo/widget-import-graph.test.ts).
 */
export type Theme = InferSelectModel<typeof qrPreset>;

export interface ThemeEditorControlsProps {
  styles: ThemeStyles;
  currentMode: "light" | "dark";
  onChange: (styles: ThemeStyles) => void;
  themePromise: Promise<Theme | null>;
}
