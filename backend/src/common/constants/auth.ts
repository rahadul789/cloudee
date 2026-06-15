export const authRoles = ["owner", "admin", "customer", "rider", "system"] as const

export type AuthRole = (typeof authRoles)[number]
