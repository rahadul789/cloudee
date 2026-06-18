import * as React from "react"
import { ArrowLeft, BadgeCheck, RefreshCw } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { AuthFieldMessage, AuthShell } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { getOtpSupportHint } from "@/lib/otp-copy"
import { DEFAULT_OTP_RESEND_SECONDS } from "@/lib/otp-timing"
import { useAppStore } from "@/store/app-store"

const RESEND_SECONDS = DEFAULT_OTP_RESEND_SECONDS
const OTP_LENGTH = 4

function maskPhoneNumber(phone: string) {
  if (!phone) return "your phone number"
  if (phone.length <= 4) return phone
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

export function PhoneVerificationPage() {
  const navigate = useNavigate()
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const setOwnerAccount = useAppStore((state) => state.setOwnerAccount)
  const setStoreSettings = useAppStore((state) => state.setStoreSettings)
  const payoutMethod = useAppStore((state) => state.payoutMethod)
  const setPayoutMethod = useAppStore((state) => state.setPayoutMethod)
  const restaurantLifecycleStatus = useAppStore(
    (state) => state.restaurantLifecycleStatus
  )
  const setRestaurantLifecycleStatus = useAppStore(
    (state) => state.setRestaurantLifecycleStatus
  )

  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [secondsLeft, setSecondsLeft] = React.useState(RESEND_SECONDS)
  const verifyTimerRef = React.useRef<number | null>(null)

  React.useEffect(
    () => () => {
      if (verifyTimerRef.current !== null) {
        window.clearTimeout(verifyTimerRef.current)
      }
    },
    []
  )

  React.useEffect(() => {
    if (secondsLeft <= 0) return

    const timer = window.setTimeout(() => {
      setSecondsLeft((current) => current - 1)
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  function resolveNextPath() {
    if (payoutMethod.pendingAccountNumber) {
      if (payoutMethod.verificationSource === "settings") return "/settings"
      if (payoutMethod.verificationSource === "payouts") return "/payouts"
      return "/onboarding"
    }
    if (restaurantLifecycleStatus === "approved") return "/account"
    if (
      restaurantLifecycleStatus === "submitted" ||
      restaurantLifecycleStatus === "under_review" ||
      restaurantLifecycleStatus === "rejected"
    ) {
      return "/review-status"
    }
    return "/onboarding"
  }

  function handleVerify(event: React.FormEvent) {
    event.preventDefault()

    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code.trim())) {
      setError(`Enter the ${OTP_LENGTH}-digit verification code.`)
      return
    }

    setError("")
    setIsLoading(true)

    if (verifyTimerRef.current !== null) {
      window.clearTimeout(verifyTimerRef.current)
    }

    verifyTimerRef.current = window.setTimeout(() => {
      if (payoutMethod.pendingAccountNumber) {
        setPayoutMethod((current) => ({
          ...current,
          pendingVerificationStatus: "admin_pending",
          pendingVerifiedAt: new Date().toISOString(),
          pendingAdminNote: "",
        }))
        toast.success("bKash number verified.", {
          description:
            "Admin approval is required before the new number becomes active.",
        })
      } else {
        setOwnerAccount((current) => ({
          ...current,
          phone: current.pendingPhone || current.phone,
          pendingPhone: "",
          isPhoneVerified: true,
        }))
        setStoreSettings((current) => ({
          ...current,
          phone: ownerAccount.pendingPhone || current.phone,
        }))
        toast.success("Phone verified. Continue with onboarding.")
      }
      if (
        !payoutMethod.pendingAccountNumber &&
        restaurantLifecycleStatus === "account_created"
      ) {
        setRestaurantLifecycleStatus("phone_verified")
      }
      setIsLoading(false)
      verifyTimerRef.current = null
      navigate(resolveNextPath())
    }, 650)
  }

  function handleResend() {
    setSecondsLeft(RESEND_SECONDS)
    setError("")
    toast.success("A fresh OTP has been sent.")
  }

  const otpComplete = code.length === OTP_LENGTH

  return (
    <AuthShell
      title="Verify your phone"
      description={`We sent a secure ${OTP_LENGTH}-digit OTP. Enter it below to continue into restaurant onboarding.`}
      footer={
        <>
          Need a different number?{" "}
          <Link
            to="/auth/signin"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>{" "}
          or review the{" "}
          <Link
            to="/privacy-policy"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Privacy Policy
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
            {maskPhoneNumber(
              payoutMethod.pendingAccountNumber ||
                ownerAccount.pendingPhone ||
                ownerAccount.phone
            )}
            {payoutMethod.pendingAccountNumber ? (
              <span className="block text-xs font-normal text-muted-foreground">
                Verifying your pending bKash payout number
              </span>
            ) : ownerAccount.pendingPhone ? (
              <span className="block text-xs font-normal text-muted-foreground">
                Updating to {maskPhoneNumber(ownerAccount.pendingPhone)}
              </span>
            ) : null}
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

        <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
          Dashboard access stays locked until onboarding is submitted and later
          approved by admin.
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="submit"
            className="h-12 flex-1 rounded-2xl"
            disabled={!otpComplete || isLoading}
          >
            {isLoading ? "Verifying..." : "Verify & Continue"}
            {!isLoading ? <BadgeCheck className="ml-2 h-4 w-4" /> : null}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-2xl"
            onClick={handleResend}
            disabled={secondsLeft > 0}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend OTP"}
          </Button>
        </div>

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
