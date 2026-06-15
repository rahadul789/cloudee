export type OwnerProfileForm = {
  ownerName: string
  phone: string
  email: string
  profileImageUrl: string
}

export type PasswordForm = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export type OwnerProfileErrors = Partial<
  Record<keyof OwnerProfileForm | keyof PasswordForm, string>
>
