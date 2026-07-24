import * as React from "react"
import { Moon, SunMedium, User } from "lucide-react"
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useRouteError,
  useLocation,
  useNavigate,
} from "react-router-dom"

import { AppSidebar } from "@/components/app-sidebar"
import { ImpersonateRoute } from "@/components/impersonate-route"
import { ImpersonationBanner } from "@/components/impersonation-banner"
import { CategoriesProvider } from "@/components/categories/categories-context"
import { OpeningHoursProvider } from "@/components/hours/opening-hours-context"
import { MenuItemsProvider } from "@/components/menu/menu-items-context"
import { NotificationsPopover } from "@/components/notifications/notifications-popover"
import { NotificationsProvider } from "@/components/notifications/notifications-context"
import { OrderAttentionPanel } from "@/components/orders/order-attention-panel"
import { NewOrderModal } from "@/components/orders/new-order-modal"
import { OrdersProvider } from "@/components/orders/orders-context"
import { PayoutsProvider } from "@/components/payouts/payouts-context"
import { PromotionsProvider } from "@/components/promotions/promotions-context"
import { ReviewsProvider } from "@/components/reviews/reviews-context"
import {
  RestaurantStatusProvider,
  useRestaurantStatus,
} from "@/components/restaurant-status-context"
import { OwnerSignInPage } from "@/components/auth/owner-sign-in-page"
import { VerificationModalHost } from "@/components/auth/verification-modal-host"
import { ForgotPasswordPage } from "@/components/auth/forgot-password-page"
import { ResetVerificationPage } from "@/components/auth/reset-verification-page"
import { ResetPasswordPage } from "@/components/auth/reset-password-page"
import { DataPageSkeleton } from "@/components/data-page-skeleton"
import { OnboardingPageSkeleton } from "@/components/onboarding-page-skeleton"
import { ReviewStatusPageSkeleton } from "@/components/review-status-page-skeleton"
import { TermsAndConditionsPage } from "@/components/terms-and-conditions-page"
import { PrivacyPolicyPage } from "@/components/privacy-policy-page"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { useTheme } from "@/components/theme-provider"
import {
  buildOnboardingStateFromDraft,
  buildPayoutMethodFromDraft,
  buildOnboardingStateFromReviewStatus,
  buildOpeningHoursFromDraft,
  buildStoreSettingsFromDraft,
} from "@/lib/backend-mappers"
import { useOnboardingDraftQuery, useReviewStatusQuery } from "@/hooks/use-owner-api"
import { useOwnerSocketBridge } from "@/hooks/use-owner-socket"
import { routeTitleByPath } from "@/lib/navigation"
import { useAppStore } from "@/store/app-store"
import { liveOrderStatuses } from "@/components/orders/types"
import type { OwnerAccount, RestaurantLifecycleStatus } from "@/store/app-store"

const OWNER_DOCUMENT_TITLE = "Foodbela Owner"
const OnboardingPage = React.lazy(() =>
  import("@/components/onboarding-page").then((module) => ({
    default: module.OnboardingPage,
  }))
)
const ReviewStatusPage = React.lazy(() =>
  import("@/components/review-status-page").then((module) => ({
    default: module.ReviewStatusPage,
  }))
)

