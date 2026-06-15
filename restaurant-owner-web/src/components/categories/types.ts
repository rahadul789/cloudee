export type CategoryStatus = "Active" | "Hidden"

export type Category = {
  id: string
  name: string
  slug: string
  totalItems: number
  displayOrder: number
  status: CategoryStatus
  description?: string
  createdAt: string
  updatedAt: string
}

export type CategoryFormState = {
  name: string
  slug: string
  status: CategoryStatus
  description: string
}

export type CategoryFormErrors = Partial<
  Record<keyof CategoryFormState, string>
>

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function createSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function getInitialFormState(): CategoryFormState {
  return {
    name: "",
    slug: "",
    status: "Active",
    description: "",
  }
}

export const initialCategories: Category[] = [
  {
    id: "cat-01",
    name: "Burgers",
    slug: "burgers",
    totalItems: 12,
    displayOrder: 1,
    status: "Active",
    description: "Main burger category",
    createdAt: "2026-01-12T10:20:00.000Z",
    updatedAt: "2026-04-08T16:30:00.000Z",
  },
  {
    id: "cat-02",
    name: "Pizza",
    slug: "pizza",
    totalItems: 9,
    displayOrder: 2,
    status: "Active",
    description: "Classic and signature pizzas",
    createdAt: "2026-01-15T11:10:00.000Z",
    updatedAt: "2026-04-09T12:05:00.000Z",
  },
  {
    id: "cat-03",
    name: "Fried Chicken",
    slug: "fried-chicken",
    totalItems: 8,
    displayOrder: 3,
    status: "Active",
    description: "Crispy chicken meals",
    createdAt: "2026-01-17T09:15:00.000Z",
    updatedAt: "2026-04-10T07:10:00.000Z",
  },
  {
    id: "cat-04",
    name: "Combos",
    slug: "combos",
    totalItems: 6,
    displayOrder: 4,
    status: "Hidden",
    description: "Limited promotional combos",
    createdAt: "2026-01-24T13:30:00.000Z",
    updatedAt: "2026-04-04T17:20:00.000Z",
  },
  {
    id: "cat-05",
    name: "Rice Bowls",
    slug: "rice-bowls",
    totalItems: 7,
    displayOrder: 5,
    status: "Active",
    description: "Fast lunch bowls",
    createdAt: "2026-02-01T10:40:00.000Z",
    updatedAt: "2026-04-06T10:10:00.000Z",
  },
  {
    id: "cat-06",
    name: "Set Menu",
    slug: "set-menu",
    totalItems: 5,
    displayOrder: 6,
    status: "Hidden",
    description: "Upcoming meal sets",
    createdAt: "2026-02-08T09:55:00.000Z",
    updatedAt: "2026-04-02T14:18:00.000Z",
  },
  {
    id: "cat-07",
    name: "Appetizers",
    slug: "appetizers",
    totalItems: 11,
    displayOrder: 7,
    status: "Active",
    description: "Snacks and starters",
    createdAt: "2026-02-11T11:45:00.000Z",
    updatedAt: "2026-04-09T19:12:00.000Z",
  },
  {
    id: "cat-08",
    name: "Pasta",
    slug: "pasta",
    totalItems: 4,
    displayOrder: 8,
    status: "Hidden",
    description: "Seasonal pasta line",
    createdAt: "2026-02-19T12:25:00.000Z",
    updatedAt: "2026-04-01T08:35:00.000Z",
  },
  {
    id: "cat-09",
    name: "Drinks",
    slug: "drinks",
    totalItems: 14,
    displayOrder: 9,
    status: "Active",
    description: "Soft drinks and beverages",
    createdAt: "2026-02-25T08:40:00.000Z",
    updatedAt: "2026-04-10T09:40:00.000Z",
  },
  {
    id: "cat-10",
    name: "Desserts",
    slug: "desserts",
    totalItems: 6,
    displayOrder: 10,
    status: "Hidden",
    description: "Sweet items in preparation",
    createdAt: "2026-03-03T15:15:00.000Z",
    updatedAt: "2026-04-07T11:32:00.000Z",
  },
]
