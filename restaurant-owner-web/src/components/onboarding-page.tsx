import * as React from "react"
import { format } from "date-fns"
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  CreditCard,
  Crosshair,
  LoaderCircle,
  ImagePlus,
  MapPin,
  Save,
  ShieldCheck,
  Store,
  Trash2,
  Wallet,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import {
  createTimeSlot,
  type OpeningHoursSettings,
  type TimeSlot,
  weekdayLabels,
  weekdayOrder,
} from "@/components/hours/types"
import type { PayoutMethod } from "@/components/payouts/types"
import type {
  StoreLocationSettings,
  StoreSettings,
} from "@/components/store-settings/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { validateImageFile } from "@/lib/image-upload"
import {
  buildOnboardingDraftPayload,
  buildOnboardingStateFromDraft,
  buildOpeningHoursFromDraft,
  buildStoreSettingsFromDraft,
} from "@/lib/backend-mappers"
import { getStoreCoverSrc, getStoreLogoSrc } from "@/lib/store-profile"
import {
  formatBangladeshPhonePlaceholder,
  isValidBangladeshPhone,
  normalizeBangladeshPhone,
  sanitizeBangladeshPhoneInput,
} from "@/lib/phone"
import { resolvePayoutMethodSubmission } from "@/lib/payout-verification"
import {
  useSubmitOnboardingDraftMutation,
  useUpdateOnboardingDraftMutation,
} from "@/hooks/use-owner-api"
import type { OnboardingStepId } from "@/store/app-store"
import { useAppStore } from "@/store/app-store"

const onboardingSteps: Array<{
  id: OnboardingStepId
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  {
    id: "basic_info",
    title: "Basic Info",
    description: "Store identity, owner details, and branding.",
    icon: Store,
  },
  {
    id: "location",
    title: "Location",
    description: "Address and coordinates for Netrokona.",
    icon: MapPin,
  },
  {
    id: "hours",
    title: "Opening Hours",
    description: "Weekly opening schedule for the restaurant.",
    icon: Clock3,
  },
  {
    id: "payout_setup",
    title: "Payout Setup",
    description: "Choose bank or bKash and finish payout details.",
    icon: Wallet,
  },
  {
    id: "review_submit",
    title: "Review & Submit",
    description: "Check everything and send to admin review.",
    icon: ShieldCheck,
  },
]

const requiredSteps: RequiredOnboardingStepId[] = onboardingSteps
  .filter((step) => step.id !== "review_submit")
  .map((step) => step.id as RequiredOnboardingStepId)

const PRESET_TAGS = [
  "Burger",
  "Fast Food",
  "Halal",
  "Family Meals",
  "Late Night",
  "Coffee",
  "Dessert",
  "Combo",
]

const PRESET_CUISINES = [
  "Fast Food",
  "Burger",
  "Cafe",
  "Pizza",
  "Chinese",
  "Dessert",
  "Rice Bowl",
  "Bakery",
]

const DESCRIPTION_LIMIT = 220
const MAX_CUISINES = 3
const PREPARATION_TIME_OPTIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60]
type StepValidation = {
  valid: boolean
  errors: Record<string, string>
  summary?: string[]
}

type RequiredOnboardingStepId = Exclude<OnboardingStepId, "review_submit">
type UploadTarget = "logo" | "cover"

function formatTime(value: string) {
  const [hour, minute] = value.split(":").map(Number)
  const normalizedHour = ((hour + 11) % 12) + 1
  const meridiem = hour >= 12 ? "PM" : "AM"
  return `${normalizedHour}:${String(minute).padStart(2, "0")} ${meridiem}`
}

function OptionalLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
      ({children})
    </span>
  )
}

function getSlotValidation(slot: TimeSlot) {
  if (!slot.startTime || !slot.endTime)
    return "Start and end time are required."
  if (slot.startTime === slot.endTime)
    return "Opening and closing time cannot be the same."
  return ""
}

function ensureOpeningHoursDefaults(
  settings: OpeningHoursSettings
): OpeningHoursSettings {
  return {
    ...settings,
    weeklySchedule: weekdayOrder.map((dayKey) => {
      const entry =
        settings.weeklySchedule.find((day) => day.day === dayKey) ??
        ({
          day: dayKey,
          isOpen: true,
          is24Hours: false,
          timeSlots: [createTimeSlot()],
        } as OpeningHoursSettings["weeklySchedule"][number])

      return {
        ...entry,
        isOpen: entry.isOpen ?? true,
        is24Hours: entry.is24Hours ?? false,
        timeSlots:
          entry.isOpen && !entry.is24Hours
            ? entry.timeSlots.length > 0
              ? entry.timeSlots
              : [createTimeSlot()]
            : [],
      }
    }),
  }
}

function validateBasicInfo(
  ownerName: string,
  settings: StoreSettings
): StepValidation {
  const errors: Record<string, string> = {}
  const cuisineTypes = settings.cuisineType
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (!settings.name.trim()) errors.name = "Restaurant name is required."
  if (!ownerName.trim()) errors.ownerName = "Owner name is required."

  const normalizedPhone = normalizeBangladeshPhone(settings.phone)
  if (!normalizedPhone) {
    errors.phone = "Phone number is required."
  } else if (!isValidBangladeshPhone(normalizedPhone)) {
    errors.phone = "Invalid phone number."
  }

  if (
    settings.email.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email.trim())
  ) {
    errors.email = "Use a valid email address."
  }

  if (cuisineTypes.length === 0)
    errors.cuisineType = "Choose at least one cuisine."
  if (cuisineTypes.length > MAX_CUISINES) {
    errors.cuisineType = `Choose up to ${MAX_CUISINES} cuisines.`
  }
  if (settings.tags.length === 0) errors.tags = "Add at least one tag."

  return { valid: Object.keys(errors).length === 0, errors }
}

