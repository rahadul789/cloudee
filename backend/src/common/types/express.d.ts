import type { AuthRole } from "../constants/auth"

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        role: AuthRole
        restaurantId?: string
      }
    }
  }
}

export {}
