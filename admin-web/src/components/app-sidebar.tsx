import * as React from "react"
import { ShieldCheck } from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import type { AdminProfile } from "@/lib/admin-session"
import { adminSidebarGroups } from "@/lib/navigation"

import { NavUser } from "./nav-user"

export type AdminSidebarBadges = {
  pendingOrders: number
  restaurantApprovals: number
  complaints: number
}

type AppSidebarProps = {
  adminProfile: AdminProfile
  badges: AdminSidebarBadges
  onLogout: () => void
}

export function AppSidebar({
  adminProfile,
  badges,
  onLogout,
}: AppSidebarProps) {
  const location = useLocation()

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip="Dashboard"
              isActive={location.pathname === "/"}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <NavLink to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <ShieldCheck className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">Foodbela</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Admin Panel
                  </span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="mx-2 mt-2 rounded-xl border bg-sidebar-accent/40 p-3 group-data-[collapsible=icon]:hidden">
          <div className="text-sm font-medium">Platform Control</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage users, restaurants, riders, orders, payments, and support.
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-2">
        {adminSidebarGroups.map((group, groupIndex) => (
          <React.Fragment key={group.label}>
            <SidebarGroup>
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const [itemPath, itemSearch = ""] = item.to.split("?")
                    const itemHasSearch = item.to.includes("?")
                    const currentFullPath = `${location.pathname}${location.search}`
                    const hasActiveQuerySibling = group.items.some((sibling) => {
                      if (!sibling.to.includes("?")) return false
                      const [siblingPath] = sibling.to.split("?")
                      return siblingPath === itemPath && currentFullPath === sibling.to
                    })
                    const isActive =
                      item.to === "/"
                        ? location.pathname === "/"
                        : itemHasSearch
                          ? currentFullPath === `${itemPath}?${itemSearch}`
                          : !hasActiveQuerySibling &&
                            (location.pathname === itemPath ||
                              location.pathname.startsWith(`${itemPath}/`))
                    const badge =
                      item.badgeKey && badges[item.badgeKey] > 0
                        ? badges[item.badgeKey]
                        : null

                    return (
                      <SidebarMenuItem key={`${group.label}-${item.title}`}>
                        <SidebarMenuButton
                          asChild
                          tooltip={item.title}
                          isActive={isActive}
                        >
                          <NavLink to={item.to} end={item.to === "/"}>
                            <item.icon className="size-4" />
                            <span>{item.title}</span>
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

            {groupIndex < adminSidebarGroups.length - 1 ? (
              <SidebarSeparator />
            ) : null}
          </React.Fragment>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <NavUser
          user={{
            name: adminProfile.fullName || "Admin Account",
            email: adminProfile.email || "No email added",
          }}
          onLogout={onLogout}
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