const DashboardPage = React.lazy(() =>
  import("@/components/dashboard-page").then((module) => ({
    default: module.DashboardPage,
  }))
)
const OrdersPage = React.lazy(() =>
  import("@/components/orders-page").then((module) => ({
    default: module.OrdersPage,
  }))
)
const MenuPage = React.lazy(() =>
  import("@/components/menu-page").then((module) => ({
    default: module.MenuPage,
  }))
)
const CategoriesPage = React.lazy(() =>
  import("@/components/categories-page").then((module) => ({
    default: module.CategoriesPage,
  }))
)
const ReviewsPage = React.lazy(() =>
  import("@/components/reviews-page").then((module) => ({
    default: module.ReviewsPage,
  }))
)
const PromotionsPage = React.lazy(() =>
  import("@/components/promotions-page").then((module) => ({
    default: module.PromotionsPage,
  }))
)
const AnalyticsPage = React.lazy(() =>
  import("@/components/analytics-page").then((module) => ({
    default: module.AnalyticsPage,
  }))
)
const PayoutsPage = React.lazy(() =>
  import("@/components/payouts-page").then((module) => ({
    default: module.PayoutsPage,
  }))
)
const OpeningHoursPage = React.lazy(() =>
  import("@/components/opening-hours-page").then((module) => ({
    default: module.OpeningHoursPage,
  }))
)
const StoreSettingsPage = React.lazy(() =>
  import("@/components/store-settings-page").then((module) => ({
    default: module.StoreSettingsPage,
  }))
)
const OwnerAccountPage = React.lazy(() =>
  import("@/components/owner-account-page").then((module) => ({
    default: module.OwnerAccountPage,
  }))
)
const HelpCenterPage = React.lazy(() =>
  import("@/components/help-center-page").then((module) => ({
    default: module.HelpCenterPage,
  }))
)
const NotificationsPage = React.lazy(() =>
  import("@/components/notifications-page").then((module) => ({
    default: module.NotificationsPage,
  }))
)

function resolveOwnerFlowPath(
  ownerAccount: OwnerAccount,
  restaurantLifecycleStatus: RestaurantLifecycleStatus
) {
  if (!ownerAccount.isAuthenticated) return "/auth/signin"
  if (restaurantLifecycleStatus === "approved") return "/"
  if (
    restaurantLifecycleStatus === "submitted" ||
    restaurantLifecycleStatus === "under_review" ||
    restaurantLifecycleStatus === "rejected"
  ) {
    return "/review-status"
  }
  return "/onboarding"
}

function formatTitleCount(count: number) {
  return count > 99 ? "99+" : `${count}`
}

function pluralizeTitleItem(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural
}

function buildOwnerDocumentTitle(
  pageTitle: string,
  storeDisplayName: string,
  attentionCount = 0
) {
  const suffix = `${pageTitle} - ${storeDisplayName} - ${OWNER_DOCUMENT_TITLE}`
  return attentionCount > 0
    ? `(${formatTitleCount(attentionCount)}) ${suffix}`
    : suffix
}

function RouteFallback() {
  const location = useLocation()

  if (location.pathname.startsWith("/onboarding")) {
    return <OnboardingPageSkeleton />
  }

  return <DataPageSkeleton />
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <React.Suspense fallback={<RouteFallback />}>{children}</React.Suspense>
}

function PublicPageLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const authBootstrapped = useAppStore((state) => state.authBootstrapped)

  React.useEffect(() => {
    if (location.pathname.startsWith("/auth")) return
    if (!authBootstrapped) return
    const nextPath = `${location.pathname}${location.search}${location.hash}`
    sessionStorage.setItem("owner:lastPath", nextPath)
  }, [authBootstrapped, location.hash, location.pathname, location.search])

  return (
    <div className="min-h-screen bg-background">
      {children}
      <VerificationModalHost />
    </div>
  )
}

