import * as React from "react"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { AuthFieldMessage, AuthShell } from "@/components/auth/auth-shell"
import { getDefaultPasswordResetState } from "@/lib/backend-mappers"
import { useResetPasswordMutation } from "@/hooks/use-owner-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAppStore } from "@/store/app-store"

function getPasswordStrengthLabel(password: string) {
  if (password.length >= 10) return "Strong"
  if (password.length >= 8) return "Good"
  if (password.length >= 6) return "Fair"
  return "Too short"
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const passwordResetState = useAppStore((state) => state.passwordResetState)
  const setPasswordResetState = useAppStore((state) => state.setPasswordResetState)

  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [showNewPassword, setShowNewPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [submitError, setSubmitError] = React.useState("")
  const resetPasswordMutation = useResetPasswordMutation()
  const isLoading = resetPasswordMutation.isPending

  const passwordStrength = getPasswordStrengthLabel(newPassword)
  const passwordProgress = Math.min(Math.round((newPassword.length / 10) * 100), 100)

  function validate() {
    const nextErrors: Record<string, string> = {}

    if (!newPassword.trim()) {
      nextErrors.newPassword = "New password is required."
    } else if (newPassword.trim().length < 6) {
      nextErrors.newPassword = "Password must be at least 6 characters."
    }

    if (!confirmPassword.trim()) {
      nextErrors.confirmPassword = "Please confirm the new password."
    } else if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = "Passwords do not match."
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!validate()) return
    setSubmitError("")

    try {
      if (!passwordResetState.verificationSessionId) {
        throw new Error("Reset verification session is missing.")
      }

      await resetPasswordMutation.mutateAsync({
        verificationSessionId: passwordResetState.verificationSessionId,
        newPassword: newPassword.trim(),
      })
      // Navigate to sign-in first, then clear the reset state. Clearing before
      // navigating re-renders ResetPasswordRoute with an empty session, whose
      // guard redirects to /auth/forgot-password and wins the race.
      toast.success("Password reset successful. Sign in with the new password.")
      navigate("/auth/signin", { replace: true })
      setPasswordResetState(getDefaultPasswordResetState())
    } catch (resetError) {
      const message =
        resetError instanceof Error
          ? resetError.message
          : "Unable to reset your password right now."
      setSubmitError(message)
      toast.error("Password reset failed", {
        description: message,
      })
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      description="Create a fresh password for your owner account. Keep it strong and easy to remember."
      footer={
        <>
          Need to restart the flow?{" "}
          <Link
            to="/auth/forgot-password"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Request a new code
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="reset-new-password">New Password</Label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="reset-new-password"
              type={showNewPassword ? "text" : "password"}
              className="h-12 rounded-2xl pl-10 pr-11"
              placeholder="At least 6 characters"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value)
                if (errors.newPassword || submitError) {
                  setErrors((current) => ({ ...current, newPassword: "" }))
                  setSubmitError("")
                }
              }}
              aria-invalid={!!errors.newPassword}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((current) => !current)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
            >
              {showNewPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <AuthFieldMessage error={errors.newPassword} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reset-confirm-password">Confirm Password</Label>
          <div className="relative">
            <CheckCircle2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="reset-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              className="h-12 rounded-2xl pl-10 pr-11"
              placeholder="Repeat the new password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value)
                if (errors.confirmPassword || submitError) {
                  setErrors((current) => ({ ...current, confirmPassword: "" }))
                  setSubmitError("")
                }
              }}
              aria-invalid={!!errors.confirmPassword}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((current) => !current)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <AuthFieldMessage error={errors.confirmPassword} />
        </div>

        <div className="rounded-2xl border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Password strength</p>
            <p className="text-sm text-muted-foreground">{passwordStrength}</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${passwordProgress}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Use at least 8 characters for a stronger password.
          </p>
        </div>

        <AuthFieldMessage
          error={submitError}
          className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm"
        />

        <Button
          type="submit"
          className="h-12 w-full rounded-2xl"
          disabled={isLoading}
        >
          {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          {isLoading ? "Resetting password..." : "Reset Password"}
          {!isLoading ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
        </Button>

        <Button asChild variant="ghost" className="w-full rounded-2xl">
          <Link to="/auth/reset-verify">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to verification
          </Link>
        </Button>
      </form>
    </AuthShell>
  )
}
