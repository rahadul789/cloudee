import * as React from "react"
import { BadgeCheck, LoaderCircle, RefreshCw, ShieldCheck, X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { api } from "@/lib/api"
import { setOwnerAuthSession } from "@/lib/auth-session"
import { getOtpSupportHint } from "@/lib/otp-copy"
import {
  DEFAULT_OTP_RESEND_SECONDS,
  resolveOtpResendSeconds,
} from "@/lib/otp-timing"
import {
  useOwnerSigninMutation,
  useVerifyOtpMutation,
} from "@/hooks/use-owner-api"
import { useAppStore } from "@/store/app-store"

const RESEND_SECONDS = DEFAULT_OTP_RESEND_SECONDS
const OTP_LENGTH = 4

function maskPhoneNumber(phone: string) {
  if (!phone) return "your phone number"
  if (phone.length <= 4) return phone
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

export function VerificationModalHost() {
  const navigate = useNavigate()
  const verificationModalOpen = useAppStore(
    (state) => state.verificationModalOpen
  )
  const setVerificationModalOpen = useAppStore(
    (state) => state.setVerificationModalOpen
  )
  const verificationRequest = useAppStore((state) => state.verificationRequest)
  const setVerificationRequest = useAppStore(
    (state) => state.setVerificationRequest
  )
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const payoutMethod = useAppStore((state) => state.payoutMethod)
  const setOwnerAccount = useAppStore((state) => state.setOwnerAccount)
  const setStoreSettings = useAppStore((state) => state.setStoreSettings)
  const setPayoutMethod = useAppStore((state) => state.setPayoutMethod)
  const restaurantLifecycleStatus = useAppStore(
    (state) => state.restaurantLifecycleStatus
  )
  const setRestaurantLifecycleStatus = useAppStore(
    (state) => state.setRestaurantLifecycleStatus
  )
  const verifyOtpMutation = useVerifyOtpMutation()
  const ownerSigninMutation = useOwnerSigninMutation()

  const requiresVerification = Boolean(
    verificationModalOpen &&
    (Boolean(verificationRequest.verificationSessionId) ||
      (ownerAccount.isAuthenticated &&
        (Boolean(ownerAccount.pendingPhone) ||
          (Boolean(payoutMethod.pendingAccountNumber) &&
            (!payoutMethod.pendingVerificationStatus ||
              payoutMethod.pendingVerificationStatus === "otp_pending")) ||
          (!ownerAccount.isPhoneVerified &&
            restaurantLifecycleStatus === "account_created"))))
  )

  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [secondsLeft, setSecondsLeft] = React.useState(() =>
    resolveOtpResendSeconds(verificationRequest.resendAvailableInSeconds)
  )
  const [isResending, setIsResending] = React.useState(false)

  React.useEffect(() => {
    if (!requiresVerification) {
      setCode("")
      setError("")
      setIsLoading(false)
      setSecondsLeft(RESEND_SECONDS)
      return
    }
    setSecondsLeft(
      resolveOtpResendSeconds(verificationRequest.resendAvailableInSeconds)
    )
  }, [
    requiresVerification,
    verificationRequest.resendAvailableInSeconds,
    verificationRequest.verificationSessionId,
  ])

  React.useEffect(() => {
    if (!requiresVerification || secondsLeft <= 0) return

    const timer = window.setTimeout(() => {
      setSecondsLeft((current) => current - 1)
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [requiresVerification, secondsLeft])

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault()

    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code.trim())) {
      setError(`Enter the ${OTP_LENGTH}-digit verification code.`)
      return
    }

    setError("")
    setIsLoading(true)

    try {
      if (verificationRequest.verificationSessionId) {
        const result = await verifyOtpMutation.mutateAsync({
          verificationSessionId: verificationRequest.verificationSessionId,
          otpCode: code.trim(),
        })

        if (
          verificationRequest.purpose === "owner_signup_verify" &&
          verificationRequest.pendingPassword
        ) {
          const signInResult = await ownerSigninMutation.mutateAsync({
            phone: verificationRequest.phone,
            password: verificationRequest.pendingPassword,
          })

          setOwnerAuthSession({
            accessToken: signInResult.accessToken,
          })
          setOwnerAccount((current) => ({
            ...current,
            ownerName: signInResult.owner.fullName,
            phone: signInResult.owner.phone,
            pendingPhone: "",
            isAuthenticated: true,
            isPhoneVerified: signInResult.owner.isPhoneVerified,
            lastLoginAt: new Date().toISOString(),
          }))
          setRestaurantLifecycleStatus(signInResult.restaurantLifecycleStatus)
          toast.success("Phone verified successfully.")
          navigate("/onboarding")
        } else {
          if (verificationRequest.purpose === "owner_phone_change") {
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
            toast.success("Phone verified successfully.")
          } else if (verificationRequest.purpose === "owner_payout_verify") {
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
            if (result.nextStatus === "phone_verified") {
              setRestaurantLifecycleStatus("phone_verified")
            }
            toast.success("Verification completed successfully.")
          }
        }

        setVerificationRequest({
          verificationSessionId: null,
          purpose: null,
          phone: "",
          referenceId: null,
          pendingPassword: "",
          resendAvailableInSeconds: undefined,
        })
      } else if (payoutMethod.pendingAccountNumber) {
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
        if (restaurantLifecycleStatus === "account_created") {
          setRestaurantLifecycleStatus("phone_verified")
        }
        toast.success("Phone verified successfully.")
      }

      setVerificationModalOpen(false)
      setCode("")
      setSecondsLeft(RESEND_SECONDS)
    } catch (verificationError) {
      const message =
        verificationError instanceof Error
          ? verificationError.message
          : "Unable to complete verification."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleResend() {
    setIsResending(true)
    try {
      if (
        verificationRequest.referenceId &&
        verificationRequest.purpose &&
        verificationTarget
      ) {
        const result = await api.post<{
          verificationSessionId: string
          expiresInSeconds: number
          resendAvailableInSeconds?: number
        }>(
          "/auth/otp/send",
          {
            channel: "phone",
            phone: verificationTarget,
            purpose: verificationRequest.purpose,
            referenceId: verificationRequest.referenceId,
          },
          false
        )

        setVerificationRequest((current) => ({
          ...current,
          verificationSessionId: result.verificationSessionId,
          resendAvailableInSeconds: resolveOtpResendSeconds(
            result.resendAvailableInSeconds
          ),
        }))
        setSecondsLeft(resolveOtpResendSeconds(result.resendAvailableInSeconds))
      } else {
        setSecondsLeft(RESEND_SECONDS)
      }

      setError("")
      toast.success("A fresh OTP has been sent.")
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to resend the OTP right now."
      toast.error("Resend failed", {
        description: message,
      })
    } finally {
      setIsResending(false)
    }
  }

  const otpComplete = code.length === OTP_LENGTH
  const verificationTarget =
    verificationRequest.phone ||
    payoutMethod.pendingAccountNumber ||
    ownerAccount.pendingPhone ||
    ownerAccount.phone
  const canDismissVerification =
    verificationRequest.purpose === "owner_phone_change" ||
    verificationRequest.purpose === "owner_payout_verify" ||
    Boolean(payoutMethod.pendingAccountNumber)

  function handleDismiss() {
    if (!canDismissVerification || isLoading) return
    setVerificationModalOpen(false)
    setVerificationRequest({
      verificationSessionId: null,
      purpose: null,
      phone: "",
      referenceId: null,
      pendingPassword: "",
      resendAvailableInSeconds: undefined,
    })
    setCode("")
    setError("")
    setSecondsLeft(RESEND_SECONDS)
  }

  return (
    <Dialog
      open={requiresVerification}
      onOpenChange={(open) => {
        if (!open) handleDismiss()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[32px] p-0 sm:max-w-[560px]"
      >
        {canDismissVerification ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 z-10 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={handleDismiss}
            disabled={isLoading}
            aria-label="Close verification"
          >
            <X className="size-4" />
          </Button>
        ) : null}
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-6 text-white">
          <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck className="size-5" />
          </div>
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-xl font-semibold text-white">
              Verify your phone
            </DialogTitle>
            <DialogDescription className="max-w-md text-sm leading-6 text-slate-200">
              Enter the secure OTP to continue. We use the same verification
              step for account access and sensitive phone-based changes.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleVerify} className="space-y-6 px-6 py-6">
          <div className="rounded-3xl border bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">
              Verification code sent to
            </p>
            <p className="mt-1 text-base font-semibold">
              {maskPhoneNumber(verificationTarget)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {payoutMethod.pendingAccountNumber
                ? "This verification will activate your pending bKash payout number."
                : verificationRequest.purpose === "owner_signup_verify"
                  ? "Verify your owner account phone number to continue after signup."
                  : verificationRequest.purpose === "owner_phone_change"
                    ? "This verification will replace your current owner account phone number."
                    : verificationRequest.purpose === "owner_payout_verify"
                      ? "This verification will activate your pending bKash payout number."
                      : ownerAccount.pendingPhone
                        ? "This verification will replace your current owner account phone number."
                        : "Verify your owner account phone number to continue after signup."}
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
              onChange={(value) =>
                setCode(value.replace(/\D/g, "").slice(0, OTP_LENGTH))
              }
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

            <div className="space-y-1 text-center">
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {getOtpSupportHint()}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border bg-muted/20 p-4 text-sm text-muted-foreground">
            {canDismissVerification
              ? "You can close this and keep your current number active. The new number activates only after OTP verification."
              : "The modal will close automatically after successful verification."}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="submit"
              className="h-12 flex-1"
              disabled={!otpComplete || isLoading}
            >
              {isLoading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              {isLoading ? "Verifying..." : "Verify & Continue"}
              {!isLoading ? <BadgeCheck className="ml-2 h-4 w-4" /> : null}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12"
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
        </form>
      </DialogContent>
    </Dialog>
  )
}
