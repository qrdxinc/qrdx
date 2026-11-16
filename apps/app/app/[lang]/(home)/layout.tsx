import { MarketingShell } from "@/components/sections/marketing-shell";

export default function Layout({ children }: LayoutProps<"/[lang]">) {
  return <MarketingShell>{children}</MarketingShell>;
}
