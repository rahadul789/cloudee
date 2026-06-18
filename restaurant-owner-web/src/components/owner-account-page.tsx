import * as React from "react"
import {
  ArrowRight,
  AtSign,
  Camera,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  Phone,
  Shield,
  Store,
  Trash2,
  UserRound,
  X,
} from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import type {
  OwnerProfileErrors,
  OwnerProfileForm,
  PasswordForm,
} from "@/components/account/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  formatBangladeshPhonePlaceholder,
  isValidBangladeshPhone,
  normalizeBangladeshPhone,
  sanitizeBangladeshPhoneInput,
} from "@/lib/phone"
import { resolveOtpResendSeconds } from "@/lib/otp-timing"
import { calculateProfileCompletion } from "@/lib/store-profile"
import { useUpdateOwnerPasswordMutation, useUpdateOwnerProfileMutation } from "@/hooks/use-owner-api"
import { useAppStore } from "@/store/app-store"

function formatDate(value: string | null) {
  if (!value) return "Not available yet"

  return new Intl.DateTimeFormat("en-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

function ProfileEditDrawer({
  open,
  onOpenChange,
  form,
  errors,
  onChange,
  onUpload,
  onRemoveImage,
  onSave,
  isSaving = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: OwnerProfileForm
  errors: OwnerProfileErrors
  onChange: <K extends keyof OwnerProfileForm>(
    key: K,
    value: OwnerProfileForm[K]
  ) => void
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveImage: () => void
  onSave: () => void
  isSaving?: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-2xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-muted-foreground" />
                Edit Profile
              </SheetTitle>
              <SheetDescription>
                Update owner details used for sign-in, recovery, and support.
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-88px)]">
          <div className="space-y-6 px-6 py-6">
            <div className="flex flex-col gap-5 rounded-2xl border bg-muted/15 p-5 sm:flex-row sm:items-center">
              <Avatar className="h-24 w-24 rounded-3xl border bg-background shadow-sm">
                <AvatarImage src={form.profileImageUrl} alt={form.ownerName} />
                <AvatarFallback className="rounded-3xl text-lg font-semibold">
                  {getInitials(form.ownerName || "Owner")}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-sm font-medium">Profile photo</p>
                  <p className="text-sm text-muted-foreground">
                    JPG, PNG, or WebP up to 5 MB. This helps support verify
                    ownership faster.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl"
                    asChild
                  >
                    <label className="cursor-pointer">
                      <Camera className="mr-2 h-4 w-4" />
                      {form.profileImageUrl ? "Change Photo" : "Upload Photo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={onUpload}
                      />
                    </label>
                  </Button>
                  {form.profileImageUrl ? (
                    <Button
                      type="button"
                      variant="destructive"
                      className="rounded-2xl"
                      onClick={onRemoveImage}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Photo
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="owner-name">Full Name</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="owner-name"
                    className="h-12 rounded-2xl pl-10"
                    placeholder="Owner full name"
                    value={form.ownerName}
                    onChange={(event) => onChange("ownerName", event.target.value)}
                  />
                </div>
                {errors.ownerName ? (
                  <p className="text-sm text-destructive">{errors.ownerName}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner-phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="owner-phone"
                    className="h-12 rounded-2xl pl-10"
                    inputMode="numeric"
                    maxLength={11}
                    placeholder={formatBangladeshPhonePlaceholder()}
                    value={form.phone}
                    onChange={(event) =>
                      onChange(
                        "phone",
                        sanitizeBangladeshPhoneInput(event.target.value)
                      )
                    }
                  />
                </div>
                {errors.phone ? (
                  <p className="text-sm text-destructive">{errors.phone}</p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="owner-email">Email Address</Label>
                <div className="relative">
                  <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="owner-email"
                    type="email"
                    className="h-12 rounded-2xl pl-10"
                    placeholder="owner@example.com"
                    value={form.email}
                    onChange={(event) => onChange("email", event.target.value)}
                  />
                </div>
                {errors.email ? (
                  <p className="text-sm text-destructive">{errors.email}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Optional, but helpful for recovery alerts and support
                    follow-ups.
                  </p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="border-t bg-popover px-6 py-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={isSaving}>
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {isSaving ? "Saving..." : "Save Profile"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function PasswordDrawer({
  open,
  onOpenChange,
  form,
  errors,
  onChange,
  onSave,
  isSaving = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: PasswordForm
  errors: OwnerProfileErrors
  onChange: <K extends keyof PasswordForm>(key: K, value: PasswordForm[K]) => void
  onSave: () => void
  isSaving?: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Change Password
              </SheetTitle>
              <SheetDescription>
                Keep your owner account secure with a fresh password.
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col px-6 py-6">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="current-password"
                  type="password"
                  className="h-12 rounded-2xl pl-10"
                  placeholder="Enter current password"
                  value={form.currentPassword}
                  onChange={(event) =>
                    onChange("currentPassword", event.target.value)
                  }
                />
              </div>
              {errors.currentPassword ? (
                <p className="text-sm text-destructive">
                  {errors.currentPassword}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                className="h-12 rounded-2xl"
                placeholder="At least 6 characters"
                value={form.newPassword}
                onChange={(event) => onChange("newPassword", event.target.value)}
              />
              {errors.newPassword ? (
                <p className="text-sm text-destructive">{errors.newPassword}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                className="h-12 rounded-2xl"
                placeholder="Repeat the new password"
                value={form.confirmPassword}
                onChange={(event) =>
                  onChange("confirmPassword", event.target.value)
                }
              />
              {errors.confirmPassword ? (
                <p className="text-sm text-destructive">
                  {errors.confirmPassword}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-auto border-t bg-popover px-0 pt-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={onSave} disabled={isSaving}>
                {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {isSaving ? "Updating..." : "Update Password"}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function profileSectionRoute(sectionId: string) {
  if (sectionId === "payoutSetup") return "/payouts"
  if (sectionId === "openingHours") return "/hours"
  return "/settings"
}

export function OwnerAccountPage() {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const storeSettings = useAppStore((state) => state.storeSettings)
  const openingHours = useAppStore((state) => state.openingHours)
  const payoutMethod = useAppStore((state) => state.payoutMethod)
  const setOwnerAccount = useAppStore((state) => state.setOwnerAccount)
  const setVerificationRequest = useAppStore(
    (state) => state.setVerificationRequest
  )
  const setVerificationModalOpen = useAppStore(
    (state) => state.setVerificationModalOpen
  )
  const updateOwnerProfileMutation = useUpdateOwnerProfileMutation()
  const updateOwnerPasswordMutation = useUpdateOwnerPasswordMutation()

  const [profileDrawerOpen, setProfileDrawerOpen] = React.useState(false)
  const [passwordDrawerOpen, setPasswordDrawerOpen] = React.useState(false)
  const [profileForm, setProfileForm] = React.useState<OwnerProfileForm>({
    ownerName: ownerAccount.ownerName,
    phone: ownerAccount.phone,
    email: ownerAccount.email,
    profileImageUrl: ownerAccount.profileImageUrl,
  })
  const [passwordForm, setPasswordForm] = React.useState<PasswordForm>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [profileErrors, setProfileErrors] = React.useState<OwnerProfileErrors>(
    {}
  )
  const [passwordErrors, setPasswordErrors] =
    React.useState<OwnerProfileErrors>({})
  const profileImagePreviewUrlRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (
      profileImagePreviewUrlRef.current &&
      ownerAccount.profileImageUrl !== profileImagePreviewUrlRef.current
    ) {
      URL.revokeObjectURL(profileImagePreviewUrlRef.current)
      profileImagePreviewUrlRef.current = null
    }

    setProfileForm({
      ownerName: ownerAccount.ownerName,
      phone: ownerAccount.phone,
      email: ownerAccount.email,
      profileImageUrl: ownerAccount.profileImageUrl,
    })
  }, [
    ownerAccount.email,
    ownerAccount.ownerName,
    ownerAccount.pendingPhone,
    ownerAccount.phone,
    ownerAccount.profileImageUrl,
  ])

  React.useEffect(
    () => () => {
      if (profileImagePreviewUrlRef.current) {
        URL.revokeObjectURL(profileImagePreviewUrlRef.current)
        profileImagePreviewUrlRef.current = null
      }
    },
    []
  )

  const profileCompletion = React.useMemo(
    () =>
      calculateProfileCompletion({
        storeSettings,
        openingHours,
        payoutMethod,
      }),
    [openingHours, payoutMethod, storeSettings]
  )

  function handleProfileChange<K extends keyof OwnerProfileForm>(
    key: K,
    value: OwnerProfileForm[K]
  ) {
    setProfileForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function handlePasswordChange<K extends keyof PasswordForm>(
    key: K,
    value: PasswordForm[K]
  ) {
    setPasswordForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function handleProfileImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Upload a JPG, PNG, or WebP image.")
      event.target.value = ""
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      toast.error("Profile image must be under 5 MB.")
      event.target.value = ""
      return
    }

    if (profileImagePreviewUrlRef.current) {
      URL.revokeObjectURL(profileImagePreviewUrlRef.current)
    }
    const nextUrl = URL.createObjectURL(file)
    profileImagePreviewUrlRef.current = nextUrl
    setProfileForm((current) => ({
      ...current,
      profileImageUrl: nextUrl,
    }))
    toast.success("Profile image updated.")
    event.target.value = ""
  }

  function removeProfileImagePreview() {
    if (profileImagePreviewUrlRef.current) {
      URL.revokeObjectURL(profileImagePreviewUrlRef.current)
      profileImagePreviewUrlRef.current = null
    }
    handleProfileChange("profileImageUrl", "")
  }

  function validateProfile() {
    const nextErrors: OwnerProfileErrors = {}
    const normalizedPhone = normalizeBangladeshPhone(profileForm.phone)
    const normalizedEmail = profileForm.email.trim()

    if (!profileForm.ownerName.trim()) {
      nextErrors.ownerName = "Owner name is required."
    }

    if (!normalizedPhone) {
      nextErrors.phone = "Phone number is required."
    } else if (!isValidBangladeshPhone(normalizedPhone)) {
      nextErrors.phone = "Invalid phone number."
    }

    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      nextErrors.email = "Use a valid email address."
    }

    setProfileErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function validatePassword() {
    const nextErrors: OwnerProfileErrors = {}

    if (!passwordForm.currentPassword.trim()) {
      nextErrors.currentPassword = "Current password is required."
    }

    if (!passwordForm.newPassword.trim()) {
      nextErrors.newPassword = "New password is required."
    } else if (passwordForm.newPassword.trim().length < 6) {
      nextErrors.newPassword = "Use at least 6 characters."
    }

    if (!passwordForm.confirmPassword.trim()) {
      nextErrors.confirmPassword = "Confirm the new password."
    } else if (passwordForm.confirmPassword !== passwordForm.newPassword) {
      nextErrors.confirmPassword = "Passwords do not match."
    }

    setPasswordErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function saveProfile() {
    if (!validateProfile()) {
      toast.error("Please fix the highlighted account fields.")
      return
    }

    const normalizedPhone = normalizeBangladeshPhone(profileForm.phone)
    try {
      const result = await updateOwnerProfileMutation.mutateAsync({
        fullName: profileForm.ownerName.trim(),
        email: profileForm.email.trim(),
        phone: normalizedPhone,
      })

      setOwnerAccount((current) => ({
        ...current,
        ownerName: result.owner.fullName,
        phone: result.owner.phone,
        pendingPhone: result.owner.pendingPhone ?? "",
        email: result.owner.email,
        profileImageUrl: profileForm.profileImageUrl || current.profileImageUrl,
        isPhoneVerified: result.owner.isPhoneVerified,
        createdAt: result.owner.createdAt,
        lastLoginAt: result.owner.lastLoginAt,
      }))
      setProfileDrawerOpen(false)

      if (result.verificationSessionId) {
        setVerificationRequest({
          verificationSessionId: result.verificationSessionId,
          purpose: "owner_phone_change",
          phone: normalizedPhone,
          referenceId: result.owner.id,
          pendingPassword: "",
          resendAvailableInSeconds: resolveOtpResendSeconds(result.resendAvailableInSeconds),
        })
        setVerificationModalOpen(true)
        toast.success("Verify the new phone number to finish the update.")
        return
      }

      toast.success("Owner account updated successfully.")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update profile."
      toast.error("Update failed", {
        description: message,
      })
    }
  }

  async function updatePassword() {
    if (!validatePassword()) {
      toast.error("Please complete the password form correctly.")
      return
    }

    try {
      await updateOwnerPasswordMutation.mutateAsync({
        currentPassword: passwordForm.currentPassword.trim(),
        newPassword: passwordForm.newPassword.trim(),
      })
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      })
      setPasswordErrors({})
      setPasswordDrawerOpen(false)
      toast.success("Password changed successfully.")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update the password right now."
      toast.error("Password update failed", {
        description: message,
      })
    }
  }

  const accountSummary = [
    {
      label: "Phone number",
      value: ownerAccount.phone || "Add your phone number",
    },
    {
      label: "Email address",
      value: ownerAccount.email || "No email added yet",
    },
    {
      label: "Phone verification",
      value: ownerAccount.pendingPhone
        ? `Pending change to ${ownerAccount.pendingPhone}`
        : ownerAccount.isPhoneVerified
          ? "Verified"
          : "Pending",
    },
  ]

  const activitySummary = [
    {
      label: "Account created",
      value: formatDate(ownerAccount.createdAt),
    },
    {
      label: "Last login",
      value: formatDate(ownerAccount.lastLoginAt),
    },
    {
      label: "Security status",
      value: "Password protected",
    },
  ]

  return (
    <>
      <div className="space-y-6 px-4 lg:px-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
          <div className="space-y-6">
            <Card className="overflow-hidden rounded-3xl border-border/70 shadow-sm">
              <CardHeader className="border-b bg-muted/20 p-0">
                <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-7 text-white">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-24 w-24 rounded-3xl border-4 border-white/10 bg-white/10 shadow-lg">
                        <AvatarImage
                          src={ownerAccount.profileImageUrl}
                          alt={ownerAccount.ownerName}
                        />
                        <AvatarFallback className="rounded-3xl bg-white/10 text-lg font-semibold text-white">
                          {getInitials(ownerAccount.ownerName || "Owner")}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 space-y-3">
                        <div className="space-y-1">
                          <CardTitle className="flex items-center gap-2 text-xl text-white">
                            <UserRound className="h-5 w-5 text-white/80" />
                            {ownerAccount.ownerName || "Owner Account"}
                          </CardTitle>
                          <CardDescription className="max-w-xl text-sm leading-6 text-slate-200">
                            Primary owner identity for account access, recovery,
                            support, and business communication.
                          </CardDescription>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
                            {ownerAccount.isPhoneVerified
                              ? "Phone verified"
                              : "Verification pending"}
                          </div>
                          <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
                            Created {formatDate(ownerAccount.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button onClick={() => setProfileDrawerOpen(true)} className="gap-2 self-start bg-white text-slate-900 hover:bg-white/90">
                      <UserRound className="h-4 w-4" />
                      Edit Profile
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border bg-background p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Account Phone
                    </p>
                    <p className="mt-2 text-base font-semibold">
                      {ownerAccount.phone || "Not added"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Used for sign-in and verification.
                    </p>
                  </div>
                  <div className="rounded-2xl border bg-background p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Email Address
                    </p>
                    <p className="mt-2 text-base font-semibold">
                      {ownerAccount.email || "No email added"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Optional recovery and support channel.
                    </p>
                  </div>
                  <div className="rounded-2xl border bg-background p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Verification
                    </p>
                    <p className="mt-2 text-base font-semibold">
                      {ownerAccount.pendingPhone
                        ? "Pending phone change"
                        : ownerAccount.isPhoneVerified
                          ? "Verified"
                          : "Pending"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {ownerAccount.pendingPhone
                        ? `Waiting for OTP on ${ownerAccount.pendingPhone}`
                        : "Security status of your login number."}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {accountSummary.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border bg-muted/15 p-4"
                    >
                      <p className="text-sm text-muted-foreground">{item.label}</p>
                      <p className="mt-2 font-medium">{item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border/70 shadow-sm">
              <CardHeader className="border-b bg-muted/20">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Security
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Keep your account secure and ready for daily owner access.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => setPasswordDrawerOpen(true)}
                  >
                    <Shield className="h-4 w-4" />
                    Change Password
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="rounded-2xl border bg-muted/15 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">Password protected</p>
                      <p className="text-sm text-muted-foreground">
                        Update your password from a dedicated drawer so changes
                        stay focused and easy to review.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-3xl border-border/70 shadow-sm">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle>Profile Completion</CardTitle>
                <CardDescription>
                  Complete your store profile gradually to unlock a stronger
                  storefront presence.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current progress</span>
                  <span className="font-medium">
                    {profileCompletion.percentage}%
                  </span>
                </div>
                <Progress value={profileCompletion.percentage} className="h-2.5" />
                <div className="space-y-3">
                  {profileCompletion.sections.map((section) => (
                    <div
                      key={section.id}
                      className="flex flex-col gap-3 rounded-2xl border bg-muted/15 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">{section.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {section.isComplete ? section.benefit : section.hint}
                        </p>
                      </div>
                      {section.isComplete ? (
                        <div className="text-sm font-medium text-emerald-600">
                          Done
                        </div>
                      ) : (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-8 self-start rounded-xl"
                        >
                          <Link to={profileSectionRoute(section.id)}>
                            Update
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border/70 shadow-sm">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle>Activity</CardTitle>
                <CardDescription>
                  Quick view of account status and recent access details.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                {activitySummary.map((item, index) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm text-muted-foreground">{item.label}</p>
                      <p className="text-right text-sm font-medium">{item.value}</p>
                    </div>
                    {index < activitySummary.length - 1 ? (
                      <Separator className="mt-4" />
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border/70 shadow-sm">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle>Business Info Shortcut</CardTitle>
                <CardDescription>
                  Store information stays separate from owner account details.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="rounded-2xl border bg-muted/15 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/10">
                      <Store className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{storeSettings.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Manage store profile, opening hours, and storefront
                        content.
                      </p>
                    </div>
                  </div>
                </div>

                <Button asChild className="w-full rounded-2xl">
                  <Link to="/settings">
                    Go to Store Settings
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border/70 bg-emerald-50/60 shadow-sm">
              <CardContent className="flex gap-3 p-6">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                <div className="space-y-1">
                  <p className="font-medium text-emerald-900">
                    Account looks healthy
                  </p>
                  <p className="text-sm text-emerald-800/80">
                    Your account details stay readable by default, while focused
                    drawers keep edits clean and safe for daily use.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ProfileEditDrawer
        open={profileDrawerOpen}
        onOpenChange={setProfileDrawerOpen}
        form={profileForm}
        errors={profileErrors}
        onChange={handleProfileChange}
        onUpload={handleProfileImageUpload}
        onRemoveImage={removeProfileImagePreview}
        onSave={saveProfile}
        isSaving={updateOwnerProfileMutation.isPending}
      />

      <PasswordDrawer
        open={passwordDrawerOpen}
        onOpenChange={setPasswordDrawerOpen}
        form={passwordForm}
        errors={passwordErrors}
        onChange={handlePasswordChange}
        onSave={updatePassword}
        isSaving={updateOwnerPasswordMutation.isPending}
      />
    </>
  )
}
