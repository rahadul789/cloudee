import * as React from "react"
import { ArrowLeft, BadgeCheck, LoaderCircle, RefreshCw } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { AuthFieldMessage, AuthShell } from "@/components/auth/auth-shell"
import {
  useForgotPasswordMutation,
  useVerifyOtpMutation,
} from "@/hooks/use-owner-api"
import { Button } from "@/components/ui/button"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { getOtpSupportHint } from "@/lib/otp-copy"
import { resolveOtpResendSeconds } from "@/lib/otp-timing"
import { useAppStore } from "@/store/app-store"

const OTP_LENGTH = 4

function maskIdentifier(identifier: string, channel: "phone" | "email" | null) {
  if (!identifier) return "your contact method"

  if (channel === "phone") {
    return `${identifier.slice(0, 4)}****${identifier.slice(-3)}`
  }

  const [name, domain] = identifier.split("@")
  if (!name || !domain) return identifier
  return `${name.slice(0, 2)}***@${domain}`
}

export function ResetVerificationPage() {
  const navigate = useNavigate()
  const passwordResetState = useAppStore((state) => state.passwordResetState)
  const setPasswordResetState = useAppStore(
    (state) => state.setPasswordResetState
  )

  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState("")
  const [submitError, setSubmitError] = React.useState("")
  const [secondsLeft, setSecondsLeft] = React.useState(() =>
    resolveOtpResendSeconds(passwordResetState.resendAvailableInSeconds)
  )
  const [isResending, setIsResending] = React.useState(false)
  const verifyOtpMutation = useVerifyOtpMutation()
  const forgotPasswordMutation = useForgotPasswordMutation()
  const isLoading = verifyOtpMutation.isPending

  React.useEffect(() => {
    if (secondsLeft <= 0) return

    const timer = window.setTimeout(() => {
      setSecondsLeft((current) => current - 1)
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault()

    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code.trim())) {
      setError(`Enter the ${OTP_LENGTH}-digit verification code.`)
      return
    }

    setError("")
    setSubmitError("")
    try {
      if (!passwordResetState.verificationSessionId) {
        throw new Error("Reset verification session is missing.")
      }

      await verifyOtpMutation.mutateAsync({
        verificationSessionId: passwordResetState.verificationSessionId,
        otpCode: code.trim(),
      })
      setPasswordResetState((current) => ({
        ...current,
        otpVerified: true,
      }))
      toast.success("Verification successful. Create a new password.")
      navigate("/auth/reset-password")
    } catch (verificationError) {
      const message =
        verificationError instanceof Error
          ? verificationError.message
          : "Unable to verify the OTP."
      setSubmitError(message)
    }
  }

  async function handleResend() {
    setIsResending(true)
    try {
      const result = await forgotPasswordMutation.mutateAsync({
        phone: passwordResetState.identifier,
      })
      setPasswordResetState((current) => ({
        ...current,
        verificationSessionId: result.verificationSessionId,
        requestedAt: new Date().toISOString(),
        resendAvailableInSeconds: resolveOtpResendSeconds(
          result.resendAvailableInSeconds
        ),
      }))
      setSecondsLeft(resolveOtpResendSeconds(result.resendAvailableInSeconds))
      setError("")
      setSubmitError("")
      toast.success("A fresh verification code has been sent.")
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to resend the OTP."
      toast.error("Resend failed", {
        description: message,
      })
    } finally {
      setIsResending(false)
    }
  }

  const otpComplete = code.length === OTP_LENGTH

  return (
    <AuthShell
      title="Verify your identity"
      description={`Enter the ${OTP_LENGTH}-digit code we sent so we can safely continue to password reset.`}
      footer={
        <>
          Want to use a different contact?{" "}
          <Link
            to="/auth/forgot-password"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Start again
          </Link>
        </>
      }
    >
      <form onSubmit={handleVerify} className="space-y-6">
        <div className="rounded-2xl border bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">
            Verification code sent to
          </p>
          <p className="mt-1 text-base font-medium">
            {maskIdentifier(
              passwordResetState.identifier,
              passwordResetState.channel
            )}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Enter OTP</p>
            <p className="text-xs text-muted-foreground">
              {otpComplete ? "Code complete" : `${code.length}/${OTP_LENGTH} digits`}
            </p>
          </div>

          <InputOTP
            maxLength={OTP_LENGTH}
            value={code}
            onChange={(value) => {
              setCode(value.replace(/\D/g, "").slice(0, OTP_LENGTH))
              if (error || submitError) {
                setError("")
                setSubmitError("")
              }
            }}
            containerClassName="justify-center"
          >
            <InputOTPGroup className="gap-2 rounded-none border-0">
              {Array.from({ length: OTP_LENGTH }).map((_, index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className="size-12 rounded-2xl border border-input text-base shadow-sm first:rounded-2xl first:border last:rounded-2xl"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>

          <AuthFieldMessage
            error={error}
            hint={getOtpSupportHint()}
            className="text-center"
          />
        </div>

        <AuthFieldMessage
          error={submitError}
          className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-center text-sm"
        />

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="submit"
            className="h-12 flex-1 rounded-2xl"
            disabled={!otpComplete || isLoading}
          >
            {isLoading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : null}
            {isLoading ? "Verifying..." : "Verify Code"}
            {!isLoading ? <BadgeCheck className="ml-2 h-4 w-4" /> : null}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-2xl"
            onClick={handleResend}
            disabled={secondsLeft > 0 || isResending}
          >
            {isResending ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {isResending
              ? "Resending..."
              : secondsLeft > 0
                ? `Resend in ${secondsLeft}s`
                : "Resend OTP"}
          </Button>
        </div>

        <Button asChild variant="ghost" className="w-full rounded-2xl">
          <Link to="/auth/forgot-password">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
      </form>
    </AuthShell>
  )
}
