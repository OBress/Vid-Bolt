import { Monitor, Target, Settings } from "lucide-react";

export const NAV_GROUPS = [
  {
    id: "media",
    label: "MEDIA PROJECTS",
    icon: Monitor,
    items: [
      {
        id: "project-1",
        label: "Media Project 1",
        href: "/command-center/media/project-1",
      },
      {
        id: "project-2",
        label: "Media Project 2",
        href: "/command-center/media/project-2",
      },
      {
        id: "project-3",
        label: "Media Project 3",
        href: "/command-center/media/project-3",
      },
    ],
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
  return "COMMAND CENTER";
};
