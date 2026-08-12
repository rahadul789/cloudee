import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  CircleAlert,
  Bell,
  BookOpenText,
  ClipboardCheck,
  CreditCard,
  Gift,
  Globe2,
  Gauge,
  HeartPulse,
  Headphones,
  Image,
  KeyRound,
  Landmark,
  LayoutDashboard,
  MailCheck,
  Map,
  MapPin,
  PackageCheck,
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
  /** When true, only rendered in dev builds (import.meta.env.DEV). */
  devOnly?: boolean
}

export type AdminNavigationGroup = {
  label: string
  items: AdminNavigationItem[]
}

export const adminSidebarGroups: AdminNavigationGroup[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        to: "/",
        icon: LayoutDashboard,
      },
      {
        title: "Action Center",
        to: "/action-center",
        icon: CircleAlert,
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        title: "Customers",
        to: "/users",
        icon: Users,
      },
      {
        title: "Customer Insights",
        to: "/customer-analytics",
        icon: TrendingUp,
      },
      {
        title: "Sessions & Activity",
        to: "/sessions",
        icon: KeyRound,
      },
    ],
  },
  {
    label: "Commerce",
    items: [
      {
        title: "Orders",
        to: "/orders",
        icon: ShoppingBag,
        badgeKey: "pendingOrders",
      },
      {
        title: "Restaurants",
        to: "/restaurants",
        icon: Store,
        badgeKey: "restaurantApprovals",
      },
      {
        title: "Menu Approvals",
        to: "/menu-approvals",
        icon: ClipboardCheck,
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
    label: "External Delivery",
    items: [
      {
        title: "Orders",
        to: "/external-delivery",
        icon: PackageCheck,
      },
      {
        title: "Reports",
        to: "/external-delivery/reports",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        title: "Finance Overview",
        to: "/finance?tab=platform",
        icon: Landmark,
      },
      {
        title: "Transactions",
        to: "/finance?tab=transactions",
        icon: ReceiptText,
      },
      {
        title: "Payments",
        to: "/finance?tab=payments",
        icon: CreditCard,
      },
      {
        title: "Payouts",
        to: "/finance?tab=payouts",
        icon: WalletCards,
      },
      {
        title: "Ledger",
        to: "/finance?tab=ledger",
        icon: BookOpenText,
      },
      {
        title: "Refunds",
        to: "/finance?tab=refunds",
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
    label: "Growth & Marketing",
    items: [
      {
        title: "Coupons & Offers",
        to: "/coupons",
        icon: TicketPercent,
      },
      {
        title: "Promo Tracking",
        to: "/promo-analytics",
        icon: BarChart3,
      },
      {
        title: "Referrals & FFO",
        to: "/referrals",
        icon: Gift,
      },
      {
        title: "Content / CMS",
        to: "/cms",
        icon: Image,
      },
      {
        title: "Notifications",
        to: "/notifications",
        icon: Bell,
      },
      {
        title: "Foodbela.com",
        to: "/website",
        icon: Globe2,
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        title: "Rate Limits",
        to: "/rate-limits",
        icon: Gauge,
      },
      {
        title: "OTP Monitor",
        to: "/otp-monitor",
        icon: KeyRound,
      },
      {
        title: "Operations Health",
        to: "/operations",
        icon: HeartPulse,
      },
      {
        title: "Settings",
        to: "/settings",
        icon: Settings,
      },
      {
        title: "Test",
        to: "/test",
        icon: MailCheck,
      },
    ],
  },
]

export const adminRouteTitleByPath = Object.fromEntries(
  adminSidebarGroups.flatMap((group) =>
    group.items.map((item) => [item.to, item.title] as const)
  )
)
