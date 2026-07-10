import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Image } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  checkCustomerHomePushReceipts,
  cancelCustomerHomePushSchedule,
  getPlatformContent,
  refreshCustomerHomePushConversions,
  scheduleCustomerHomePushCampaign,
  sendCustomerHomePushCampaign,
  sendCustomerHomeTestPush,
  updatePlatformContent,
  type PlatformContent,
} from "@/lib/admin-cms-api"
import { getAdminZoneScope, subscribeAdminZoneScope } from "@/lib/admin-zone-scope"
import { getAdminRestaurantsWithOffers, listAdminRestaurants } from "@/lib/admin-api"

import { CustomerHomeCmsSection } from "./customer-home-cms-section"

function formatCurrency(value?: number | null) {
  return `Tk ${Math.round(Number.isFinite(value ?? 0) ? value ?? 0 : 0).toLocaleString()}`
}

export function CmsPage() {
  const queryClient = useQueryClient()
  const [adminZoneScope, setAdminZoneScope] = React.useState(() => getAdminZoneScope())

  React.useEffect(() => subscribeAdminZoneScope(() => setAdminZoneScope(getAdminZoneScope())), [])

  const platformContentQuery = useQuery({
    queryKey: ["admin-platform-content", adminZoneScope.type, adminZoneScope.id],
    queryFn: getPlatformContent,
    enabled: adminZoneScope.type !== "all",
    staleTime: 30_000,
  })

  // Restaurants that populate the manual pickers (Featured, Offers, etc.). Without this
  // the CMS was passing an empty list, so the manual restaurant chooser showed nothing.
  const restaurantsQuery = useQuery({
    queryKey: ["admin-restaurants", "cms-home-sections"],
    queryFn: () =>
      listAdminRestaurants({ page: 1, pageSize: 200, sortBy: "newestUpdated" }),
    enabled: adminZoneScope.type !== "all",
    staleTime: 60_000,
  })
  const restaurants = restaurantsQuery.data?.items ?? []

  // Restaurants that currently have a badge-eligible offer — auto-populates the "Offers
  // for you" order editor. Refetched on content save so expired offers drop out.
  const offerRestaurantsQuery = useQuery({
    queryKey: ["admin-restaurants-with-offers"],
    queryFn: getAdminRestaurantsWithOffers,
    enabled: adminZoneScope.type !== "all",
    staleTime: 30_000,
  })
  const offerRestaurants = offerRestaurantsQuery.data ?? []

  const updateContentMutation = useMutation({
    mutationFn: updatePlatformContent,
    onSuccess: () => {
      toast.success("Customer home CMS updated")
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-content"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update customer home CMS"),
  })

  const sendHomePushMutation = useMutation({
    mutationFn: async (content: PlatformContent) => {
      await updatePlatformContent(content)
      return sendCustomerHomePushCampaign()
    },
    onSuccess: (result) => {
      toast.success(`Push sent to ${result.totalTargets} customers`)
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-content"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to send push"),
  })

  const checkHomePushReceiptsMutation = useMutation({
    mutationFn: checkCustomerHomePushReceipts,
    onSuccess: (result) => {
      toast.success(
        `Delivery checked: ${result.deliveredToProvider} accepted, ${result.deviceNotRegistered} uninstalled`
      )
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-content"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to check push delivery"),
  })

  const refreshHomePushConversionsMutation = useMutation({
    mutationFn: refreshCustomerHomePushConversions,
    onSuccess: (result) => {
      toast.success(`Conversions refreshed: ${result.orderCount} orders, ${formatCurrency(result.deliveredRevenue)} revenue`)
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-content"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to refresh conversions"),
  })

  const scheduleHomePushMutation = useMutation({
    mutationFn: async ({ content, scheduledAt }: { content: PlatformContent; scheduledAt: string }) => {
      await updatePlatformContent(content)
      return scheduleCustomerHomePushCampaign(scheduledAt)
    },
    onSuccess: (result) => {
      toast.success(`Push scheduled for ${new Date(result.scheduledAt).toLocaleString()}`)
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-content"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to schedule push"),
  })

  const sendHomeTestPushMutation = useMutation({
    mutationFn: async ({ content, customerId }: { content: PlatformContent; customerId: string }) => {
      await updatePlatformContent(content)
      return sendCustomerHomeTestPush(customerId)
    },
    onSuccess: (result) => {
      toast.success(`Test push sent: ${result.sentCount} push, ${result.disabledCount} disabled`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to send test push"),
  })

  const cancelHomePushScheduleMutation = useMutation({
    mutationFn: cancelCustomerHomePushSchedule,
    onSuccess: () => {
      toast.success("Scheduled push cancelled")
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-content"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to cancel schedule"),
  })

  if (platformContentQuery.isError) {
    const message =
      platformContentQuery.error instanceof Error
        ? platformContentQuery.error.message
        : "Failed to load CMS content."

    return (
      <>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Image className="size-5" />
              </span>
              Content / CMS
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage customer-app home content, education blocks, and modals.
              Push campaigns are managed from Notifications.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-destructive/10 p-3 text-destructive">
              <Image className="size-6" />
            </div>
            <div>
              <p className="font-semibold">CMS content could not load</p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{message}</p>
            </div>
            <Button onClick={() => platformContentQuery.refetch()}>Try again</Button>
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Image className="size-5" />
            </span>
            Content / CMS
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage customer-app home content, education blocks, and modals.
            Push campaigns are managed from Notifications.
          </p>
          <p className="mt-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Area zone: <span className="font-medium text-foreground">{adminZoneScope.label}</span>.
            {adminZoneScope.type === "all"
              ? " Select one district or zone first. CMS is zone based and cannot be edited from All areas."
              : " Offer strip, modal, and home push content save for this area only."}
          </p>
        </div>
      </div>

      {adminZoneScope.type === "all" ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Image className="size-6" />
            </div>
            <div>
              <p className="font-semibold">Choose an area to edit CMS</p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Home modal, offer strip, promotional blocks, and push content
                are shown only inside the selected service area. This prevents a
                Netrakona campaign from leaking into another district.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <CustomerHomeCmsSection
          content={platformContentQuery.data?.content ?? null}
          customers={[]}
          restaurants={restaurants}
          offerRestaurants={offerRestaurants}
          isLoading={platformContentQuery.isLoading}
          isSaving={updateContentMutation.isPending}
          isSending={sendHomePushMutation.isPending}
          isCheckingReceipts={checkHomePushReceiptsMutation.isPending}
          isRefreshingConversions={refreshHomePushConversionsMutation.isPending}
          isScheduling={scheduleHomePushMutation.isPending}
          isCancellingSchedule={cancelHomePushScheduleMutation.isPending}
          isTestingPush={sendHomeTestPushMutation.isPending}
          onSave={(content) => updateContentMutation.mutate(content)}
          onSendPush={(content) => sendHomePushMutation.mutate(content)}
          onCheckReceipts={() => checkHomePushReceiptsMutation.mutate()}
          onRefreshConversions={() => refreshHomePushConversionsMutation.mutate()}
          onSchedulePush={(content, scheduledAt) => scheduleHomePushMutation.mutate({ content, scheduledAt })}
          onCancelSchedule={() => cancelHomePushScheduleMutation.mutate()}
          onSendTestPush={(content, customerId) => sendHomeTestPushMutation.mutate({ content, customerId })}
          hidePushCampaign
        />
      )}
    </>
  )
}
