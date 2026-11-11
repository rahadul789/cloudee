import * as React from "react"
import { ExternalLink } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  APP_LINK_KINDS,
  APP_ROUTE_SUGGESTIONS,
  buildAppLink,
  normalizeWebsiteLink,
  parseAppLink,
  type LinkKind,
} from "@/lib/app-link"

// Pick WHERE a customer-app button/link goes — no typing of app routes needed.
// "Other app screen" offers every known screen as you type; "Outside website" takes any URL.
export function AppLinkPicker({
  value,
  onChange,
  restaurants,
}: {
  value?: string | null
  onChange: (path: string) => void
  restaurants: Array<{ id: string; name: string }>
}) {
  const parsed = parseAppLink(value)
  const kindInfo = APP_LINK_KINDS.find((k) => k.value === parsed.kind)
  const listId = React.useId()
  const websiteValue = parsed.kind === "website" ? (value ?? "") : ""
  const websiteNormalized = normalizeWebsiteLink(websiteValue)
  const websiteInvalid = parsed.kind === "website" && websiteValue.length > 8 && !websiteNormalized

  return (
    <div className="space-y-2">
      <Select
        value={parsed.kind}
        onValueChange={(next) =>
          onChange(
            buildAppLink(next as LinkKind, {
              restaurantId: parsed.restaurantId || restaurants[0]?.id,
              query: parsed.query,
              custom: next === "custom" ? "" : undefined,
            })
          )
        }
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {APP_LINK_KINDS.map((kind) => (
            <SelectItem key={kind.value} value={kind.value}>
              {kind.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {parsed.kind === "restaurant" ? (
        <Select
          value={parsed.restaurantId || undefined}
          onValueChange={(restaurantId) => onChange(buildAppLink("restaurant", { restaurantId }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a restaurant" />
          </SelectTrigger>
          <SelectContent>
            {restaurants.map((restaurant) => (
              <SelectItem key={restaurant.id} value={restaurant.id}>
                {restaurant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {parsed.kind === "search" ? (
        <Input
          value={parsed.query}
          onChange={(event) => onChange(buildAppLink("search", { query: event.target.value }))}
          placeholder="Keyword, e.g. biryani (optional)"
        />
      ) : null}

      {parsed.kind === "website" ? (
        <div className="space-y-1">
          <Input
            value={websiteValue}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => {
              if (websiteNormalized && websiteNormalized !== websiteValue) onChange(websiteNormalized)
            }}
            placeholder="https://facebook.com/foodbela"
            aria-invalid={websiteInvalid}
          />
          {websiteInvalid ? (
            <p className="text-xs text-destructive">This doesn't look like a website link.</p>
          ) : websiteNormalized ? (
            <a
              href={websiteNormalized}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium underline"
            >
              Test link <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
      ) : null}

      {parsed.kind === "custom" ? (
        <>
          <Input
            list={listId}
            value={value ?? ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Start typing — e.g. help, referrals, notifications"
          />
          <datalist id={listId}>
            {APP_ROUTE_SUGGESTIONS.map((route) => (
              <option key={route.path} value={route.path}>
                {route.label}
              </option>
            ))}
          </datalist>
        </>
      ) : null}

      <p className="text-xs text-muted-foreground">{kindInfo?.helper}</p>
    </div>
  )
}
