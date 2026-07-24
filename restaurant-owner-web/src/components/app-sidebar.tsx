import * as React from "react"
import { NavLink, useLocation } from "react-router-dom"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenuBadge,
  SidebarSeparator,
  SidebarRail,
} from "@/components/ui/sidebar"
import { sidebarGroups } from "@/lib/navigation"
import { useOwnerEnforcement } from "@/components/enforcement-banner"
import { Circle, Lock, Store } from "lucide-react"

import { NavUser } from "./nav-user"
import { useRestaurantStatus } from "./restaurant-status-context"
import { Switch } from "./ui/switch"
import { useOwnerSidebarSummaryQuery } from "@/hooks/use-owner-api"
import { useAppStore } from "@/store/app-store"

export function AppSidebar() {
  const location = useLocation()
  const { isOnline, setIsOnline, isUpdating } = useRestaurantStatus()
  // Quality hold / suspension / permanent disable block going online (under_review
  // does not, so `isRestricted` — not merely "has enforcement" — gates the switch).
  const isRestricted = Boolean(useOwnerEnforcement()?.isRestricted)
  const storeSettings = useAppStore((state) => state.storeSettings)
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const sidebarSummaryQuery = useOwnerSidebarSummaryQuery(
    ownerAccount.isAuthenticated
  )
  const sidebarSummary = sidebarSummaryQuery.data
  const liveOrdersCount = sidebarSummary?.liveOrders ?? 0
  const unreadNotificationsCount = sidebarSummary?.unreadNotifications ?? 0
  const storeDisplayName = storeSettings.name.trim() || "Your store"

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip="Store Settings"
              isActive={location.pathname === "/settings"}
              className="relative data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:shadow-[inset_3px_0_0_currentColor] data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <NavLink to="/settings">
                <div className="flex aspect-square size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Store className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">Store</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {storeDisplayName}
                  </span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="mx-2 mt-2 rounded-xl border bg-sidebar-accent/40 p-3 group-data-[collapsible=icon]:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">Restaurant Status</div>
              <p className="text-xs text-muted-foreground">
                {isRestricted
                  ? "Foodbela has blocked your store from going online."
                  : isOnline
                    ? "Customers can place orders right now."
                    : "Your store is hidden from customers."}
              </p>
            </div>

            <Switch
              checked={isOnline}
              onCheckedChange={setIsOnline}
              disabled={isUpdating || isRestricted}
            />
          </div>

          <div className="mt-3 flex items-center justify-end gap-2 text-xs font-medium">
            {isRestricted ? (
              <Lock className="size-3 text-rose-600" />
            ) : (
              <Circle
                className={`size-2.5 ${
                  isOnline
                    ? "fill-emerald-500 text-emerald-500"
                    : "fill-slate-400 text-slate-400"
                }`}
              />
            )}
            {isRestricted ? (
              <span className="text-rose-600">Blocked</span>
            ) : isOnline ? (
              "Online"
            ) : (
              "Offline"
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-2">
        {sidebarGroups.map((group, groupIndex) => (
          <React.Fragment key={group.label}>
            <SidebarGroup>
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
                {group.label}
              </SidebarGroupLabel>

              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const badge =
                      item.to === "/orders"
                        ? `${liveOrdersCount}`
                        : item.to === "/menu"
                          ? `${sidebarSummary?.menuItems ?? 0}`
                          : item.to === "/categories"
                          ? `${sidebarSummary?.categories ?? 0}`
                            : item.to === "/reviews"
                              ? `${sidebarSummary?.reviews ?? 0}`
                              : item.to === "/promotions"
                                ? `${sidebarSummary?.promotions ?? 0}`
                              : item.badge

                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          tooltip={item.title}
                          isActive={location.pathname === item.to}
                          className="relative data-[active=true]:bg-primary/10 data-[active=true]:font-medium data-[active=true]:text-primary data-[active=true]:shadow-[inset_3px_0_0_currentColor] data-[active=true]:hover:bg-primary/15 data-[active=true]:hover:text-primary [&[data-active=true]_svg]:text-primary"
                        >
                          <NavLink to={item.to} end={item.to === "/"}>
                            <item.icon className="size-4" />
                            <span>{item.title}</span>

                            {item.to === "/orders" && liveOrdersCount > 0 ? (
                              <span className="relative ml-1 inline-flex h-2 w-2 rounded-full bg-emerald-500 group-data-[collapsible=icon]:hidden">
                                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-75" />
                              </span>
                            ) : item.to === "/notifications" &&
                              unreadNotificationsCount > 0 ? (
                              <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-sky-500 group-data-[collapsible=icon]:hidden" />
                            ) : null}
                          </NavLink>
                        </SidebarMenuButton>

                        {badge ? (
                          <SidebarMenuBadge>{badge}</SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {groupIndex < sidebarGroups.length - 1 ? (
              <SidebarSeparator />
            ) : null}
          </React.Fragment>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <NavUser
          user={{
            name: ownerAccount.ownerName || "Owner Account",
            email: ownerAccount.email || ownerAccount.phone || "No email added",
            avatar: ownerAccount.profileImageUrl,
          }}
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
