import { MarketingShell } from "@/components/sections/marketing-shell";

export default function Layout({ children }: LayoutProps<"/">) {
  return <MarketingShell>{children}</MarketingShell>;
}
