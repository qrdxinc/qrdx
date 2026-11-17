import { GITHUB_REPO_URL } from "@repo/config";
import { GithubLogo } from "@repo/design-system/components/icons";
import type { BaseLayoutProps, LinkItemType } from "fumadocs-ui/layouts/shared";
import { DashboardLink } from "@/components/docs/docs-header-links";
import { QrdxLogo } from "@/components/qrdx-logo";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";

export const logo = (
  <>
    <QrdxLogo className="size-5 md:hidden block text-primary" />
    <QrdxLogoAnimation size={28} className="hidden md:block" />
  </>
);

/**
 * The header's right-hand items: the Dashboard button (primary, into the
 * main app) and the repository. On wide screens fumadocs' notebook header
 * shows them; below `lg` the Dashboard button sits at the top of the menu
 * and GitHub in its footer, with the theme switch.
 */
export function headerLinks({
  dashboard,
  github,
}: {
  dashboard: string;
  github: string;
}): LinkItemType[] {
  return [
    {
      type: "custom",
      children: <DashboardLink label={dashboard} />,
    },
    {
      type: "icon",
      url: GITHUB_REPO_URL,
      external: true,
      text: github,
      label: github,
      icon: <GithubLogo />,
    },
  ];
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          {logo}
          <span className="font-medium in-[header_&]:text-[15px]">QRdx</span>
        </>
      ),
    },
  };
}
