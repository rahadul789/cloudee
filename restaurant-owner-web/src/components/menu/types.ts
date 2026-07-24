export type MenuItemStatus = "Active" | "Hidden"

export type MenuItemKind =
  | "simple"
  | "variants-only"
  | "addons-only"
  | "variants-addons"

export type AddOnSelectionType = "single" | "multiple"

export type MenuVariant = {
  id: string
  name: string
  price: number
  isDefault?: boolean
}

export type AddOnOption = {
  id: string
  name: string
  price: number
  isDefault?: boolean
}

export type AddOnGroup = {
  id: string
  name: string
  selectionType: AddOnSelectionType
  required: boolean
  options: AddOnOption[]
}

export type MenuItem = {
  id: string
  name: string
  slug: string
  imageUrl: string
  isPopular: boolean
  categoryId: string
  categoryName: string
  description: string
  status: MenuItemStatus
  kind: MenuItemKind
  basePrice: number | null
  variants: MenuVariant[]
  addOnGroups: AddOnGroup[]
  recommendedItemIds?: string[]
  approval?: {
    id: string
    type: "new_item" | "price_update"
    status: "pending" | "approved" | "rejected" | "cancelled" | "superseded"
    menuItemId: string | null
    proposedName: string
    currentName: string
    priceDiffCount: number
    ownerReason?: string
  } | null
  updatedAt: string
}

export type MenuItemFormVariant = {
  id: string
  name: string
  price: string
  isDefault?: boolean
}

export type MenuItemFormAddOnOption = {
  id: string
  name: string
  price: string
  isDefault?: boolean
}

export type MenuItemFormAddOnGroup = {
  id: string
  name: string
  selectionType: AddOnSelectionType
  required: boolean
  options: MenuItemFormAddOnOption[]
}

export type MenuItemFormState = {
  name: string
  slug: string
  imageUrl: string
  isPopular: boolean
  categoryId: string
  description: string
  status: MenuItemStatus
  hasVariants: boolean
  hasAddOns: boolean
  basePrice: string
  variants: MenuItemFormVariant[]
  addOnGroups: MenuItemFormAddOnGroup[]
  recommendedItemIds: string[]
}

export const menuCategories = [
  { id: "cat-01", name: "Burgers" },
  { id: "cat-02", name: "Pizza" },
  { id: "cat-03", name: "Drinks" },
  { id: "cat-04", name: "Desserts" },
  { id: "cat-05", name: "Combos" },
] as const

export const initialMenuItems: MenuItem[] = [
  {
    id: "item-01",
    name: "Classic Chicken Burger",
    slug: "classic-chicken-burger",
    imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=160&q=80",
    isPopular: true,
    categoryId: "cat-01",
    categoryName: "Burgers",
    description: "Crispy fried chicken with lettuce and mayo.",
    status: "Active",
    kind: "simple",
    basePrice: 220,
    variants: [],
    addOnGroups: [],
    recommendedItemIds: [],
    updatedAt: "2026-04-10T09:30:00.000Z",
  },
  {
    id: "item-02",
    name: "Beef Burger",
    slug: "beef-burger",
    imageUrl: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=160&q=80",
    isPopular: true,
    categoryId: "cat-01",
    categoryName: "Burgers",
    description: "Juicy beef patty with signature sauce.",
    status: "Active",
    kind: "variants-only",
    basePrice: null,
    variants: [
      { id: "var-01", name: "Small", price: 250, isDefault: true },
      { id: "var-02", name: "Medium", price: 320 },
      { id: "var-03", name: "Large", price: 390 },
    ],
    addOnGroups: [],
    recommendedItemIds: [],
    updatedAt: "2026-04-09T15:10:00.000Z",
  },
  {
    id: "item-03",
    name: "French Fries",
    slug: "french-fries",
    imageUrl: "https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=160&q=80",
    isPopular: false,
    categoryId: "cat-05",
    categoryName: "Combos",
    description: "Crispy fries served hot and salted.",
    status: "Hidden",
    kind: "addons-only",
    basePrice: 140,
    variants: [],
    addOnGroups: [
      {
        id: "group-01",
        name: "Extras",
        selectionType: "multiple",
        required: false,
        options: [
          { id: "opt-01", name: "Extra Cheese", price: 40 },
          { id: "opt-02", name: "Peri Mayo", price: 25 },
        ],
      },
    ],
    recommendedItemIds: [],
    updatedAt: "2026-04-08T11:45:00.000Z",
  },
  {
    id: "item-04",
    name: "Zinger Combo",
    slug: "zinger-combo",
    imageUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=160&q=80",
    isPopular: true,
    categoryId: "cat-05",
    categoryName: "Combos",
    description: "Burger combo with fries and drink choices.",
    status: "Hidden",
    kind: "variants-addons",
    basePrice: null,
    variants: [
      { id: "var-04", name: "Regular", price: 390, isDefault: true },
      { id: "var-05", name: "Large", price: 460 },
    ],
    addOnGroups: [
      {
        id: "group-02",
        name: "Drinks",
        selectionType: "single",
        required: true,
        options: [
          { id: "opt-03", name: "Coke", price: 0, isDefault: true },
          { id: "opt-04", name: "Sprite", price: 0 },
          { id: "opt-05", name: "Orange Juice", price: 30 },
        ],
      },
      {
        id: "group-03",
        name: "Extras",
        selectionType: "multiple",
        required: false,
        options: [
          { id: "opt-06", name: "Extra Patty", price: 80 },
          { id: "opt-07", name: "Cheese Slice", price: 30 },
        ],
      },
    ],
    recommendedItemIds: [],
    updatedAt: "2026-04-10T08:20:00.000Z",
  },
]

export function getMenuItemKindLabel(kind: MenuItemKind) {
  switch (kind) {
    case "simple":
      return "Simple"
    case "variants-only":
      return "Variants"
    case "addons-only":
      return "Add-ons"
    default:
      return "Variants + Add-ons"
  }
}

export function getMenuDisplayPrice(item: MenuItem) {
  if (item.variants.length > 0) {
    const prices = item.variants.map((variant) => variant.price)
    return `${Math.round(Math.min(...prices)).toLocaleString()}tk - ${Math.round(Math.max(...prices)).toLocaleString()}tk`
  }

  return item.basePrice
    ? `${Math.round(item.basePrice).toLocaleString()}tk`
    : "Set in variants"
}

export function getInitialMenuItemFormState(): MenuItemFormState {
  return {
    name: "",
    slug: "",
    imageUrl: "",
    isPopular: false,
    categoryId: "",
    description: "",
    status: "Active",
    hasVariants: false,
    hasAddOns: false,
    basePrice: "",
    variants: [],
    addOnGroups: [],
    recommendedItemIds: [],
  }
}

export function createMenuItemSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
