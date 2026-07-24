import { Router } from "express"
import {
  createOtpSendIpLimiter,
  createOtpSendLimiter,
  createOtpVerifyLimiter,
  createPasswordRecoveryLimiter,
  createRefreshLimiter,
  createSigninLimiter,
  createSignupLimiter
} from "../../common/middleware/rate-limit"

import {
  forgotPassword,
  ownerMobileForgotPassword,
  ownerLogout,
  ownerOtpSigninStart,
  ownerOtpSigninVerify,
  ownerSignin,
  ownerSignup,
  redeemOwnerImpersonationSession,
  refreshOwnerAuthSession,
  resetOwnerPassword,
  sendOtp,
  verifyOtp
} from "./auth.controller"

export const authRouter = Router()
const ownerSignupLimiter = createSignupLimiter("owner")
const ownerSigninLimiter = createSigninLimiter("owner")
const otpSendLimiter = createOtpSendLimiter("owner")
const otpSendIpLimiter = createOtpSendIpLimiter("owner")
const otpVerifyLimiter = createOtpVerifyLimiter("owner")
const passwordRecoveryLimiter = createPasswordRecoveryLimiter("owner")
const refreshLimiter = createRefreshLimiter("owner")

authRouter.post("/owner/signup", otpSendIpLimiter, ownerSignupLimiter, ownerSignup)
authRouter.post("/owner/signin", ownerSigninLimiter, ownerSignin)
authRouter.post("/owner/otp/signin/start", otpSendIpLimiter, otpSendLimiter, ownerOtpSigninStart)
authRouter.post("/owner/otp/signin/verify", otpVerifyLimiter, ownerOtpSigninVerify)
authRouter.post("/owner/refresh", refreshLimiter, refreshOwnerAuthSession)
authRouter.post("/owner/impersonation/redeem", refreshLimiter, redeemOwnerImpersonationSession)
authRouter.post("/owner/logout", ownerLogout)
authRouter.post("/otp/send", otpSendIpLimiter, otpSendLimiter, sendOtp)
authRouter.post("/otp/verify", otpVerifyLimiter, verifyOtp)
authRouter.post("/owner/password/forgot", otpSendIpLimiter, passwordRecoveryLimiter, ownerMobileForgotPassword)
authRouter.post("/password/forgot", otpSendIpLimiter, passwordRecoveryLimiter, forgotPassword)
authRouter.post("/password/reset", passwordRecoveryLimiter, resetOwnerPassword)
