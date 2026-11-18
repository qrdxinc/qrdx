import { useTranslations } from "next-intl";
import { BrandLoader } from "@/components/brand-loader";

export default function Loading() {
  // The shared "Loading…" string; the ai namespace has none of its own.
  const t = useTranslations("app.dashboard.loading");
  return (
    <div className="flex min-h-screen items-center justify-center">
      <BrandLoader label={t("loading")} />
    </div>
  );
}
