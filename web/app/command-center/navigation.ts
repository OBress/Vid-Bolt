import { Monitor, Target, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  href: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  dynamic?: boolean; // If true, items are loaded from DB
}

export interface FooterNavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  adminOnly?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "media",
    label: "MEDIA PROJECTS",
    icon: Monitor,
    items: [], // Dynamically loaded from Supabase
    dynamic: true,
  },
  {
    id: "analytics",
    label: "ANALYTICS",
    icon: Target,
    items: [
      {
        id: "performance",
        label: "Performance",
        href: "/command-center/analytics/performance",
      },
      {
        id: "audience",
        label: "Audience",
        href: "/command-center/analytics/audience",
      },

    ],
  },
];

export const FOOTER_NAV_ITEMS: FooterNavItem[] = [
  {
    id: "admin",
    label: "Admin",
    href: "/command-center/admin",
    icon: "Shield",
    adminOnly: true,
  },
  {
    id: "payments",
    label: "Payments",
    href: "/command-center/payments",
    icon: "CreditCard",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/command-center/settings/general",
    icon: "Settings",
  },
];

export const getActiveLabel = (pathname: string) => {
  // Check main groups
  for (const group of NAV_GROUPS) {
    const item = group.items.find((item) => item.href === pathname);
    if (item) return item.label.toUpperCase();
  }
  // Check footer items
  const footerItem = FOOTER_NAV_ITEMS.find((item) => item.href === pathname);
  if (footerItem) return footerItem.label.toUpperCase();

  // Check if it's a media project path
  if (pathname.startsWith("/command-center/media/")) {
    return "MEDIA PROJECT";
  }
  return "COMMAND CENTER";
};
