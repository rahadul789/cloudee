import * as React from "react"
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Phone,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { AuthFieldMessage, AuthShell } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  formatBangladeshPhonePlaceholder,
  isValidBangladeshPhone,
  normalizeBangladeshPhone,
  sanitizeBangladeshPhoneInput,
} from "@/lib/phone"
import { setOwnerAuthSession } from "@/lib/auth-session"
import { useOwnerSigninMutation } from "@/hooks/use-owner-api"
import { useAppStore } from "@/store/app-store"

function isPhoneIdentifier(value: string) {
  return isValidBangladeshPhone(value)
}

function isRateLimitMessage(message: string) {
  return /^too many /i.test(message.trim())
}

export function OwnerSignInPage() {
  const navigate = useNavigate()
  const setOwnerAccount = useAppStore((state) => state.setOwnerAccount)
  const setRestaurantLifecycleStatus = useAppStore(
    (state) => state.setRestaurantLifecycleStatus
  )

  const [identifier, setIdentifier] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [submitError, setSubmitError] = React.useState("")
  const ownerSigninMutation = useOwnerSigninMutation()
  const isLoading = ownerSigninMutation.isPending

  function validate() {
    const nextErrors: Record<string, string> = {}

    if (!identifier.trim()) {
      nextErrors.identifier = "Enter your phone number."
    } else if (!isPhoneIdentifier(identifier.trim())) {
      nextErrors.identifier = "Use a valid 11-digit phone number."
    }

    if (!password.trim()) {
      nextErrors.password = "Password is required."
    } else if (password.trim().length < 6) {
      nextErrors.password = "Password must be at least 6 characters."
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!validate()) return
    setSubmitError("")

    try {
      const result = await ownerSigninMutation.mutateAsync({
        phone: normalizeBangladeshPhone(identifier.trim()),
        password: password.trim(),
      })

      setOwnerAuthSession({
        accessToken: result.accessToken,
      })
      setOwnerAccount((current) => ({
        ...current,
        ownerName: result.owner.fullName,
        phone: result.owner.phone,
        pendingPhone: "",
        isAuthenticated: true,
        isPhoneVerified: result.owner.isPhoneVerified,
        lastLoginAt: new Date().toISOString(),
      }))
      setRestaurantLifecycleStatus(result.restaurantLifecycleStatus)
      toast.success("Signed in successfully.")
      navigate("/", { replace: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to sign in right now."
      setSubmitError(message)
      toast.error("Sign in failed", {
        description: message,
      })
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to continue managing your restaurant, orders, and onboarding progress."
      footer="Restaurant owner access is created by Foodbela admin."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="signin-identifier">Phone Number</Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="signin-identifier"
              autoFocus
              className="h-12 rounded-2xl pl-10"
              placeholder={formatBangladeshPhonePlaceholder()}
              value={identifier}
              onChange={(event) => {
                setIdentifier(sanitizeBangladeshPhoneInput(event.target.value))
                if (errors.identifier || submitError) {
                  setErrors((current) => ({ ...current, identifier: "" }))
                  setSubmitError("")
                }
              }}
              aria-invalid={!!errors.identifier}
              inputMode="numeric"
              maxLength={11}
            />
          </div>
          <AuthFieldMessage error={errors.identifier} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="signin-password">Password</Label>
            <Link
              to="/auth/forgot-password"
              className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="signin-password"
              type={showPassword ? "text" : "password"}
              className="h-12 rounded-2xl pl-10 pr-11"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                if (errors.password || submitError) {
                  setErrors((current) => ({ ...current, password: "" }))
                  setSubmitError("")
                }
              }}
              aria-invalid={!!errors.password}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <AuthFieldMessage error={errors.password} />
        </div>

        <AuthFieldMessage
          error={submitError}
          className={
            isRateLimitMessage(submitError)
              ? "rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              : "rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm"
          }
        />

        <Button
          type="submit"
          className="h-12 w-full rounded-2xl"
          disabled={isLoading}
        >
          {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          {isLoading ? "Signing in..." : "Sign In"}
          {!isLoading ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
        </Button>

        <p className="text-center text-xs leading-5 text-muted-foreground">
          By continuing, you agree to the{" "}
          <Link
            to="/privacy-policy"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  )
}
