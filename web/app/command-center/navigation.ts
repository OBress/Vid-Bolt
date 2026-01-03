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
  {
    id: "settings",
    label: "SETTINGS",
    icon: Settings,
    items: [
      {
        id: "general",
        label: "General Settings",
        href: "/command-center/settings/general",
      },
    ],
  },
];

export const getActiveLabel = (pathname: string) => {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((item) => item.href === pathname);
    if (item) return item.label.toUpperCase();
  }
  // Check if it's a media project path
  if (pathname.startsWith("/command-center/media/")) {
    return "MEDIA PROJECT";
  }
  return "COMMAND CENTER";
};
