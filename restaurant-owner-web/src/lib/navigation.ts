import type { LucideIcon } from "lucide-react"
import {
  Bell,
  BarChart3,
  Bike,
  Clock3,
  LifeBuoy,
  LayoutDashboard,
  Percent,
  Settings,
  ShoppingBag,
  Star,
  Tags,
  UtensilsCrossed,
  Wallet,
} from "lucide-react"

export type NavigationItem = {
  title: string
  to: string
  icon: LucideIcon
  badge?: string
}

export type NavigationGroup = {
  label: string
  items: NavigationItem[]
}

export const restaurantProfile = {
  companyName: "Foodbela",
  name: "Meet Point",
  subtitle: "Eat & Smile",
}

export const sidebarGroups: NavigationGroup[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        to: "/",
        icon: LayoutDashboard,
      },
      {
        title: "Orders",
        to: "/orders",
        icon: ShoppingBag,
        badge: "12",
      },
      {
        title: "Foodbela Delivery",
        to: "/external-delivery",
        icon: Bike,
      },
    ],
  },
  {
    label: "Menu",
    items: [
      {
        title: "Categories",
        to: "/categories",
        icon: Tags,
        badge: "10",
      },
      {
        title: "Menu Items",
        to: "/menu",
        icon: UtensilsCrossed,
        badge: "4",
      },
    ],
  },
  {
    label: "Business",
    items: [
      {
        title: "Reviews",
        to: "/reviews",
        icon: Star,
        badge: "8",
      },
      {
        title: "Promotions",
        to: "/promotions",
        icon: Percent,
      },
      {
        title: "Analytics",
        to: "/analytics",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        title: "Payouts",
        to: "/payouts",
        icon: Wallet,
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "Store Settings",
        to: "/settings",
        icon: Settings,
      },
      {
        title: "Notifications",
        to: "/notifications",
        icon: Bell,
      },
      {
        title: "Opening Hours",
        to: "/hours",
        icon: Clock3,
      },
    ],
  },
  {
    label: "Support",
    items: [
      {
        title: "Help Center",
        to: "/support",
        icon: LifeBuoy,
      },
    ],
  },
]

export const routeTitleByPath = Object.fromEntries(
  sidebarGroups.flatMap((group) =>
    group.items.map((item) => [item.to, item.title] as const)
  )
)

routeTitleByPath["/account"] = "Owner Account"
