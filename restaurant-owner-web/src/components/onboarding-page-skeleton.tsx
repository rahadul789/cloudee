import { ShieldCheck } from "lucide-react"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function OnboardingPageSkeleton() {
  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-28 lg:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Card className="rounded-[30px] border-border/70 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Restaurant onboarding wizard
                </div>
                <Skeleton className="h-8 w-72" />
                <Skeleton className="h-4 w-96 max-w-full" />
              </div>
              <div className="min-w-60 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-2xl border bg-muted/20 p-4 space-y-2"
                >
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-36" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="rounded-[28px] shadow-sm">
            <CardHeader className="space-y-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-2xl border px-4 py-3"
                >
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-4 w-64 max-w-full" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-3xl border px-5 py-4">
                <Skeleton className="h-4 w-80 max-w-full" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-24 md:col-span-2" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-32 md:col-span-2" />
              </div>
              <div className="grid gap-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="rounded-3xl border p-5 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-28" />
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </div>
                    <div className="grid gap-2">
                      <Skeleton className="h-4 w-72 max-w-full" />
                      <Skeleton className="h-4 w-64 max-w-full" />
                      <Skeleton className="h-4 w-56 max-w-full" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <Skeleton className="h-56 rounded-3xl" />
                <Skeleton className="h-56 rounded-3xl" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
