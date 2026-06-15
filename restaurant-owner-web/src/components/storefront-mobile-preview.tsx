import * as React from "react"
import {
  ChevronLeft,
  Clock3,
  Flame,
  Heart,
  Info,
  Percent,
  Plus,
  Star,
  Truck,
} from "lucide-react"

import type { StoreSettings } from "@/components/store-settings/types"
import type { Voucher } from "@/components/promotions/types"
import type { MenuItem } from "@/components/menu/types"
import { Badge } from "@/components/ui/badge"
import { getStoreCoverSrc, getStoreLogoSrc } from "@/lib/store-profile"
import { cn } from "@/lib/utils"

function formatVoucherLabel(voucher: Voucher) {
  if (voucher.mode === "coupon" && voucher.code.trim()) return voucher.code
  if (voucher.type === "free-delivery") return "Free delivery"
  if (
    (voucher.type === "percentage" || voucher.type === "threshold-discount") &&
    typeof voucher.discountValue === "number"
  ) {
    return `${voucher.discountValue}% off`
  }
  if (typeof voucher.discountValue === "number") {
    return `Tk ${voucher.discountValue} off`
  }
  return voucher.name
}

function factItems(settings: StoreSettings, activeOfferCount: number) {
  const prepMinutes =
    settings.orderSettings.preparationTimeMinutes > 0
      ? `${settings.orderSettings.preparationTimeMinutes} min`
      : "20 min"

  return [
    {
      key: "rating",
      icon: Star,
      label: "Rating",
      value: "4.8",
    },
    {
      key: "prep",
      icon: Clock3,
      label: "Prep",
      value: prepMinutes,
    },
    {
      key: "delivery",
      icon: Truck,
      label: "Delivery",
      value: "Nearby",
    },
    {
      key: "offers",
      icon: Percent,
      label: "Offers",
      value: activeOfferCount ? `${activeOfferCount} live` : "None",
    },
  ]
}

export function StorefrontMobilePreview({
  settings,
  isOnline,
  vouchers,
  menuItems,
  className,
}: {
  settings: StoreSettings
  isOnline: boolean
  vouchers?: Voucher[]
  menuItems?: MenuItem[]
  className?: string
}) {
  const activeOffers = React.useMemo(
    () =>
      (vouchers ?? [])
        .filter((voucher) => voucher.status === "Active")
        .slice()
        .sort((left, right) => right.priority - left.priority)
        .slice(0, 4),
    [vouchers]
  )
  const primaryOffer = activeOffers[0]
  const facts = factItems(settings, activeOffers.length)
  const tags = settings.tags.length
    ? settings.tags.slice(0, 4)
    : [settings.cuisineType || "Restaurant", "Fresh", "Popular"].filter(Boolean)
  const popularItems = React.useMemo(
    () =>
      (menuItems ?? [])
        .filter((item) => item.status === "Active" && item.isPopular)
        .slice(0, 2),
    [menuItems]
  )
  const previewItems = popularItems.length
    ? popularItems
    : (menuItems ?? []).filter((item) => item.status === "Active").slice(0, 2)

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[375px] rounded-[38px] border-[7px] border-slate-950 bg-slate-950 p-1.5 shadow-2xl",
        className
      )}
    >
      <div className="min-h-[640px] overflow-hidden rounded-[31px] bg-[#f8fafc] pb-5">
        <div className="relative mx-4 mt-3 h-[188px] overflow-hidden rounded-[34px] bg-muted">
          <img
            src={getStoreCoverSrc(settings.coverImageUrl)}
            alt={settings.name || "Restaurant cover"}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-slate-950/20" />
          <div className="absolute top-3 right-3 left-3 flex items-center justify-between">
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full bg-white/92 text-slate-900 shadow-sm"
              aria-label="Preview back"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-full bg-white/92 text-slate-900 shadow-sm"
                aria-label="Preview favorite"
              >
                <Heart className="size-4" />
              </button>
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-full bg-white/92 text-slate-900 shadow-sm"
                aria-label="Preview info"
              >
                <Info className="size-4" />
              </button>
            </div>
          </div>
          <div className="absolute right-3 bottom-3 left-3 flex items-center justify-between gap-2">
            <span
              className={cn(
                "rounded-full px-3 py-2 text-xs font-bold shadow-sm",
                isOnline
                  ? "bg-white/95 text-slate-950"
                  : "bg-amber-500/95 text-white"
              )}
            >
              {isOnline ? "Open now" : "Closed now"}
            </span>
            {primaryOffer ? (
              <span className="truncate rounded-full bg-[#ff6392]/90 px-3 py-2 text-xs font-bold text-white shadow-sm">
                {formatVoucherLabel(primaryOffer)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mx-4 -mt-5 rounded-[30px] bg-white px-4 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.12)]">
          <div className="flex items-center gap-3">
            <img
              src={getStoreLogoSrc(settings.logoUrl)}
              alt={settings.name || "Restaurant logo"}
              className="size-[52px] rounded-2xl bg-muted object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[22px] font-extrabold leading-7 text-slate-950">
                {settings.name || "Your Restaurant"}
              </div>
              {activeOffers.length ? (
                <div className="mt-1 flex gap-2 overflow-hidden">
                  {activeOffers.map((offer) => (
                    <span
                      key={offer.id}
                      className="inline-flex max-w-[150px] shrink-0 items-center gap-1 rounded-full bg-[#FFEAF1] px-2.5 py-1.5 text-[11px] font-bold text-[#ff3f7f]"
                    >
                      {offer.mode === "auto" ? (
                        <Flame className="size-3" />
                      ) : (
                        <Percent className="size-3" />
                      )}
                      <span className="truncate">{formatVoucherLabel(offer)}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-1 truncate text-xs font-medium text-muted-foreground">
                  {settings.cuisineType || "Restaurant"}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {facts.map((fact) => (
              <div
                key={fact.key}
                className="flex min-h-14 items-center gap-2 rounded-[18px] bg-slate-100 px-3 py-2"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-[#FFEAF3] text-[#ff3f7f]">
                  <fact.icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium text-slate-500">
                    {fact.label}
                  </span>
                  <span className="block truncate text-sm font-extrabold text-slate-950">
                    {fact.value}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-5 mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-base font-extrabold text-slate-950">Menu</div>
            <div className="text-xs font-bold text-[#ff3f7f]">View all</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge
                key={tag}
                className="rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm hover:bg-white"
              >
                {tag}
              </Badge>
            ))}
          </div>
          {previewItems.length ? (
            <div className="space-y-3">
              {previewItems.map((item) => {
                const price = item.variants.length
                  ? Math.min(...item.variants.map((variant) => variant.price))
                  : item.basePrice ?? 0
                return (
                  <div
                    key={item.id}
                    className="rounded-[24px] bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.10)]"
                  >
                    <div className="flex gap-3">
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="size-[86px] shrink-0 rounded-[18px] bg-[#FFF3E9] object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-extrabold text-slate-950">
                              {item.name}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
                              {item.description || "Freshly prepared and ready to add."}
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label="Preview add item"
                            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#ff6392] text-white shadow-sm"
                          >
                            <Plus className="size-4" />
                          </button>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="rounded-full bg-[#FFF0F6] px-2.5 py-1 text-[10px] font-extrabold text-[#ff3f7f]">
                            {item.isPopular ? "Popular" : "Menu item"}
                          </span>
                          <span className="text-sm font-extrabold text-[#ff6392]">
                            {item.variants.length ? "Starts " : ""}Tk {Math.round(price).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed bg-white p-5 text-center text-xs font-semibold text-slate-500">
              Popular menu items will preview here after you add active items.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
