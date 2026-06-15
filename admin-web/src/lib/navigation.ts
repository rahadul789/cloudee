import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  CircleAlert,
  Bell,
  BookOpenText,
  CreditCard,
  Gift,
  Globe2,
  HeartPulse,
  Headphones,
  Image,
  KeyRound,
  Landmark,
  LayoutDashboard,
  MailCheck,
  Map,
  MapPin,
  ReceiptText,
  Settings,
  ShoppingBag,
  Star,
  Store,
  Tags,
  TicketPercent,
  RotateCcw,
  Truck,
  Users,
  TrendingUp,
  WalletCards,
} from "lucide-react"

export type AdminNavigationItem = {
  title: string
  to: string
  icon: LucideIcon
  badgeKey?: "pendingOrders" | "restaurantApprovals" | "complaints"
}

export type AdminNavigationGroup = {
  label: string
  items: AdminNavigationItem[]
}

export const adminSidebarGroups: AdminNavigationGroup[] = [
  {
    label: "Platform",
    items: [
      {
        title: "Dashboard",
        to: "/",
        icon: LayoutDashboard,
      },
      {
        title: "Users",
        to: "/users",
        icon: Users,
      },
      {
        title: "Restaurants",
        to: "/restaurants",
        icon: Store,
        badgeKey: "restaurantApprovals",
      },
      {
        title: "Orders",
        to: "/orders",
        icon: ShoppingBag,
        badgeKey: "pendingOrders",
      },
    ],
  },
  {
    label: "Delivery",
    items: [
      {
        title: "Riders / Delivery",
        to: "/riders",
        icon: Truck,
      },
      {
        title: "Rider Payroll",
        to: "/riders?tab=earnings",
        icon: WalletCards,
      },
      {
        title: "Live Map",
        to: "/live-map",
        icon: MapPin,
      },
      {
        title: "Service Areas",
        to: "/service-areas",
        icon: Map,
      },
      {
        title: "Dispatch Controls",
        to: "/riders?tab=dispatch",
        icon: HeartPulse,
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        title: "Platform",
        to: "/platform-finance",
        icon: Landmark,
      },
      {
        title: "Transactions",
        to: "/transactions",
        icon: ReceiptText,
      },
      {
        title: "Payments",
        to: "/payments",
        icon: CreditCard,
      },
      {
        title: "Payouts",
        to: "/payouts",
        icon: WalletCards,
      },
      {
        title: "Ledger",
        to: "/ledger",
        icon: BookOpenText,
      },
      {
        title: "Refunds",
        to: "/refunds",
        icon: RotateCcw,
      },
      {
        title: "Reports",
        to: "/reports",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "Growth",
    items: [
      {
        title: "Coupons & Offers",
        to: "/coupons",
        icon: TicketPercent,
      },
      {
        title: "Customer Analytics",
        to: "/customer-analytics",
        icon: TrendingUp,
      },
      {
        title: "Referrals",
        to: "/referrals",
        icon: Gift,
      },
      {
        title: "Foodbela.com",
        to: "/website",
        icon: Globe2,
      },
    ],
  },
  {
    label: "Content & Trust",
    items: [
      {
        title: "Content / CMS",
        to: "/cms",
        icon: Image,
      },
      {
        title: "Food Categories",
        to: "/categories",
        icon: Tags,
      },
      {
        title: "Reviews",
        to: "/reviews",
        icon: Star,
      },
      {
        title: "Complaints / Support",
        to: "/support",
        icon: Headphones,
        badgeKey: "complaints",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        title: "Action Center",
        to: "/action-center",
        icon: CircleAlert,
      },
      {
        title: "Operations Health",
        to: "/operations",
        icon: HeartPulse,
      },
      {
        title: "Test",
        to: "/test",
        icon: MailCheck,
      },
      {
        title: "Notifications",
        to: "/notifications",
        icon: Bell,
      },
      {
        title: "Sessions",
        to: "/sessions",
        icon: KeyRound,
      },
      {
        title: "Settings",
        to: "/settings",
        icon: Settings,
      },
    ],
  },
]

export const adminRouteTitleByPath = Object.fromEntries(
  adminSidebarGroups.flatMap((group) =>
    group.items.map((item) => [item.to, item.title] as const)
  )
)
