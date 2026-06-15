import * as React from "react"
import { ArrowLeft, ArrowRight, LoaderCircle, Phone } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { AuthFieldMessage, AuthShell } from "@/components/auth/auth-shell"
import { useForgotPasswordMutation } from "@/hooks/use-owner-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  formatBangladeshPhonePlaceholder,
  isValidBangladeshPhone,
  normalizeBangladeshPhone,
  sanitizeBangladeshPhoneInput,
} from "@/lib/phone"
import { getOtpDeliveryHint } from "@/lib/otp-copy"
import { resolveOtpResendSeconds } from "@/lib/otp-timing"
import { useAppStore } from "@/store/app-store"

function isPhoneIdentifier(value: string) {
  return isValidBangladeshPhone(value)
}

function isRateLimitMessage(message: string) {
  return /^too many /i.test(message.trim())
}

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const setPasswordResetState = useAppStore((state) => state.setPasswordResetState)

  const [identifier, setIdentifier] = React.useState("")
  const [error, setError] = React.useState("")
  const [submitError, setSubmitError] = React.useState("")
  const forgotPasswordMutation = useForgotPasswordMutation()
  const isLoading = forgotPasswordMutation.isPending

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const normalized = identifier.trim()

    if (!normalized) {
      setError("Enter your phone number.")
      return
    }

    if (!isPhoneIdentifier(normalized)) {
      setError("Use a valid 11-digit phone number.")
      return
    }

    setError("")
    setSubmitError("")
    try {
      const result = await forgotPasswordMutation.mutateAsync({
        phone: normalizeBangladeshPhone(normalized),
      })
      setPasswordResetState({
        identifier: normalizeBangladeshPhone(normalized),
        channel: "phone",
        verificationSessionId: result.verificationSessionId,
        otpVerified: false,
        requestedAt: new Date().toISOString(),
        resendAvailableInSeconds: resolveOtpResendSeconds(result.resendAvailableInSeconds),
      })
      toast.success("Verification code sent.")
      navigate("/auth/reset-verify")
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to send the reset code."
      setSubmitError(message)
      toast.error("Request failed", {
        description: message,
      })
    }
  }

  return (
    <AuthShell
      title="Forgot password?"
      description="Enter your owner phone number. We will send a verification code so you can reset the password securely."
      footer={
        <>
          Remembered your password?{" "}
          <Link
            to="/auth/signin"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="forgot-identifier">Phone Number</Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="forgot-identifier"
              autoFocus
              className="h-12 rounded-2xl pl-10"
              placeholder={formatBangladeshPhonePlaceholder()}
              value={identifier}
              onChange={(event) => {
                setIdentifier(sanitizeBangladeshPhoneInput(event.target.value))
                if (error || submitError) {
                  setError("")
                  setSubmitError("")
                }
              }}
              aria-invalid={!!error}
              inputMode="numeric"
              maxLength={11}
            />
          </div>
          <AuthFieldMessage
            error={error}
            hint="We will send the reset OTP to your verified owner phone number."
          />
        </div>

        <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
          {getOtpDeliveryHint()}
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
          {isLoading ? "Sending code..." : "Send Verification Code"}
          {!isLoading ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
        </Button>

        <Button asChild variant="ghost" className="w-full rounded-2xl">
          <Link to="/auth/signin">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to sign in
          </Link>
        </Button>
      </form>
    </AuthShell>
  )
}
