import { Building2, Database, LockKeyhole, ShieldCheck } from "lucide-react"
import { Link } from "react-router-dom"

import { usePublicPlatformContentQuery } from "@/hooks/use-owner-api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

export function PrivacyPolicyPage() {
  const platformContentQuery = usePublicPlatformContentQuery(true)
  const branding = platformContentQuery.data?.branding
  const privacyPolicy = platformContentQuery.data?.legal.privacyPolicy

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.08),_transparent_34%),linear-gradient(to_bottom,_hsl(var(--background)),_hsl(var(--muted)/0.2))] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px] overflow-hidden rounded-[32px] border bg-background/95 shadow-[0_30px_90px_-40px_hsl(var(--foreground)/0.35)] backdrop-blur">
        <div className="grid gap-0 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="border-b bg-muted/20 p-6 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0 lg:p-8">
            <div className="space-y-6">
              <Link
                to="/auth/signin"
                className="inline-flex items-center gap-3"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-semibold">
                    {branding?.platformName ?? "Foodbela"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {branding?.tagline ?? "Eat & Smile"}
                  </p>
                </div>
              </Link>

              <div className="space-y-3">
                <Badge
                  variant="secondary"
                  className="rounded-full border bg-background/70 px-3 py-1 text-xs font-medium shadow-sm"
                >
                  {privacyPolicy?.label ?? "Privacy & Data"}
                </Badge>
                <h1 className="text-3xl font-semibold tracking-tight">
                  {privacyPolicy?.title ?? "Privacy Policy"}
                </h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  {privacyPolicy?.description ??
                    "Learn how Foodbela handles owner, business, and operational data across onboarding and dashboard usage."}
                </p>
              </div>

              <Card className="rounded-2xl border-border/70 bg-background/80 shadow-none">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">Last updated</p>
                      <p className="text-sm text-muted-foreground">
                        {privacyPolicy?.lastUpdated ?? "12 April 2026"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <nav className="space-y-2">
                {(privacyPolicy?.sections ?? []).map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="block rounded-2xl border border-transparent px-4 py-3 text-sm text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground"
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <main className="p-6 sm:p-8 lg:p-10">
            <div className="max-w-4xl space-y-8">
              <div className="rounded-3xl border bg-muted/15 p-6">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Database className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">Data handling overview</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {privacyPolicy?.overviewDescription ??
                        "We aim to collect only the information needed to operate the platform, support restaurants, process orders, and maintain compliance and service reliability."}
                    </p>
                  </div>
                </div>
              </div>

              {platformContentQuery.isPending ? (
                <div className="rounded-3xl border border-border/70 bg-card/70 p-6 text-sm text-muted-foreground shadow-sm">
                  Loading privacy policy...
                </div>
              ) : null}

              {platformContentQuery.isError ? (
                <div className="rounded-3xl border border-destructive/30 bg-card/70 p-6 text-sm text-muted-foreground shadow-sm">
                  Privacy policy could not be loaded right now.
                </div>
              ) : null}

              {(privacyPolicy?.sections ?? []).map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-20 space-y-4 rounded-3xl border border-border/70 bg-card/70 p-6 shadow-sm"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-primary">
                      Section {index + 1}
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {section.title}
                    </h2>
                  </div>

                  <div className="space-y-4 text-sm leading-7 text-muted-foreground">
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}

              <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-6">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <LockKeyhole className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-emerald-900">
                      {privacyPolicy?.trustTitle ?? "Trust and protection"}
                    </p>
                    <p className="text-sm leading-6 text-emerald-800/80">
                      {privacyPolicy?.trustDescription ??
                        "If you need privacy-related clarification, support can guide you through access, update, or deletion requests where applicable."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
