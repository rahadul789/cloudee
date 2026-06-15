import * as React from "react"
import {
  BadgeCheck,
  Building2,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type AuthShellProps = {
  title: string
  description: string
  footer?: React.ReactNode
  children: React.ReactNode
}

const authHighlights = [
  {
    title: "Trusted onboarding",
    description: "Phone verification and admin review keep every store vetted.",
    icon: ShieldCheck,
  },
  {
    title: "Fast setup",
    description:
      "Store info, hours, menu, and payouts move in one guided flow.",
    icon: Sparkles,
  },
  {
    title: "Operations ready",
    description: "The dashboard unlocks only when the restaurant is approved.",
    icon: BadgeCheck,
  },
]

export function AuthShell({
  title,
  description,
  footer,
  children,
}: AuthShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.08),_transparent_34%),linear-gradient(to_bottom,_hsl(var(--background)),_hsl(var(--muted)/0.2))] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-[1480px] overflow-hidden rounded-[32px] border bg-background/95 shadow-[0_30px_90px_-40px_hsl(var(--foreground)/0.35)] backdrop-blur lg:grid-cols-[1fr_1fr]">
        <div className="relative hidden overflow-hidden border-r bg-[linear-gradient(160deg,_hsl(var(--primary)/0.08),_transparent_42%),linear-gradient(180deg,_hsl(var(--muted)/0.45),_hsl(var(--background)))] p-10 lg:flex lg:flex-col">
          <div className="absolute top-16 left-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute right-10 bottom-12 h-52 w-52 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-semibold">Foodbela</p>
              <p className="text-sm text-muted-foreground">Eat & Smile</p>
            </div>
          </div>

          <div className="relative z-10 mt-16 max-w-lg space-y-6">
            <Badge
              variant="secondary"
              className="rounded-full border bg-background/70 px-3 py-1 text-xs font-medium shadow-sm"
            >
              Restaurant owner platform
            </Badge>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight">
                Run operations, payouts, menu, and approvals from one place.
              </h1>
              <p className="max-w-md text-base leading-7 text-muted-foreground">
                Designed for restaurant owners who need a fast, trustworthy, and
                clean control panel from onboarding to live orders.
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-auto grid gap-4">
            {authHighlights.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/50 bg-background/75 p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex min-h-full flex-col justify-center p-4 sm:p-8 lg:p-12">
          <div className="mb-8 lg:hidden">
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-semibold">Foodbela</p>
                <p className="text-sm text-muted-foreground">Eat & Smile</p>
              </div>
            </Link>
          </div>

          <div className="mx-auto w-full max-w-xl">
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>

            <div className="mt-8 rounded-[28px] border bg-card/85 p-5 shadow-sm sm:p-7">
              {children}
            </div>

            {footer ? (
              <div className="mt-6 text-center text-sm">{footer}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export function AuthFieldMessage({
  error,
  hint,
  className,
}: {
  error?: string
  hint?: string
  className?: string
}) {
  if (!error && !hint) return null

  return (
    <p
      className={cn(
        "text-xs leading-5",
        error ? "text-destructive" : "text-muted-foreground",
        className
      )}
    >
      {error ?? hint}
    </p>
  )
}
