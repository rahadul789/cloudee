import * as React from "react"

import {
  AlertTriangle,
  ArrowRight,
  CheckCheck,
  Clock3,
  FileWarning,
  MapPin,
  ShieldCheck,
  ShieldX,
  Store,
  Wallet,
} from "lucide-react"
import { useNavigate } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useReviewStatusQuery } from "@/hooks/use-owner-api"
import { useAppStore } from "@/store/app-store"
import type { OnboardingStepId, ReviewIssueSection } from "@/store/app-store"

const statusCopy = {
  submitted: {
    title: "Your store is under review",
    description:
      "Your application has been submitted successfully and is waiting to enter the admin review queue.",
    icon: Clock3,
    tone: "border-amber-200 bg-amber-50 text-amber-900",
  },
  under_review: {
    title: "Your store is under review",
    description:
      "Our admin team is checking your onboarding details. Dashboard access stays locked until approval.",
    icon: ShieldCheck,
    tone: "border-sky-200 bg-sky-50 text-sky-900",
  },
  approved: {
    title: "Your store is approved",
    description:
      "Everything looks good. You can now access the full dashboard and continue daily operations.",
    icon: CheckCheck,
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  rejected: {
    title: "Your application needs updates",
    description:
      "Admin found a few issues that need correction before approval. Review the notes below and resubmit.",
    icon: ShieldX,
    tone: "border-rose-200 bg-rose-50 text-rose-900",
  },
} as const

const sectionMeta: Record<
  ReviewIssueSection,
  { title: string; icon: typeof Store; routeStep: OnboardingStepId }
> = {
  basic_info: {
    title: "Basic Info",
    icon: Store,
    routeStep: "basic_info",
  },
  location: {
    title: "Location",
    icon: MapPin,
    routeStep: "location",
  },
  hours: {
    title: "Opening Hours",
    icon: Clock3,
    routeStep: "hours",
  },
  payout_setup: {
    title: "Payout Setup",
    icon: Wallet,
    routeStep: "payout_setup",
  },
}

export function ReviewStatusPage() {
  const navigate = useNavigate()
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const lifecycleStatus = useAppStore((state) => state.restaurantLifecycleStatus)
  const onboardingState = useAppStore((state) => state.onboardingState)
  const storeSettings = useAppStore((state) => state.storeSettings)
  const openingHours = useAppStore((state) => state.openingHours)
  const payoutMethod = useAppStore((state) => state.payoutMethod)
  const setOnboardingState = useAppStore((state) => state.setOnboardingState)
  const setRestaurantLifecycleStatus = useAppStore(
    (state) => state.setRestaurantLifecycleStatus
  )
  const reviewStatusQuery = useReviewStatusQuery(ownerAccount.isAuthenticated)

  React.useEffect(() => {
    if (!reviewStatusQuery.data) return

    setRestaurantLifecycleStatus(reviewStatusQuery.data.restaurantLifecycleStatus)
    setOnboardingState((current) => ({
      ...current,
      submittedAt: reviewStatusQuery.data.submittedAt,
      reviewNote: reviewStatusQuery.data.reviewNote,
      reviewIssues: reviewStatusQuery.data.reviewIssues,
      resubmissionCount: reviewStatusQuery.data.resubmissionCount,
    }))
  }, [reviewStatusQuery.data, setOnboardingState, setRestaurantLifecycleStatus])

  const safeStatus =
    lifecycleStatus === "submitted" ||
    lifecycleStatus === "under_review" ||
    lifecycleStatus === "approved" ||
    lifecycleStatus === "rejected"
      ? lifecycleStatus
      : "submitted"

  const content = statusCopy[safeStatus]
  const StatusIcon = content.icon
  const openDays = openingHours.weeklySchedule.filter((day) => day.isOpen).length

  const summaryItems = [
    {
      title: "Basic Info",
      description: storeSettings.name || "No restaurant name",
      detail: `${storeSettings.cuisineType || "Cuisine missing"} • ${storeSettings.tags.length} tags • ${storeSettings.orderSettings.preparationTimeMinutes} min prep`,
    },
    {
      title: "Location",
      description: storeSettings.address || "Address not added yet",
      detail: `${storeSettings.location.city} • ${storeSettings.location.latitude ?? "--"}, ${storeSettings.location.longitude ?? "--"}`,
    },
    {
      title: "Opening Hours",
      description: `${openDays}/7 days open`,
      detail: "Weekly schedule submitted",
    },
    {
      title: "Payout",
      description: onboardingState.skippedSteps.includes("payout_setup")
        ? "Skipped for now"
        : payoutMethod.accountName.trim()
          ? payoutMethod.type === "bkash"
            ? "bKash"
            : "Bank account"
          : "Details not completed yet",
      detail:
        onboardingState.skippedSteps.includes("payout_setup")
          ? "Can be completed later"
          : payoutMethod.accountName || "Account holder missing",
    },
  ]

  function goToRejectedSection(section: ReviewIssueSection) {
    setOnboardingState((current) => ({
      ...current,
      currentStep: sectionMeta[section].routeStep,
    }))
    navigate("/onboarding")
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 lg:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className={`rounded-2xl border px-5 py-4 ${content.tone}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-current/10 bg-white/50 px-3 py-1 text-xs font-medium">
                <StatusIcon className="h-3.5 w-3.5" />
                Review Status
              </div>
              <h1 className="text-2xl font-semibold">{content.title}</h1>
              <p className="text-sm opacity-90">{content.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-current/10 bg-white/60 px-4 py-3">
                <p className="text-xs uppercase tracking-wide opacity-70">
                  Submitted
                </p>
                <p className="mt-1 text-sm font-medium">
                  {onboardingState.submittedAt
                    ? new Date(onboardingState.submittedAt).toLocaleString()
                    : "Not submitted yet"}
                </p>
              </div>
              <div className="rounded-2xl border border-current/10 bg-white/60 px-4 py-3">
                <p className="text-xs uppercase tracking-wide opacity-70">
                  Estimated review
                </p>
                <p className="mt-1 text-sm font-medium">
                  Within {reviewStatusQuery.data?.estimatedReviewTimeHours ?? 24}{" "}
                  hours
                </p>
              </div>
              <div className="rounded-2xl border border-current/10 bg-white/60 px-4 py-3">
                <p className="text-xs uppercase tracking-wide opacity-70">
                  Resubmissions
                </p>
                <p className="mt-1 text-sm font-medium">
                  {onboardingState.resubmissionCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Card className="rounded-[28px] shadow-sm">
              <CardHeader>
                <CardTitle>Submitted summary</CardTitle>
                <CardDescription>
                  This is the same information the admin team is reviewing right
                  now.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {summaryItems.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border bg-muted/10 p-4"
                  >
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {safeStatus === "rejected" ? (
              <Card className="rounded-[28px] border-rose-200 bg-rose-50/70 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileWarning className="h-4 w-4 text-rose-600" />
                    Rejected sections
                  </CardTitle>
                  <CardDescription>
                    Fix the highlighted sections below and then resubmit the
                    application.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {onboardingState.reviewIssues.map((issue) => {
                    const meta = sectionMeta[issue.section]
                    const Icon = meta.icon

                    return (
                      <div
                        key={issue.section}
                        className="rounded-2xl border border-rose-200 bg-background/80 p-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl border bg-rose-50 text-rose-700">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium">{issue.title}</p>
                                <p className="text-sm text-muted-foreground">
                                  {meta.title}
                                </p>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {issue.note}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {issue.fields.map((field) => (
                                <Badge
                                  key={field}
                                  variant="outline"
                                  className="border-rose-200 bg-rose-50 text-rose-700"
                                >
                                  {field}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => goToRejectedSection(issue.section)}
                          >
                            Edit Section
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-6">
            <Card className="rounded-[28px] shadow-sm">
              <CardHeader>
                <CardTitle>Next action</CardTitle>
                <CardDescription>
                  Follow the action below based on the current review state.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {safeStatus === "approved" ? (
                  <>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      Your store is approved and dashboard access is fully
                      unlocked.
                    </div>
                    <Button className="w-full" onClick={() => navigate("/")}>
                      Go to Dashboard
                    </Button>
                  </>
                ) : safeStatus === "rejected" ? (
                  <>
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                      Update the highlighted sections, then use the onboarding
                      review step to resubmit your application.
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => navigate("/onboarding")}
                    >
                      Edit & Resubmit
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        goToRejectedSection(
                          onboardingState.reviewIssues[0]?.section ?? "basic_info"
                        )
                      }
                    >
                      Edit First Rejected Section
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                      Your store is being reviewed. Editing stays paused so the
                      admin team sees a stable application snapshot.
                    </div>
                    <Button variant="outline" className="w-full" disabled>
                      Editing locked during review
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {safeStatus === "rejected" && onboardingState.reviewNote ? (
              <Card className="rounded-[28px] border-amber-200 bg-amber-50/70 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Admin note
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-amber-900">
                    {onboardingState.reviewNote}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <Card className="rounded-[28px] shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">How review works</CardTitle>
                <CardDescription>
                  Review status is managed by admin only. This owner dashboard
                  stays read-only while approval is pending.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                  Admin reviews the submitted snapshot, then updates the
                  application to
                  <span className="mx-1 font-medium text-foreground">
                    Approved
                  </span>
                  or
                  <span className="mx-1 font-medium text-foreground">
                    Rejected
                  </span>
                  . If anything is rejected, the exact sections and notes will
                  appear here for resubmission.
                </div>
                <div className="grid gap-3">
                  <div className="flex items-center gap-2 rounded-2xl border bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                    <Clock3 className="h-4 w-4 text-amber-600" />
                    Dashboard stays locked until approval.
                  </div>
                  <div className="rounded-2xl border bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                    Editing is allowed again only if admin sends the application
                    back with rejected sections.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
