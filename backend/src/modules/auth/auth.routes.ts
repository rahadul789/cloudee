import { Router } from "express"
import {
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
  refreshOwnerAuthSession,
  resetOwnerPassword,
  sendOtp,
  verifyOtp
} from "./auth.controller"

export const authRouter = Router()
const ownerSignupLimiter = createSignupLimiter()
const ownerSigninLimiter = createSigninLimiter()
const otpSendLimiter = createOtpSendLimiter()
const otpVerifyLimiter = createOtpVerifyLimiter()
const passwordRecoveryLimiter = createPasswordRecoveryLimiter()
const refreshLimiter = createRefreshLimiter()

authRouter.post("/owner/signup", ownerSignupLimiter, ownerSignup)
authRouter.post("/owner/signin", ownerSigninLimiter, ownerSignin)
authRouter.post("/owner/otp/signin/start", otpSendLimiter, ownerOtpSigninStart)
authRouter.post("/owner/otp/signin/verify", otpVerifyLimiter, ownerOtpSigninVerify)
authRouter.post("/owner/refresh", refreshLimiter, refreshOwnerAuthSession)
authRouter.post("/owner/logout", ownerLogout)
authRouter.post("/otp/send", otpSendLimiter, sendOtp)
authRouter.post("/otp/verify", otpVerifyLimiter, verifyOtp)
authRouter.post("/owner/password/forgot", passwordRecoveryLimiter, ownerMobileForgotPassword)
authRouter.post("/password/forgot", passwordRecoveryLimiter, forgotPassword)
authRouter.post("/password/reset", passwordRecoveryLimiter, resetOwnerPassword)
