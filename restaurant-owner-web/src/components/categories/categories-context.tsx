import * as React from "react"
import { useLocation } from "react-router-dom"

import { useOwnerCategoriesQuery } from "@/hooks/use-owner-api"
import {
  mapOwnerCategory,
  type OwnerCategoryResponse,
  type OwnerListResponse,
} from "@/lib/backend-mappers"
import { useAppStore } from "@/store/app-store"

export function CategoriesProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const setCategories = useAppStore((state) => state.setCategories)
  const location = useLocation()
  const shouldLoadCategories =
    location.pathname === "/" || location.pathname === "/analytics"
  const categoriesQuery = useOwnerCategoriesQuery(
    ownerAccount.isAuthenticated && shouldLoadCategories
  )

  React.useEffect(() => {
    if (!categoriesQuery.data) return

    const mapped = (
      categoriesQuery.data as OwnerListResponse<OwnerCategoryResponse>
    ).items.map(mapOwnerCategory)
    setCategories(mapped)
  }, [categoriesQuery.data, setCategories])

  React.useEffect(() => {
    if (!ownerAccount.isAuthenticated || !shouldLoadCategories) return
    if (categoriesQuery.isPending && !categoriesQuery.data) {
      setCategories([])
    }
  }, [categoriesQuery.data, categoriesQuery.isPending, ownerAccount.isAuthenticated, setCategories, shouldLoadCategories])

  return <>{children}</>
}

export function useCategories() {
  const categories = useAppStore((state) => state.categories)
  const setCategories = useAppStore((state) => state.setCategories)

  return { categories, setCategories }
}
