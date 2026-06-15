import * as React from "react"
import { useLocation } from "react-router-dom"

import {
  mapOwnerOpeningHours,
  type OwnerOpeningHoursResponse,
} from "@/lib/backend-mappers"
import { useOwnerOpeningHoursQuery } from "@/hooks/use-owner-api"
import { useAppStore } from "@/store/app-store"

export function OpeningHoursProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const openingHours = useAppStore((state) => state.openingHours)
  const setOpeningHours = useAppStore((state) => state.setOpeningHours)
  const location = useLocation()
  const shouldLoadOpeningHours = location.pathname === "/"
  const openingHoursQuery = useOwnerOpeningHoursQuery(
    ownerAccount.isAuthenticated && shouldLoadOpeningHours
  )

  const isSameOpeningHours = React.useCallback(
    (left: typeof openingHours, right: typeof openingHours) => {
      return (
        left.timezone === right.timezone &&
        left.updatedAt === right.updatedAt &&
        JSON.stringify(left.weeklySchedule) ===
          JSON.stringify(right.weeklySchedule) &&
        JSON.stringify(left.exceptions) === JSON.stringify(right.exceptions) &&
        JSON.stringify(left.temporaryClosure) ===
          JSON.stringify(right.temporaryClosure)
      )
    },
    []
  )

  React.useEffect(() => {
    if (!openingHoursQuery.data) return

    const mapped = mapOwnerOpeningHours(
      openingHoursQuery.data as OwnerOpeningHoursResponse,
      openingHours
    )
    setOpeningHours((current) => (isSameOpeningHours(current, mapped) ? current : mapped))
  }, [isSameOpeningHours, openingHours, openingHoursQuery.data, setOpeningHours])

  return <>{children}</>
}

export function useOpeningHours() {
  const openingHours = useAppStore((state) => state.openingHours)
  const setOpeningHours = useAppStore((state) => state.setOpeningHours)
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const openingHoursQuery = useOwnerOpeningHoursQuery(ownerAccount.isAuthenticated)

  return {
    openingHours,
    setOpeningHours,
    isLoading: openingHoursQuery.isPending,
  }
}