function validateLocation(
  location: StoreLocationSettings,
  address: string
): StepValidation {
  const errors: Record<string, string> = {}

  if (!address.trim()) errors.address = "Address is required."
  if (location.city !== "Netrokona") errors.city = "City must stay Netrokona."
  if (
    location.latitude !== null &&
    !Number.isNaN(location.latitude) &&
    (location.latitude < -90 || location.latitude > 90)
  ) {
    errors.latitude = "Latitude must be between -90 and 90."
  }
  if (
    location.longitude !== null &&
    !Number.isNaN(location.longitude) &&
    (location.longitude < -180 || location.longitude > 180)
  ) {
    errors.longitude = "Longitude must be between -180 and 180."
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

function validateOpeningHours(
  openingHours: OpeningHoursSettings
): StepValidation {
  const errors: Record<string, string> = {}
  const summary: string[] = []
  const openDays = openingHours.weeklySchedule.filter((day) => day.isOpen)

  if (openDays.length === 0) summary.push("At least one day must stay open.")

  for (const day of openDays) {
    const primarySlot = day.timeSlots[0]
    if (!primarySlot) {
      errors[day.day] = "Add one valid time slot."
      continue
    }
    const slotError = getSlotValidation(primarySlot)
    if (slotError) errors[day.day] = slotError
  }

  return {
    valid: Object.keys(errors).length === 0 && summary.length === 0,
    errors,
    summary,
  }
}

function validatePayout(
  method: PayoutMethod,
  payoutSkipped: boolean
): StepValidation {
  if (payoutSkipped) {
    return {
      valid: true,
      errors: {},
      summary: ["Payout setup skipped for now."],
    }
  }

  const errors: Record<string, string> = {}

  if (!method.accountName.trim())
    errors.accountName = "Account holder name is required."
  const normalizedPayoutNumber =
    method.type === "bkash"
      ? normalizeBangladeshPhone(method.accountNumber)
      : method.accountNumber.trim()

  if (!normalizedPayoutNumber) {
    errors.accountNumber =
      method.type === "bkash"
        ? "bKash number is required."
        : "Account number is required."
  } else if (
    method.type === "bkash" &&
    !isValidBangladeshPhone(normalizedPayoutNumber)
  ) {
    errors.accountNumber = "Invalid phone number."
  }
  if (method.type === "bank") {
    if (!method.bankName?.trim()) errors.bankName = "Bank name is required."
    if (!method.branchName?.trim())
      errors.branchName = "Branch name is required."
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

function mapValidations(
  ownerName: string,
  settings: StoreSettings,
  openingHours: OpeningHoursSettings,
  payoutMethod: PayoutMethod,
  payoutSkipped: boolean
) {
  return {
    basic_info: validateBasicInfo(ownerName, settings),
    location: validateLocation(settings.location, settings.address),
    hours: validateOpeningHours(openingHours),
    payout_setup: validatePayout(payoutMethod, payoutSkipped),
  } satisfies Record<Exclude<OnboardingStepId, "review_submit">, StepValidation>
}

function getCompletedSteps(
  validations: ReturnType<typeof mapValidations>
): OnboardingStepId[] {
  return requiredSteps.filter((stepId) => validations[stepId].valid)
}

function stepIndex(stepId: OnboardingStepId) {
  return onboardingSteps.findIndex((step) => step.id === stepId)
}

function previewMapUrl(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) return ""
  const delta = 0.01
  return `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - delta}%2C${latitude - delta}%2C${longitude + delta}%2C${latitude + delta}&layer=mapnik&marker=${latitude}%2C${longitude}`
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const setOwnerAccount = useAppStore((state) => state.setOwnerAccount)
  const storeSettings = useAppStore((state) => state.storeSettings)
  const setStoreSettings = useAppStore((state) => state.setStoreSettings)
  const openingHours = useAppStore((state) => state.openingHours)
  const setOpeningHours = useAppStore((state) => state.setOpeningHours)
  const payoutMethod = useAppStore((state) => state.payoutMethod)
  const setPayoutMethod = useAppStore((state) => state.setPayoutMethod)
  const onboardingState = useAppStore((state) => state.onboardingState)
  const setOnboardingState = useAppStore((state) => state.setOnboardingState)
  const restaurantLifecycleStatus = useAppStore(
    (state) => state.restaurantLifecycleStatus
  )
  const setRestaurantLifecycleStatus = useAppStore(
    (state) => state.setRestaurantLifecycleStatus
  )
  const updateOnboardingDraftMutation = useUpdateOnboardingDraftMutation()
  const submitOnboardingDraftMutation = useSubmitOnboardingDraftMutation()

  const shouldUseSavedDraft = Boolean(onboardingState.draftSavedAt)
  const draftOwnerName = ownerAccount.ownerName
  const ownerPhoneForDefaults = normalizeBangladeshPhone(ownerAccount.phone)
  const [draftStoreSettings, setDraftStoreSettings] = React.useState(() =>
    shouldUseSavedDraft
      ? storeSettings
      : {
          ...storeSettings,
          name: "",
          logoUrl: "",
          coverImageUrl: "",
          description: "",
          cuisineType: "",
          tags: [],
          phone: ownerAccount.phone,
          email: "",
          supportContact: "",
          address: "",
          location: {
            city: "Netrokona",
            latitude: null,
            longitude: null,
          },
        }
  )
  const [draftOpeningHours, setDraftOpeningHours] = React.useState(() =>
    ensureOpeningHoursDefaults(
      shouldUseSavedDraft
        ? openingHours
        : {
            ...openingHours,
            weeklySchedule: openingHours.weeklySchedule.map((day) => ({
              ...day,
              isOpen: true,
            })),
            exceptions: [],
          }
    )
  )
  const [draftPayoutMethod, setDraftPayoutMethod] = React.useState(() =>
    shouldUseSavedDraft
      ? payoutMethod
      : ({
          ...payoutMethod,
          type: "bkash",
          accountName: "",
          accountNumber: "",
          bankName: "",
          branchName: "",
          isVerified: false,
          verifiedAt: null,
        } satisfies PayoutMethod)
  )
  const [useOwnerPhoneForContact, setUseOwnerPhoneForContact] =
    React.useState(() => {
      const existingPhone = normalizeBangladeshPhone(
        shouldUseSavedDraft ? storeSettings.phone : ownerPhoneForDefaults
      )
      return !existingPhone || existingPhone === ownerPhoneForDefaults
    })
  const [useOwnerPhoneForBkash, setUseOwnerPhoneForBkash] = React.useState(
    () => {
      const existingNumber = normalizeBangladeshPhone(
        shouldUseSavedDraft ? payoutMethod.accountNumber : ownerPhoneForDefaults
      )
      return !existingNumber || existingNumber === ownerPhoneForDefaults
    }
  )
  const [tagInput, setTagInput] = React.useState("")
  const [cuisineInput, setCuisineInput] = React.useState("")
  const [isLocating, setIsLocating] = React.useState(false)
  const [isMapLoading, setIsMapLoading] = React.useState(false)
  const [mapLoadStartedAt, setMapLoadStartedAt] = React.useState<number | null>(
    null
  )
  const [hasHydratedDraft, setHasHydratedDraft] = React.useState(false)
  const [saveAction, setSaveAction] = React.useState<
    "idle" | "draft" | "next" | "submit"
  >("idle")
  const [showStepErrors, setShowStepErrors] = React.useState<
    Partial<Record<RequiredOnboardingStepId, boolean>>
  >({})
  const uploadedImagePreviewUrlsRef = React.useRef<Record<UploadTarget, string | null>>({
    logo: null,
    cover: null,
  })
  const mapLoaderTimeoutRef = React.useRef<number | null>(null)
  const payoutSkipped = onboardingState.skippedSteps.includes("payout_setup")

  React.useEffect(
    () => () => {
      Object.values(uploadedImagePreviewUrlsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url)
      })
      if (mapLoaderTimeoutRef.current !== null) {
        window.clearTimeout(mapLoaderTimeoutRef.current)
      }
    },
    []
  )

  const validations = React.useMemo(
    () =>
      mapValidations(
        draftOwnerName,
        draftStoreSettings,
        draftOpeningHours,
        draftPayoutMethod,
        payoutSkipped
      ),
    [
      draftOwnerName,
      draftStoreSettings,
      draftOpeningHours,
      draftPayoutMethod,
      payoutSkipped,
    ]
  )

  const validSteps = React.useMemo(
    () => getCompletedSteps(validations),
    [validations]
  )
  const completedSteps = React.useMemo(
    () =>
      onboardingState.completedSteps.filter((step, index, steps) => {
        if (step === "review_submit") return true
        return steps.indexOf(step) === index && validSteps.includes(step)
      }),
    [onboardingState.completedSteps, validSteps]
  )

  const progress = Math.round(
    (completedSteps.length / requiredSteps.length) * 100
  )
  const currentStep =
    onboardingSteps.find((step) => step.id === onboardingState.currentStep)
      ?.id ?? "basic_info"
  const currentStepValidation =
    currentStep === "review_submit"
      ? null
      : validations[currentStep as RequiredOnboardingStepId]
  const currentIndex = stepIndex(currentStep)
  const activeStepMeta = onboardingSteps[currentIndex]

  React.useEffect(() => {
    if (
      draftStoreSettings.location.latitude !== null &&
      draftStoreSettings.location.longitude !== null
    ) {
      setIsMapLoading(true)
      return
    }

    if (!isLocating) {
      setIsMapLoading(false)
    }
  }, [
    draftStoreSettings.location.latitude,
    draftStoreSettings.location.longitude,
    isLocating,
  ])

  React.useEffect(() => {
    if (!onboardingState.draftSavedAt || hasHydratedDraft) return

    setDraftStoreSettings(storeSettings)
    setDraftOpeningHours(ensureOpeningHoursDefaults(openingHours))
    setDraftPayoutMethod(payoutMethod)
    setUseOwnerPhoneForContact(
      normalizeBangladeshPhone(storeSettings.phone) === ownerPhoneForDefaults
    )
    setUseOwnerPhoneForBkash(
      payoutMethod.type === "bkash" &&
        normalizeBangladeshPhone(payoutMethod.accountNumber) ===
          ownerPhoneForDefaults
    )
    setHasHydratedDraft(true)
  }, [
    hasHydratedDraft,
    onboardingState.draftSavedAt,
    openingHours,
    ownerPhoneForDefaults,
    payoutMethod,
    storeSettings,
  ])

  React.useEffect(() => {
    if (!useOwnerPhoneForContact || !ownerPhoneForDefaults) return

    setDraftStoreSettings((current) =>
      normalizeBangladeshPhone(current.phone) === ownerPhoneForDefaults
        ? current
        : {
            ...current,
            phone: ownerPhoneForDefaults,
          }
    )
  }, [ownerPhoneForDefaults, useOwnerPhoneForContact])

  React.useEffect(() => {
    if (
      !useOwnerPhoneForBkash ||
      !ownerPhoneForDefaults ||
      draftPayoutMethod.type !== "bkash"
    ) {
      return
    }

    setDraftPayoutMethod((current) =>
      normalizeBangladeshPhone(current.accountNumber) === ownerPhoneForDefaults
        ? current
        : {
            ...current,
            accountNumber: ownerPhoneForDefaults,
          }
    )
  }, [draftPayoutMethod.type, ownerPhoneForDefaults, useOwnerPhoneForBkash])

  function hideMapLoaderAfterMinimumDelay() {
    const startedAt = mapLoadStartedAt ?? Date.now()
    const elapsed = Date.now() - startedAt
    const remaining = Math.max(0, 1000 - elapsed)

    if (mapLoaderTimeoutRef.current !== null) {
      window.clearTimeout(mapLoaderTimeoutRef.current)
    }

    mapLoaderTimeoutRef.current = window.setTimeout(() => {
      setIsMapLoading(false)
      setMapLoadStartedAt(null)
      mapLoaderTimeoutRef.current = null
    }, remaining)
  }

  function shouldShowError(stepId: RequiredOnboardingStepId) {
    return !!showStepErrors[stepId]
  }

  async function persistDraft(reason: "draft" | "next" | "submit") {
    setSaveAction(reason)
    try {
      const payload = buildOnboardingDraftPayload({
        onboardingState,
        storeSettings: draftStoreSettings,
        openingHours: draftOpeningHours,
        payoutMethod: draftPayoutMethod,
        ownerName: draftOwnerName.trim(),
      })

      const response = await updateOnboardingDraftMutation.mutateAsync(payload)
      const { draft, lifecycleStatus } = response

      setRestaurantLifecycleStatus(lifecycleStatus)
      setOwnerAccount((current) => ({
        ...current,
        ownerName: draft.basicInfo?.fullName || current.ownerName,
        phone: current.phone,
        email: draft.basicInfo?.email || current.email,
      }))
      setStoreSettings((current) => buildStoreSettingsFromDraft(draft, current))
      setOpeningHours((current) => buildOpeningHoursFromDraft(draft, current))
      setPayoutMethod(
        (current) =>
          resolvePayoutMethodSubmission({
            currentMethod: current,
            draftMethod: draftPayoutMethod,
            ownerPhone: ownerAccount.phone,
            source: "onboarding",
          }).nextMethod
      )
      setOnboardingState((current) =>
        buildOnboardingStateFromDraft(draft, current)
      )

      if (reason === "draft") {
        toast.success("Draft saved", {
          description: "Your onboarding progress is safely stored.",
        })
      }

      return true
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save your onboarding progress."
      toast.error("Save failed", {
        description: message,
      })
      return false
    } finally {
      setSaveAction("idle")
    }
  }

  function goToStep(stepId: OnboardingStepId) {
    setOnboardingState((current) => ({
      ...current,
      currentStep: stepId,
      completedSteps: current.completedSteps,
    }))
  }

  function canOpenStep(stepId: OnboardingStepId) {
    if (stepId === currentStep) return true

    const allRequiredComplete = requiredSteps.every((requiredStepId) => {
      return validations[requiredStepId].valid
    })

    if (allRequiredComplete) return true

    return stepIndex(stepId) <= currentIndex || completedSteps.includes(stepId)
  }

  async function handleNext() {
    if (currentStep === "review_submit") return
    if (!currentStepValidation?.valid) {
      setShowStepErrors((current) => ({
        ...current,
        [currentStep]: true,
      }))
      toast.error("This step still has issues", {
        description:
          "Check the inline error messages and complete the required fields.",
      })
      return
    }

    const nextStep = onboardingSteps[currentIndex + 1]?.id
    if (nextStep) {
      setOnboardingState((current) => ({
        ...current,
        currentStep: nextStep,
        completedSteps: current.completedSteps.includes(currentStep)
          ? current.completedSteps
          : [...current.completedSteps, currentStep],
      }))
    }
  }

  function handleBack() {
    const previousStep = onboardingSteps[currentIndex - 1]?.id
    if (previousStep) goToStep(previousStep)
  }

  async function handleSubmitForReview() {
    if (!requiredSteps.every((stepId) => validations[stepId].valid)) {
      toast.error("Submission blocked", {
        description:
          "Complete the remaining required sections before sending for review.",
      })
      return
    }

    const saved = await persistDraft("submit")
    if (!saved) return

    setSaveAction("submit")
    try {
      const result = await submitOnboardingDraftMutation.mutateAsync()
      setRestaurantLifecycleStatus(result.restaurantLifecycleStatus)
      setOnboardingState((current) => ({
        ...current,
        currentStep: "review_submit",
        completedSteps: [...completedSteps, "review_submit"],
        submittedAt: result.submittedAt,
        reviewNote: "",
        reviewIssues: [],
        resubmissionCount: result.resubmissionCount,
      }))
      toast.success(
        restaurantLifecycleStatus === "rejected"
          ? "Application resubmitted"
          : "Submitted for review",
        {
          description:
            restaurantLifecycleStatus === "rejected"
              ? "Your updated store details are now back in the admin review queue."
              : "Your store is now waiting for admin approval.",
        }
      )
      navigate("/review-status")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to submit for review right now."
      toast.error("Submission failed", {
        description: message,
      })
    } finally {
      setSaveAction("idle")
    }
  }

  function addTag(rawValue: string) {
    const nextTag = rawValue.trim()
    if (!nextTag) return
    if (draftStoreSettings.tags.includes(nextTag)) {
      setTagInput("")
      return
    }

    setDraftStoreSettings((current) => ({
      ...current,
      tags: [...current.tags, nextTag],
    }))
    setTagInput("")
  }

  function removeTag(tag: string) {
    setDraftStoreSettings((current) => ({
      ...current,
      tags: current.tags.filter((entry) => entry !== tag),
    }))
  }

  function getCuisineTypes() {
    return draftStoreSettings.cuisineType
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  function addCuisine(rawValue: string) {
    const nextCuisine = rawValue.trim()
    if (!nextCuisine) return

    const currentCuisines = getCuisineTypes()
    if (currentCuisines.includes(nextCuisine)) {
      setCuisineInput("")
      return
    }
    if (currentCuisines.length >= MAX_CUISINES) {
      toast.error(`You can choose up to ${MAX_CUISINES} cuisines.`)
      return
    }

    setDraftStoreSettings((current) => ({
      ...current,
      cuisineType: [...currentCuisines, nextCuisine].join(", "),
    }))
    setCuisineInput("")
  }

  function removeCuisine(cuisine: string) {
    const currentCuisines = getCuisineTypes()
    setDraftStoreSettings((current) => ({
      ...current,
      cuisineType: currentCuisines
        .filter((entry) => entry !== cuisine)
        .join(", "),
    }))
  }

  function clearPayoutSkip() {
    setOnboardingState((current) => ({
      ...current,
      skippedSteps: current.skippedSteps.filter(
        (step) => step !== "payout_setup"
      ),
    }))
  }

  function markPayoutSkipped(nextStep?: OnboardingStepId) {
    const savedAt = new Date().toISOString()

    setOwnerAccount((current) => ({
      ...current,
      ownerName: draftOwnerName.trim(),
      phone: current.phone,
      email: draftStoreSettings.email.trim(),
    }))
    setStoreSettings({
      ...draftStoreSettings,
      updatedAt: savedAt,
    })
    setOpeningHours({
      ...draftOpeningHours,
      updatedAt: savedAt,
    })
    setPayoutMethod(
      (current) =>
        resolvePayoutMethodSubmission({
          currentMethod: current,
          draftMethod: draftPayoutMethod,
          ownerPhone: ownerAccount.phone,
          source: "onboarding",
        }).nextMethod
    )
    setShowStepErrors((current) => ({
      ...current,
      payout_setup: false,
    }))
    setOnboardingState((current) => ({
      ...current,
      currentStep: nextStep ?? current.currentStep,
      completedSteps: current.completedSteps.includes("payout_setup")
        ? current.completedSteps
        : [...current.completedSteps, "payout_setup"],
      skippedSteps: current.skippedSteps.includes("payout_setup")
        ? current.skippedSteps
        : [...current.skippedSteps, "payout_setup"],
      draftSavedAt: savedAt,
    }))
    toast.success("Payout skipped for now", {
      description:
        "You can complete payout details later from onboarding or store settings.",
    })
  }

  function handleImageUpload(target: UploadTarget, file: File | null) {
    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.ok) {
      toast.error(validation.title, {
        description: validation.description,
      })
      return
    }

    const previousPreviewUrl = uploadedImagePreviewUrlsRef.current[target]
    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl)
    }
    const previewUrl = URL.createObjectURL(file)
    uploadedImagePreviewUrlsRef.current[target] = previewUrl

    setDraftStoreSettings((current) => ({
      ...current,
      [target === "logo" ? "logoUrl" : "coverImageUrl"]: previewUrl,
    }))

    toast.success(target === "logo" ? "Logo uploaded" : "Cover uploaded", {
      description:
        target === "logo"
          ? "Your store logo is ready for review."
          : "Your cover image is ready for review.",
    })
  }

  function removeImageUpload(target: UploadTarget) {
    const previousPreviewUrl = uploadedImagePreviewUrlsRef.current[target]
    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl)
      uploadedImagePreviewUrlsRef.current[target] = null
    }
    setDraftStoreSettings((current) => ({
      ...current,
      [target === "logo" ? "logoUrl" : "coverImageUrl"]: "",
    }))
  }

  function applyTemporaryCoordinates() {
    const now = Date.now()
    setMapLoadStartedAt(now)
    setIsMapLoading(true)
    setDraftStoreSettings((current) => ({
      ...current,
      location: {
        ...current.location,
        city: "Netrokona",
        latitude: 24.8831,
        longitude: 90.7282,
      },
    }))
    toast.info("Temporary coordinates added", {
      description:
        "We added a fallback coordinate for now. Admin can adjust the exact location shortly.",
    })
  }

  function handleFindMyLocation() {
    if (!navigator.geolocation) {
      applyTemporaryCoordinates()
      return
    }

    setIsLocating(true)
    setIsMapLoading(true)
    setMapLoadStartedAt(Date.now())
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraftStoreSettings((current) => ({
          ...current,
          location: {
            ...current.location,
            city: "Netrokona",
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
          },
        }))
        setIsLocating(false)
        toast.success("Current coordinates added")
      },
      () => {
        setIsLocating(false)
        setIsMapLoading(false)
        toast.info("Location unavailable", {
          description:
            "You can continue for now without coordinates. Admin can fine-tune the map point later.",
        })
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    )
  }

  function renderBasicInfoStep() {
    const errors = validations.basic_info.errors
    const remainingCharacters =
      DESCRIPTION_LIMIT - draftStoreSettings.description.length
    const revealErrors = shouldShowError("basic_info")
    const selectedCuisines = getCuisineTypes()

    return (
      <div className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Restaurant Name</label>
            <Input
              value={draftStoreSettings.name}
              onChange={(event) =>
                setDraftStoreSettings((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Meet Point"
            />
            {revealErrors && errors.name ? (
              <p className="text-sm text-destructive">{errors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Owner Name</label>
            <Input
              value={draftOwnerName}
              disabled
              placeholder="Enter your Owner name"
            />
            {revealErrors && errors.ownerName ? (
              <p className="text-sm text-destructive">{errors.ownerName}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Restaurant contact number</label>
            <label
              htmlFor="use-owner-contact-phone"
              className="flex items-start gap-3 rounded-2xl border bg-muted/15 p-3 text-sm"
            >
              <Checkbox
                id="use-owner-contact-phone"
                checked={useOwnerPhoneForContact}
                onCheckedChange={(checked) => {
                  const nextValue = checked === true
                  setUseOwnerPhoneForContact(nextValue)
                  setDraftStoreSettings((current) => ({
                    ...current,
                    phone: nextValue ? ownerPhoneForDefaults : "",
                  }))
                }}
              />
              <span>
                <span className="block font-medium">
                  Use owner phone for customer contact
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Foodbela or customers may use this number if support needs to
                  contact the restaurant.
                </span>
              </span>
            </label>
            <Input
              value={
                useOwnerPhoneForContact
                  ? ownerPhoneForDefaults
                  : draftStoreSettings.phone
              }
              onChange={(event) =>
                setDraftStoreSettings((current) => ({
                  ...current,
                  phone: sanitizeBangladeshPhoneInput(event.target.value),
                }))
              }
              disabled={useOwnerPhoneForContact}
              inputMode="numeric"
              maxLength={11}
              placeholder={formatBangladeshPhonePlaceholder()}
            />
            {revealErrors && errors.phone ? (
              <p className="text-sm text-destructive">{errors.phone}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Avg Food Preparing Time
            </label>
            <Select
              value={String(
                draftStoreSettings.orderSettings.preparationTimeMinutes
              )}
              onValueChange={(value) =>
                setDraftStoreSettings((current) => ({
                  ...current,
                  orderSettings: {
                    ...current.orderSettings,
                    preparationTimeMinutes: Number(value),
                  },
                }))
              }
            >
              <SelectTrigger className="h-10 w-full rounded-xl px-3">
                <SelectValue placeholder="Select average prep time" />
              </SelectTrigger>
              <SelectContent>
                {PREPARATION_TIME_OPTIONS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes} min
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Email Address
              <OptionalLabel>Optional</OptionalLabel>
            </label>
            <Input
              type="email"
              value={draftStoreSettings.email}
              onChange={(event) =>
                setDraftStoreSettings((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              placeholder="owner@restaurant.com"
            />
            <p className="text-xs text-muted-foreground">
              Adding email helps with support follow-up, recovery, and future
              onboarding updates.
            </p>
            {draftStoreSettings.email.trim() && errors.email ? (
              <p className="text-sm text-destructive">{errors.email}</p>
            ) : null}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">
              Description <OptionalLabel>Optional</OptionalLabel>
            </label>
            <Textarea
              value={draftStoreSettings.description}
              onChange={(event) =>
                setDraftStoreSettings((current) => ({
                  ...current,
                  description: event.target.value.slice(0, DESCRIPTION_LIMIT),
                }))
              }
              placeholder="Optional short overview of your restaurant."
              className="min-h-32"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span></span>
              <span
                className={
                  remainingCharacters < 30 ? "font-medium text-amber-600" : ""
                }
              >
                {remainingCharacters} characters left
              </span>
            </div>
            {revealErrors && errors.description ? (
              <p className="text-sm text-destructive">{errors.description}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border bg-muted/10 p-4">
            <div className="space-y-1">
              <p className="font-medium">
                Store logo
                <OptionalLabel>Optional</OptionalLabel>
              </p>
              <p className="text-sm text-muted-foreground">
                Add it now if ready, or upload it later from store settings.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-4 rounded-2xl border border-dashed bg-background/80 p-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted">
                <img
                  src={getStoreLogoSrc(draftStoreSettings.logoUrl)}
                  alt="Store logo preview"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-sm font-medium">
                    {draftStoreSettings.logoUrl
                      ? "Logo ready"
                      : "Add store logo"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    PNG or JPG up to 5 MB. Customers will see a default
                    placeholder until you upload a logo.
                  </p>
                </div>
                {draftStoreSettings.logoUrl ? null : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium">
                    <ImagePlus className="h-4 w-4" />
                    Choose Image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        handleImageUpload("logo", file)
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
            {draftStoreSettings.logoUrl ? (
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => removeImageUpload("logo")}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </Button>
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border bg-muted/10 p-4">
            <div className="space-y-1">
              <p className="font-medium">
                Cover image
                <OptionalLabel>Optional</OptionalLabel>
              </p>
              <p className="text-sm text-muted-foreground">
                A polished cover helps your storefront feel more premium.
              </p>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-dashed bg-background/80">
              <div className="flex h-36 items-center justify-center bg-muted/40">
                <img
                  src={getStoreCoverSrc(draftStoreSettings.coverImageUrl)}
                  alt="Cover preview"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="border-t p-4">
                {draftStoreSettings.coverImageUrl ? null : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium">
                    <ImagePlus className="h-4 w-4" />
                    Choose Image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        handleImageUpload("cover", file)
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
            {draftStoreSettings.coverImageUrl ? (
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => removeImageUpload("cover")}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Cuisine Type</label>
            <div className="rounded-3xl border bg-muted/15 p-4">
              <div className="flex min-h-10 flex-wrap gap-2">
                {selectedCuisines.map((cuisine) => (
                  <button
                    key={cuisine}
                    type="button"
                    onClick={() => removeCuisine(cuisine)}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary transition hover:bg-primary/15"
                  >
                    {cuisine}
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={cuisineInput}
                  onChange={(event) => setCuisineInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault()
                      addCuisine(cuisineInput)
                    }
                  }}
                  placeholder="Type cuisine and press Enter"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addCuisine(cuisineInput)}
                >
                  Add Cuisine
                </Button>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>{/* Choose up to {MAX_CUISINES} cuisine types. */}</span>
                <span>
                  {selectedCuisines.length}/{MAX_CUISINES} selected
                </span>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Suggested Cuisines
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_CUISINES.filter(
                    (cuisine) => !selectedCuisines.includes(cuisine)
                  ).map((cuisine) => (
                    <Button
                      key={cuisine}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addCuisine(cuisine)}
                      disabled={selectedCuisines.length >= MAX_CUISINES}
                    >
                      {cuisine}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            {revealErrors && errors.cuisineType ? (
              <p className="text-sm text-destructive">{errors.cuisineType}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tags</label>
            <div className="rounded-3xl border bg-muted/15 p-4">
              <div className="flex min-h-10 flex-wrap gap-2">
                {draftStoreSettings.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary transition hover:bg-primary/15"
                  >
                    {tag}
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault()
                      addTag(tagInput)
                    }
                  }}
                  placeholder="Type a tag and press Enter"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addTag(tagInput)}
                >
                  Add Tag
                </Button>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Suggested Tags
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TAGS.filter(
                    (tag) => !draftStoreSettings.tags.includes(tag)
                  ).map((tag) => (
                    <Button
                      key={tag}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addTag(tag)}
                    >
                      {tag}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            {revealErrors && errors.tags ? (
              <p className="text-sm text-destructive">{errors.tags}</p>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  function renderLocationStep() {
    const errors = validations.location.errors
    const revealErrors = shouldShowError("location")

    return (
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">Full Address</label>
            <Textarea
              value={draftStoreSettings.address}
              onChange={(event) =>
                setDraftStoreSettings((current) => ({
                  ...current,
                  address: event.target.value,
                }))
              }
              placeholder="Station Road, Netrokona Sadar"
              className="min-h-28"
            />
            {revealErrors && errors.address ? (
              <p className="text-sm text-destructive">{errors.address}</p>
            ) : null}
          </div>

          <div className="space-y-4 rounded-2xl border bg-muted/10 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Need help with coordinates?</p>
              <p className="text-sm text-muted-foreground">
                Use your current device location first. If it cannot be found,
                you can continue for now and admin can fine-tune the exact map
                point later.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={handleFindMyLocation}
                disabled={isLocating}
                className="w-full p-6"
              >
                <Crosshair className="mr-2 h-4 w-4" />
                {isLocating ? "Finding..." : "Find Location"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  toast.message("You can continue without coordinates", {
                    description:
                      "Leave latitude and longitude empty for now if location access is unavailable. Admin can update them shortly.",
                  })
                }
              >
                <BadgeCheck className="mr-2 h-4 w-4" />
                Continue for now
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">City</label>
              <Input value="Netrokona" disabled />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Latitude</label>
              <Input
                type="number"
                step="0.0001"
                value={draftStoreSettings.location.latitude ?? ""}
                disabled
                placeholder="24.8831"
              />
              {revealErrors && errors.latitude ? (
                <p className="text-sm text-destructive">{errors.latitude}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Longitude</label>
              <Input
                type="number"
                step="0.0001"
                value={draftStoreSettings.location.longitude ?? ""}
                disabled
                placeholder="90.7282"
              />
              {revealErrors && errors.longitude ? (
                <p className="text-sm text-destructive">{errors.longitude}</p>
              ) : null}
            </div>
          </div>
        </div>

        <Card className="overflow-hidden rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base">Map Preview</CardTitle>
            <CardDescription>
              This helps the admin team confirm the restaurant location quickly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLocating ? (
              <div className="flex h-72 flex-col items-center justify-center rounded-2xl border bg-muted/10 text-sm text-muted-foreground">
                <LoaderCircle className="mb-3 h-7 w-7 animate-spin text-primary" />
                Finding your current location...
              </div>
            ) : draftStoreSettings.location.latitude !== null &&
              draftStoreSettings.location.longitude !== null ? (
              <div className="relative overflow-hidden rounded-2xl border">
                {isMapLoading ? (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/95 text-sm text-muted-foreground">
                    <LoaderCircle className="mb-3 h-7 w-7 animate-spin text-primary" />
                    Loading map preview...
                  </div>
                ) : null}
                <iframe
                  title="Restaurant location preview"
                  src={previewMapUrl(
                    draftStoreSettings.location.latitude,
                    draftStoreSettings.location.longitude
                  )}
                  className="h-72 w-full"
                  onLoad={hideMapLoaderAfterMinimumDelay}
                />
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
                Add latitude and longitude to preview the map.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  function renderHoursStep() {
    const errors = validations.hours.errors
    const revealErrors = shouldShowError("hours")

    return (
      <div className="space-y-4">
        {revealErrors && validations.hours.summary?.length ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {validations.hours.summary.join(" ")}
          </div>
        ) : null}

        {weekdayOrder.map((dayKey) => {
          const day = draftOpeningHours.weeklySchedule.find(
            (entry) => entry.day === dayKey
          )!
          const primarySlot = day.timeSlots[0] ?? createTimeSlot()

          return (
            <div key={day.day} className="rounded-2xl border bg-muted/10 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-40">
                  <div className="flex items-center gap-3">
                    <p className="font-medium">{weekdayLabels[day.day]}</p>
                    <Badge
                      variant="outline"
                      className={
                        day.isOpen
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-100 text-slate-700"
                      }
                    >
                      {day.isOpen ? "Open" : "Closed"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {day.isOpen
                      ? `${formatTime(primarySlot.startTime)} - ${formatTime(primarySlot.endTime)}`
                      : "Closed for this day"}
                  </p>
                </div>

                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex items-center gap-3 rounded-2xl border bg-background px-4 py-3">
                    <Switch
                      checked={day.isOpen}
                      onCheckedChange={(checked) =>
                        setDraftOpeningHours((current) => ({
                          ...current,
                          weeklySchedule: current.weeklySchedule.map((entry) =>
                            entry.day === day.day
                              ? {
                                  ...entry,
                                  isOpen: checked,
                                  timeSlots: checked
                                    ? [entry.timeSlots[0] ?? createTimeSlot()]
                                    : [],
                                }
                              : entry
                          ),
                        }))
                      }
                    />
                    <span className="text-sm font-medium">
                      {day.isOpen ? "Accept orders on this day" : "Closed day"}
                    </span>
                  </div>

                  {day.isOpen ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Opens At
                        </label>
                        <Input
                          type="time"
                          value={primarySlot.startTime}
                          onChange={(event) =>
                            setDraftOpeningHours((current) => ({
                              ...current,
                              weeklySchedule: current.weeklySchedule.map(
                                (entry) =>
                                  entry.day === day.day
                                    ? {
                                        ...entry,
                                        timeSlots: [
                                          {
                                            ...primarySlot,
                                            startTime: event.target.value,
                                          },
                                        ],
                                      }
                                    : entry
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Closes At
                        </label>
                        <Input
                          type="time"
                          value={primarySlot.endTime}
                          onChange={(event) =>
                            setDraftOpeningHours((current) => ({
                              ...current,
                              weeklySchedule: current.weeklySchedule.map(
                                (entry) =>
                                  entry.day === day.day
                                    ? {
                                        ...entry,
                                        timeSlots: [
                                          {
                                            ...primarySlot,
                                            endTime: event.target.value,
                                          },
                                        ],
                                      }
                                    : entry
                              ),
                            }))
                          }
                        />
                      </div>
                    </div>
                  ) : null}

                  {revealErrors && errors[day.day] ? (
                    <p className="text-sm text-destructive">
                      {errors[day.day]}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderPayoutStep() {
    const errors = validations.payout_setup.errors
    const revealErrors = shouldShowError("payout_setup")

    return (
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base">Choose Payout Method</CardTitle>
            <CardDescription>
              Select the method you want the restaurant earnings to settle into.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {[
              {
                value: "bkash",
                label: "bKash",
                description: "Fast mobile wallet payout setup for Bangladesh.",
                icon: CreditCard,
              },
              {
                value: "bank",
                label: "Bank Account",
                description:
                  "Best for scheduled settlements and larger payouts.",
                icon: Building2,
              },
            ].map((option) => {
              const Icon = option.icon
              const isActive = draftPayoutMethod.type === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    clearPayoutSkip()
                    const nextType = option.value as PayoutMethod["type"]
                    setDraftPayoutMethod((current) => ({
                      ...current,
                      type: nextType,
                      accountName: "",
                      accountNumber:
                        nextType === "bkash" && useOwnerPhoneForBkash
                          ? ownerPhoneForDefaults
                          : "",
                      bankName: "",
                      branchName: "",
                    }))
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${
                    isActive
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "bg-muted/10 hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-background">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{option.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base">Payout Details</CardTitle>
            <CardDescription>
              Required fields depend on the selected payout method.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Account Holder Name</label>
              <Input
                value={draftPayoutMethod.accountName}
                onChange={(event) => {
                  clearPayoutSkip()
                  setDraftPayoutMethod((current) => ({
                    ...current,
                    accountName: event.target.value,
                  }))
                }}
                placeholder="Meet Point"
                disabled={payoutSkipped}
              />
              {revealErrors && errors.accountName ? (
                <p className="text-sm text-destructive">{errors.accountName}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {draftPayoutMethod.type === "bkash"
                  ? "bKash Number"
                  : "Account Number"}
              </label>
              {draftPayoutMethod.type === "bkash" ? (
                <label
                  htmlFor="use-owner-bkash-phone"
                  className="flex items-start gap-3 rounded-2xl border bg-muted/15 p-3 text-sm"
                >
                  <Checkbox
                    id="use-owner-bkash-phone"
                    checked={useOwnerPhoneForBkash}
                    disabled={payoutSkipped}
                    onCheckedChange={(checked) => {
                      const nextValue = checked === true
                      setUseOwnerPhoneForBkash(nextValue)
                      clearPayoutSkip()
                      setDraftPayoutMethod((current) => ({
                        ...current,
                        accountNumber: nextValue ? ownerPhoneForDefaults : "",
                      }))
                    }}
                  />
                  <span>
                    <span className="block font-medium">
                      Use owner phone as bKash number
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      If payout should go to a different bKash wallet, uncheck
                      this and enter that wallet number.
                    </span>
                  </span>
                </label>
              ) : null}
              <Input
                value={
                  draftPayoutMethod.type === "bkash" && useOwnerPhoneForBkash
                    ? ownerPhoneForDefaults
                    : draftPayoutMethod.accountNumber
                }
                onChange={(event) => {
                  clearPayoutSkip()
                  setDraftPayoutMethod((current) => ({
                    ...current,
                    accountNumber:
                      current.type === "bkash"
                        ? sanitizeBangladeshPhoneInput(event.target.value)
                        : event.target.value,
                  }))
                }}
                inputMode={
                  draftPayoutMethod.type === "bkash" ? "numeric" : undefined
                }
                maxLength={draftPayoutMethod.type === "bkash" ? 11 : undefined}
                placeholder={
                  draftPayoutMethod.type === "bkash"
                    ? formatBangladeshPhonePlaceholder()
                    : "0123456789012"
                }
                disabled={
                  payoutSkipped ||
                  (draftPayoutMethod.type === "bkash" && useOwnerPhoneForBkash)
                }
              />
              {revealErrors && errors.accountNumber ? (
                <p className="text-sm text-destructive">
                  {errors.accountNumber}
                </p>
              ) : null}
            </div>

            {draftPayoutMethod.type === "bank" ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Bank Name</label>
                  <Input
                    value={draftPayoutMethod.bankName ?? ""}
                    onChange={(event) => {
                      clearPayoutSkip()
                      setDraftPayoutMethod((current) => ({
                        ...current,
                        bankName: event.target.value,
                      }))
                    }}
                    placeholder="Eastern Bank PLC"
                    disabled={payoutSkipped}
                  />
                  {revealErrors && errors.bankName ? (
                    <p className="text-sm text-destructive">
                      {errors.bankName}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Branch Name</label>
                  <Input
                    value={draftPayoutMethod.branchName ?? ""}
                    onChange={(event) => {
                      clearPayoutSkip()
                      setDraftPayoutMethod((current) => ({
                        ...current,
                        branchName: event.target.value,
                      }))
                    }}
                    placeholder="Netrokona Branch"
                    disabled={payoutSkipped}
                  />
                  {revealErrors && errors.branchName ? (
                    <p className="text-sm text-destructive">
                      {errors.branchName}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            {payoutSkipped ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Payout setup is currently skipped. You can still submit
                onboarding and finish payout details later before your first
                payout is processed.
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  if (payoutSkipped) {
                    clearPayoutSkip()
                    return
                  }

                  markPayoutSkipped("review_submit")
                }}
              >
                {payoutSkipped ? "Resume" : "Skip"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  function renderReviewStep() {
    const allValid = requiredSteps.every((stepId) => validations[stepId].valid)
    const missingBySection = requiredSteps.flatMap((stepId) =>
      Object.values(validations[stepId].errors).map((message) => ({
        stepId,
        message,
      }))
    )

    const summaryCards: Array<{
      id: RequiredOnboardingStepId
      title: string
      description: string
      detail: string
    }> = [
      {
        id: "basic_info" as const,
        title: "Basic Info",
        description: `${draftStoreSettings.name || "No restaurant name"} • ${draftOwnerName || "No owner name"}`,
        detail: `${draftStoreSettings.cuisineType || "Cuisine missing"} • ${draftStoreSettings.tags.length} tags`,
      },
      {
        id: "location" as const,
        title: "Location",
        description: draftStoreSettings.address || "No address provided",
        detail: `${draftStoreSettings.location.city} • ${draftStoreSettings.location.latitude ?? "--"}, ${draftStoreSettings.location.longitude ?? "--"}`,
      },
      {
        id: "hours" as const,
        title: "Opening Hours",
        description: `${draftOpeningHours.weeklySchedule.filter((day) => day.isOpen).length}/7 days open`,
        detail: draftOpeningHours.weeklySchedule
          .filter((day) => day.isOpen)
          .slice(0, 2)
          .map((day) => {
            const slot = day.timeSlots[0]
            return slot
              ? `${weekdayLabels[day.day]} ${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`
              : weekdayLabels[day.day]
          })
          .join(", "),
      },
      {
        id: "payout_setup" as const,
        title: "Payout Setup",
        description:
          draftPayoutMethod.type === "bkash" ? "bKash payout" : "Bank payout",
        detail: draftPayoutMethod.accountName || "Account holder missing",
      },
    ]

    const reviewCards = summaryCards.map((section) => {
      if (section.id === "payout_setup" && payoutSkipped) {
        return {
          ...section,
          description: "Skipped for now",
          detail: "You can complete this after approval before payouts begin.",
        }
      }

      return section
    })

    return (
      <div className="space-y-5">
        <div
          className={`rounded-3xl border px-5 py-4 text-sm ${
            allValid
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {allValid
            ? "Everything required is ready. You can now submit the store for admin review."
            : "Some sections are incomplete. Review the highlighted areas before submitting."}
        </div>

        {!allValid && missingBySection.length > 0 ? (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5">
            <p className="text-sm font-medium text-destructive">
              Missing or invalid fields
            </p>
            <div className="mt-3 grid gap-2">
              {missingBySection.map((issue, index) => {
                const stepTitle =
                  onboardingSteps.find((step) => step.id === issue.stepId)
                    ?.title ?? issue.stepId

                return (
                  <p
                    key={`${issue.stepId}-${index}`}
                    className="text-sm text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">
                      {stepTitle}:
                    </span>{" "}
                    {issue.message}
                  </p>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4">
          {reviewCards.map((section) => {
            const validation = validations[section.id]
            return (
              <Card key={section.id} className="rounded-3xl">
                <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{section.title}</p>
                      <Badge
                        variant="outline"
                        className={
                          validation.valid
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }
                      >
                        {validation.valid ? "Complete" : "Needs attention"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {section.description}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {section.detail}
                    </p>
                    {validation.summary?.length ? (
                      <p className="text-sm text-destructive">
                        {validation.summary.join(" ")}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => goToStep(section.id)}
                  >
                    Edit Section
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }
  void renderReviewStep

  function renderReviewStepPanel() {
    const allValid = requiredSteps.every((stepId) => validations[stepId].valid)
    const missingBySection = requiredSteps.flatMap((stepId) =>
      Object.values(validations[stepId].errors).map((message) => ({
        stepId,
        message,
      }))
    )

    const reviewCards: Array<{
      id: RequiredOnboardingStepId
      title: string
      rows: Array<{ label: string; value: string }>
    }> = [
      {
        id: "basic_info",
        title: "Basic Info",
        rows: [
          {
            label: "Restaurant",
            value: draftStoreSettings.name.trim() || "Not added yet",
          },
          {
            label: "Owner",
            value: draftOwnerName.trim() || "Not added yet",
          },
          {
            label: "Cuisine",
            value: draftStoreSettings.cuisineType.trim() || "Not selected yet",
          },
          {
            label: "Tags",
            value: draftStoreSettings.tags.length
              ? draftStoreSettings.tags.join(", ")
              : "No tags added",
          },
          {
            label: "Prep Time",
            value: `${draftStoreSettings.orderSettings.preparationTimeMinutes} min`,
          },
        ],
      },
      {
        id: "location",
        title: "Location",
        rows: [
          {
            label: "Address",
            value: draftStoreSettings.address.trim() || "Not added yet",
          },
          {
            label: "City",
            value: draftStoreSettings.location.city || "Not selected yet",
          },
          {
            label: "Coordinates",
            value:
              draftStoreSettings.location.latitude !== null &&
              draftStoreSettings.location.longitude !== null
                ? `${draftStoreSettings.location.latitude}, ${draftStoreSettings.location.longitude}`
                : "Not added yet",
          },
        ],
      },
      {
        id: "hours",
        title: "Opening Hours",
        rows: [
          {
            label: "Open Days",
            value: `${draftOpeningHours.weeklySchedule.filter((day) => day.isOpen).length}/7 days open`,
          },
          {
            label: "Sample Hours",
            value:
              draftOpeningHours.weeklySchedule
                .filter((day) => day.isOpen)
                .slice(0, 2)
                .map((day) => {
                  const slot = day.timeSlots[0]
                  return slot
                    ? `${weekdayLabels[day.day]} ${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`
                    : weekdayLabels[day.day]
                })
                .join(" | ") || "No schedule added yet",
          },
        ],
      },
      payoutSkipped
        ? {
            id: "payout_setup",
            title: "Payout Setup",
            rows: [
              { label: "Status", value: "Skipped for now" },
              {
                label: "Next Step",
                value:
                  "You can complete this after approval before payouts begin.",
              },
            ],
          }
        : {
            id: "payout_setup",
            title: "Payout Setup",
            rows: [
              {
                label: "Method",
                value:
                  draftPayoutMethod.type === "bkash"
                    ? "bKash payout"
                    : "Bank payout",
              },
              {
                label: "Account Holder",
                value: draftPayoutMethod.accountName.trim() || "Not added yet",
              },
              {
                label: "Account",
                value:
                  draftPayoutMethod.accountNumber.trim() || "Not added yet",
              },
            ],
          },
    ]

    return (
      <div className="space-y-5">
        <div
          className={`rounded-3xl border px-5 py-4 text-sm ${
            allValid
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {allValid
            ? "Everything required is ready. You can now submit the store for admin review."
            : "Some sections are incomplete. Review the highlighted areas before submitting."}
        </div>

        {!allValid && missingBySection.length > 0 ? (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5">
            <p className="text-sm font-medium text-destructive">
              Missing or invalid fields
            </p>
            <div className="mt-3 grid gap-2">
              {missingBySection.map((issue, index) => {
                const stepTitle =
                  onboardingSteps.find((step) => step.id === issue.stepId)
                    ?.title ?? issue.stepId

                return (
                  <p
                    key={`${issue.stepId}-${index}`}
                    className="text-sm text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">
                      {stepTitle}:
                    </span>{" "}
                    {issue.message}
                  </p>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4">
          {reviewCards.map((section) => {
            const validation = validations[section.id]
            return (
              <Card key={section.id} className="rounded-3xl">
                <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{section.title}</p>
                      <Badge
                        variant="outline"
                        className={
                          validation.valid
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }
                      >
                        {validation.valid ? "Complete" : "Needs attention"}
                      </Badge>
                    </div>
                    <div className="grid gap-2">
                      {section.rows.map((row) => (
                        <div
                          key={`${section.id}-${row.label}`}
                          className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:gap-3"
                        >
                          <span className="min-w-28 text-muted-foreground">
                            {row.label}
                          </span>
                          <span className="font-medium text-foreground">
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                    {validation.summary?.length ? (
                      <p className="text-sm text-destructive">
                        {validation.summary.join(" ")}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => goToStep(section.id)}
                  >
                    Edit Section
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-28 lg:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Card className="rounded-[30px] border-border/70 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full border bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Restaurant onboarding wizard
                </div>
                <h1 className="text-2xl font-semibold">
                  Set up your store step by step
                </h1>
                <p className="text-sm text-muted-foreground">
                  Save progress anytime, continue later, and submit only when
                  every required section is ready.
                </p>
              </div>
              <div className="min-w-60 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{progress}% complete</span>
                </div>
                <Progress value={progress} className="h-2.5" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <p className="text-sm font-medium">Draft Saved</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {onboardingState.draftSavedAt
                    ? format(
                        new Date(onboardingState.draftSavedAt),
                        "dd MMM yyyy, hh:mm a"
                      )
                    : "Not saved yet"}
                </p>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4">
                <p className="text-sm font-medium">Completed Steps</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {completedSteps.length} of {requiredSteps.length} required
                  sections
                </p>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4">
                <p className="text-sm font-medium">Dashboard Access</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Locked until admin approval after submission
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <Card className="rounded-[28px] shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Setup Steps</CardTitle>
                <CardDescription>
                  Current, completed, and upcoming sections stay visible while
                  you work.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {onboardingSteps.map((step, index) => {
                  const Icon = step.icon
                  const isActive = currentStep === step.id
                  const canOpen = canOpenStep(step.id)
                  const isDone =
                    step.id === "review_submit"
                      ? onboardingState.completedSteps.includes("review_submit")
                      : completedSteps.includes(step.id)

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => {
                        if (!canOpen) return
                        goToStep(step.id)
                      }}
                      disabled={!canOpen}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isActive
                          ? "border-primary bg-primary/5 shadow-sm"
                          : canOpen
                            ? "bg-muted/10 hover:border-primary/30"
                            : "cursor-not-allowed bg-muted/5 opacity-60"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm ${
                            isActive
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : isDone
                                ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                                : "border-border/70 bg-gradient-to-br from-background to-muted/40 text-muted-foreground"
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : isActive ? (
                            <Icon className="h-4 w-4" />
                          ) : (
                            <Circle className="h-4 w-4" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {index + 1}. {step.title}
                          </p>
                          <p className="text-xs leading-5 text-muted-foreground">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          </aside>

          <div className="space-y-5">
            <Card className="rounded-[28px] shadow-sm">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/15 bg-gradient-to-br from-primary/10 to-primary/5 text-primary shadow-sm">
                    <activeStepMeta.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{activeStepMeta.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {activeStepMeta.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {currentStep === "basic_info" ? renderBasicInfoStep() : null}
                {currentStep === "location" ? renderLocationStep() : null}
                {currentStep === "hours" ? renderHoursStep() : null}
                {currentStep === "payout_setup" ? renderPayoutStep() : null}
                {currentStep === "review_submit"
                  ? renderReviewStepPanel()
                  : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="fixed right-0 bottom-0 left-0 z-40 border-t bg-background/96 px-4 py-3 shadow-[0_-12px_40px_rgba(15,23,42,0.08)] backdrop-blur lg:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 rounded-2xl border bg-background px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm text-muted-foreground">
            {currentStepValidation && !currentStepValidation.valid
              ? "Current step needs attention before you can continue."
              : currentStep === "review_submit"
                ? "Review everything once more, then submit to admin."
                : "You can save progress anytime and continue later."}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentIndex === 0}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button variant="outline" onClick={() => persistDraft("draft")}>
              {saveAction === "draft" ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saveAction === "draft" ? "Saving..." : "Save as Draft"}
            </Button>
            {currentStep === "review_submit" ? (
              <Button
                onClick={handleSubmitForReview}
                disabled={saveAction !== "idle"}
              >
                {saveAction === "submit" ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <BadgeCheck className="mr-2 h-4 w-4" />
                )}
                {saveAction === "submit"
                  ? "Submitting..."
                  : "Submit for Review"}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={saveAction !== "idle"}>
                {saveAction === "next" ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {saveAction === "next" ? "Saving..." : "Next"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