function RouteErrorBoundary() {
  const error = useRouteError()
  const message =
    error instanceof Error
      ? error.message
      : "Something went wrong while rendering this page."

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            The page hit an unexpected error. You can reload and continue
            working.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            {message}
          </div>
          <Button onClick={() => window.location.assign("/")}>
            Back to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const restaurantLifecycleStatus = useAppStore(
    (state) => state.restaurantLifecycleStatus
  )
  const pageTitle = routeTitleByPath[location.pathname] ?? "Dashboard"
  const { isOnline } = useRestaurantStatus()
  const storeName = useAppStore((state) => state.storeSettings.name)
  const orders = useAppStore((state) => state.orders)
  const notifications = useAppStore((state) => state.notifications)
  const { theme, setTheme } = useTheme()

  const resolvedIsDark = theme === "dark"
  const storeDisplayName = storeName.trim() || "Your store"
  const liveOrderCount = orders.filter((order) =>
    liveOrderStatuses.includes(order.currentStatus)
  ).length
  const unreadNotificationCount = notifications.filter(
    (notification) => !notification.read
  ).length
  const titleAttentionCount = liveOrderCount + unreadNotificationCount
  const hasRestoredRef = React.useRef(false)

  useOwnerSocketBridge()

  React.useEffect(() => {
    const isAuthRoute = location.pathname.startsWith("/auth")
    if (isAuthRoute) return

    const nextPath = `${location.pathname}${location.search}${location.hash}`
    sessionStorage.setItem("owner:lastPath", nextPath)
  }, [location.hash, location.pathname, location.search])

  React.useEffect(() => {
    if (hasRestoredRef.current) return
    hasRestoredRef.current = true

    if (!ownerAccount.isAuthenticated) return
    if (location.pathname !== "/") return

    const lastPath = sessionStorage.getItem("owner:lastPath")
    if (!lastPath || lastPath === "/") return

    const target = lastPath.split("?")[0]
    if (
      target.startsWith("/auth") ||
      target === "/privacy-policy" ||
      target === "/terms-and-conditions"
    ) {
      return
    }

    if (
      restaurantLifecycleStatus === "approved" ||
      restaurantLifecycleStatus === "submitted" ||
      restaurantLifecycleStatus === "under_review" ||
      restaurantLifecycleStatus === "rejected" ||
      restaurantLifecycleStatus === "onboarding_in_progress" ||
      restaurantLifecycleStatus === "phone_verified"
    ) {
      navigate(lastPath, { replace: true })
    }
  }, [
    location.pathname,
    navigate,
    ownerAccount.isAuthenticated,
    restaurantLifecycleStatus,
  ])

  React.useEffect(() => {
    let blinkTimer: number | undefined
    let showAlertTitle = true
    const baseTitle = buildOwnerDocumentTitle(
      pageTitle,
      storeDisplayName,
      titleAttentionCount
    )
    const alertTitle =
      liveOrderCount > 0
        ? `(${formatTitleCount(liveOrderCount)}) ${pluralizeTitleItem(
            liveOrderCount,
            "Live order",
            "Live orders"
          )} - ${OWNER_DOCUMENT_TITLE}`
        : unreadNotificationCount > 0
          ? `(${formatTitleCount(
              unreadNotificationCount
            )}) New ${pluralizeTitleItem(
              unreadNotificationCount,
              "notification",
              "notifications"
            )} - ${OWNER_DOCUMENT_TITLE}`
          : baseTitle

    function applyTitle() {
      if (document.hidden && titleAttentionCount > 0) {
        document.title = showAlertTitle ? alertTitle : baseTitle
        return
      }
      document.title = baseTitle
    }

    function syncTitleMode() {
      if (blinkTimer) {
        window.clearInterval(blinkTimer)
        blinkTimer = undefined
      }
      showAlertTitle = true
      applyTitle()
      if (document.hidden && titleAttentionCount > 0) {
        blinkTimer = window.setInterval(() => {
          showAlertTitle = !showAlertTitle
          applyTitle()
        }, 1200)
      }
    }

    syncTitleMode()
    document.addEventListener("visibilitychange", syncTitleMode)

    return () => {
      document.removeEventListener("visibilitychange", syncTitleMode)
      if (blinkTimer) window.clearInterval(blinkTimer)
    }
  }, [
    liveOrderCount,
    pageTitle,
    storeDisplayName,
    titleAttentionCount,
    unreadNotificationCount,
  ])

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <ImpersonationBanner />
          <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-background px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{pageTitle}</p>
                  <div
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold md:hidden ${
                      isOnline
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border border-slate-200 bg-slate-100 text-slate-700"
                    }`}
                  >
                    <span
                      className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                        isOnline ? "bg-emerald-500" : "bg-slate-400"
                      }`}
                    >
                      {isOnline ? (
                        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-70" />
                      ) : null}
                    </span>
                    {isOnline ? "Live" : "Offline"}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {storeDisplayName} Restaurant Owner Panel
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div
                className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold md:flex ${
                  isOnline
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border border-slate-200 bg-slate-100 text-slate-700"
                }`}
              >
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    isOnline ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                >
                  {isOnline ? (
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-70" />
                  ) : null}
                </span>
                <span className="font-medium">
                  {isOnline ? "Live" : "Offline"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full border transition hover:bg-muted"
                  onClick={() => setTheme(resolvedIsDark ? "light" : "dark")}
                  aria-label={
                    resolvedIsDark
                      ? "Switch to light mode"
                      : "Switch to dark mode"
                  }
                >
                  {resolvedIsDark ? (
                    <SunMedium className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </button>
                <NotificationsPopover />
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full border transition hover:bg-muted"
                  onClick={() => navigate("/account")}
                  aria-label="Open owner account"
                >
                  <User className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>
          <section className="flex-1 overflow-auto py-4">
            <Outlet />
          </section>
        </main>
      </div>
      <Toaster richColors closeButton position="top-right" />
      <OrderAttentionPanel />
      <NewOrderModal />
      <VerificationModalHost />
    </SidebarProvider>
  )
}

function SignInRoute() {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const restaurantLifecycleStatus = useAppStore(
    (state) => state.restaurantLifecycleStatus
  )
  const authBootstrapped = useAppStore((state) => state.authBootstrapped)

  if (!authBootstrapped) {
    return <div className="min-h-screen bg-background" />
  }

  if (ownerAccount.isAuthenticated) {
    return (
      <Navigate
        to={resolveOwnerFlowPath(ownerAccount, restaurantLifecycleStatus)}
        replace
      />
    )
  }

  return (
    <PublicPageLayout>
      <OwnerSignInPage />
    </PublicPageLayout>
  )
}

function VerificationRoute() {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const restaurantLifecycleStatus = useAppStore(
    (state) => state.restaurantLifecycleStatus
  )
  const authBootstrapped = useAppStore((state) => state.authBootstrapped)

  if (!authBootstrapped) {
    return <div className="min-h-screen bg-background" />
  }

  if (!ownerAccount.isAuthenticated) {
    return <Navigate to="/auth/signin" replace />
  }

  return (
    <Navigate
      to={resolveOwnerFlowPath(ownerAccount, restaurantLifecycleStatus)}
      replace
    />
  )
}

function ForgotPasswordRoute() {
  return (
    <PublicPageLayout>
      <ForgotPasswordPage />
    </PublicPageLayout>
  )
}

function ResetVerificationRoute() {
  const passwordResetState = useAppStore((state) => state.passwordResetState)

  if (!passwordResetState.identifier || !passwordResetState.channel) {
    return <Navigate to="/auth/forgot-password" replace />
  }

  if (passwordResetState.otpVerified) {
    return <Navigate to="/auth/reset-password" replace />
  }

  return (
    <PublicPageLayout>
      <ResetVerificationPage />
    </PublicPageLayout>
  )
}

function ResetPasswordRoute() {
  const passwordResetState = useAppStore((state) => state.passwordResetState)

  if (!passwordResetState.identifier || !passwordResetState.channel) {
    return <Navigate to="/auth/forgot-password" replace />
  }

  if (!passwordResetState.otpVerified) {
    return <Navigate to="/auth/reset-verify" replace />
  }

  return (
    <PublicPageLayout>
      <ResetPasswordPage />
    </PublicPageLayout>
  )
}

function OnboardingRoute() {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const restaurantLifecycleStatus = useAppStore(
    (state) => state.restaurantLifecycleStatus
  )
  const authBootstrapped = useAppStore((state) => state.authBootstrapped)

  if (!authBootstrapped) {
    return <div className="min-h-screen bg-background" />
  }

  if (!ownerAccount.isAuthenticated) {
    return <Navigate to="/auth/signin" replace />
  }

  if (
    restaurantLifecycleStatus === "submitted" ||
    restaurantLifecycleStatus === "under_review"
  ) {
    return <Navigate to="/review-status" replace />
  }

  if (restaurantLifecycleStatus === "approved") {
    return <Navigate to="/" replace />
  }

  return <OnboardingDataRoute />
}

function OnboardingDataRoute() {
  const setOwnerAccount = useAppStore((state) => state.setOwnerAccount)
  const setStoreSettings = useAppStore((state) => state.setStoreSettings)
  const setOpeningHours = useAppStore((state) => state.setOpeningHours)
  const setPayoutMethod = useAppStore((state) => state.setPayoutMethod)
  const setOnboardingState = useAppStore((state) => state.setOnboardingState)
  const setRestaurantLifecycleStatus = useAppStore(
    (state) => state.setRestaurantLifecycleStatus
  )

  const onboardingDraftQuery = useOnboardingDraftQuery(true)

  React.useEffect(() => {
    if (!onboardingDraftQuery.data) return

    const { draft, lifecycleStatus } = onboardingDraftQuery.data
    setRestaurantLifecycleStatus(lifecycleStatus)
    setOwnerAccount((current) => ({
      ...current,
      ownerName: draft.basicInfo?.fullName || current.ownerName,
      phone: draft.basicInfo?.phone || current.phone,
      email: draft.basicInfo?.email || current.email,
    }))
    setStoreSettings((current) => buildStoreSettingsFromDraft(draft, current))
    setOpeningHours((current) => buildOpeningHoursFromDraft(draft, current))
    setPayoutMethod((current) => ({
      ...current,
      type: draft.payoutSetup?.type ?? current.type,
      accountName: draft.payoutSetup?.accountName ?? current.accountName,
      accountNumber: draft.payoutSetup?.accountNumber ?? current.accountNumber,
      isVerified: draft.payoutSetup?.isVerified ?? current.isVerified,
    }))
    setOnboardingState((current) => buildOnboardingStateFromDraft(draft, current))
  }, [
    onboardingDraftQuery.data,
    setOnboardingState,
    setOpeningHours,
    setOwnerAccount,
    setPayoutMethod,
    setRestaurantLifecycleStatus,
    setStoreSettings,
  ])

  if (onboardingDraftQuery.isPending) {
    return (
      <PublicPageLayout>
        <OnboardingPageSkeleton />
      </PublicPageLayout>
    )
  }

  return (
    <PublicPageLayout>
      <OnboardingPage />
    </PublicPageLayout>
  )
}

function ReviewStatusRoute() {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const restaurantLifecycleStatus = useAppStore(
    (state) => state.restaurantLifecycleStatus
  )
  const authBootstrapped = useAppStore((state) => state.authBootstrapped)

  if (!authBootstrapped) {
    return (
      <PublicPageLayout>
        <DataPageSkeleton />
      </PublicPageLayout>
    )
  }

  if (!ownerAccount.isAuthenticated) {
    return <Navigate to="/auth/signin" replace />
  }

  if (
    restaurantLifecycleStatus === "account_created" ||
    restaurantLifecycleStatus === "phone_verified" ||
    restaurantLifecycleStatus === "onboarding_in_progress"
  ) {
    return <Navigate to="/onboarding" replace />
  }

  return <ReviewStatusDataRoute />
}

function ReviewStatusDataRoute() {
  const setStoreSettings = useAppStore((state) => state.setStoreSettings)
  const setOpeningHours = useAppStore((state) => state.setOpeningHours)
  const setPayoutMethod = useAppStore((state) => state.setPayoutMethod)
  const setOnboardingState = useAppStore((state) => state.setOnboardingState)
  const setRestaurantLifecycleStatus = useAppStore(
    (state) => state.setRestaurantLifecycleStatus
  )

  const reviewStatusQuery = useReviewStatusQuery(true)

  React.useEffect(() => {
    if (!reviewStatusQuery.data) return

    setRestaurantLifecycleStatus(reviewStatusQuery.data.restaurantLifecycleStatus)
    if (reviewStatusQuery.data.draft) {
      const draft = reviewStatusQuery.data.draft
      setStoreSettings((current) =>
        buildStoreSettingsFromDraft(draft, current)
      )
      setOpeningHours((current) =>
        buildOpeningHoursFromDraft(draft, current)
      )
      setPayoutMethod((current) =>
        buildPayoutMethodFromDraft(draft, current)
      )
    }
    setOnboardingState((current) =>
      buildOnboardingStateFromReviewStatus(reviewStatusQuery.data, current)
    )
  }, [
    reviewStatusQuery.data,
    setOnboardingState,
    setOpeningHours,
    setPayoutMethod,
    setRestaurantLifecycleStatus,
    setStoreSettings,
  ])

  if (reviewStatusQuery.isPending) {
    return (
      <PublicPageLayout>
        <ReviewStatusPageSkeleton />
      </PublicPageLayout>
    )
  }

  return (
    <PublicPageLayout>
      <ReviewStatusPage />
    </PublicPageLayout>
  )
}

function DashboardRoot() {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const restaurantLifecycleStatus = useAppStore(
    (state) => state.restaurantLifecycleStatus
  )
  const authBootstrapped = useAppStore((state) => state.authBootstrapped)

  if (!authBootstrapped) {
    return <div className="min-h-screen bg-background" />
  }

  if (restaurantLifecycleStatus !== "approved") {
    return (
      <Navigate
        to={resolveOwnerFlowPath(ownerAccount, restaurantLifecycleStatus)}
        replace
      />
    )
  }

  return (
    <RestaurantStatusProvider>
      <CategoriesProvider>
        <MenuItemsProvider>
          <NotificationsProvider>
            <PromotionsProvider>
              <ReviewsProvider>
                <PayoutsProvider>
                  <OpeningHoursProvider>
                    <OrdersProvider>
                      <AppLayout />
                    </OrdersProvider>
                  </OpeningHoursProvider>
                </PayoutsProvider>
              </ReviewsProvider>
            </PromotionsProvider>
          </NotificationsProvider>
        </MenuItemsProvider>
      </CategoriesProvider>
    </RestaurantStatusProvider>
  )
}

export const router = createBrowserRouter([
  {
    path: "/auth/signin",
    element: <SignInRoute />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/auth/signup",
    element: <Navigate to="/auth/signin" replace />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/auth/verify",
    element: <VerificationRoute />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/auth/forgot-password",
    element: <ForgotPasswordRoute />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/auth/reset-verify",
    element: <ResetVerificationRoute />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/auth/reset-password",
    element: <ResetPasswordRoute />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/terms-and-conditions",
    element: (
      <PublicPageLayout>
        <TermsAndConditionsPage />
      </PublicPageLayout>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/privacy-policy",
    element: (
      <PublicPageLayout>
        <PrivacyPolicyPage />
      </PublicPageLayout>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/impersonate",
    element: <ImpersonateRoute />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/onboarding",
    element: <OnboardingRoute />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/review-status",
    element: <ReviewStatusRoute />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/",
    element: <DashboardRoot />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: (
          <LazyPage>
            <DashboardPage />
          </LazyPage>
        ),
      },
      {
        path: "orders",
        element: (
          <LazyPage>
            <OrdersPage />
          </LazyPage>
        ),
      },
      {
        path: "menu",
        element: (
          <LazyPage>
            <MenuPage />
          </LazyPage>
        ),
      },
      {
        path: "categories",
        element: (
          <LazyPage>
            <CategoriesPage />
          </LazyPage>
        ),
      },
      {
        path: "reviews",
        element: (
          <LazyPage>
            <ReviewsPage />
          </LazyPage>
        ),
      },
      {
        path: "promotions",
        element: (
          <LazyPage>
            <PromotionsPage />
          </LazyPage>
        ),
      },
      {
        path: "analytics",
        element: (
          <LazyPage>
            <AnalyticsPage />
          </LazyPage>
        ),
      },
      {
        path: "payouts",
        element: (
          <LazyPage>
            <PayoutsPage />
          </LazyPage>
        ),
      },
      {
        path: "notifications",
        element: (
          <LazyPage>
            <NotificationsPage />
          </LazyPage>
        ),
      },
      {
        path: "hours",
        element: (
          <LazyPage>
            <OpeningHoursPage />
          </LazyPage>
        ),
      },
      {
        path: "settings",
        element: (
          <LazyPage>
            <StoreSettingsPage />
          </LazyPage>
        ),
      },
      {
        path: "account",
        element: (
          <LazyPage>
            <OwnerAccountPage />
          </LazyPage>
        ),
      },
      {
        path: "support",
        element: (
          <LazyPage>
            <HelpCenterPage />
          </LazyPage>
        ),
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ],
  },
])
