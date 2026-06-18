export type StoreNotificationSettings = {
  newOrder: boolean
  cancellation: boolean
}

export type StoreOrderSettings = {
  autoAcceptOrders: boolean
  preparationTimeMinutes: number
}

export type StoreLocationSettings = {
  city: string
  latitude: number | null
  longitude: number | null
}

export type StorePaymentSettings = {
  cashOnDelivery: boolean
  bkashEnabled: boolean
}

export type StoreDocumentType = "nid" | "trade_license" | "tin" | "bin_vat"

export type StoreDocumentAttachment = {
  type: StoreDocumentType
  label: string
  url: string
  publicId?: string
  fileName?: string
  fileType?: string
  resourceType?: string
  uploadedAt?: string | null
}

export type StoreSettings = {
  name: string
  logoUrl: string
  coverImageUrl: string
  description: string
  cuisineType: string
  tags: string[]
  documents: StoreDocumentAttachment[]
  phone: string
  email: string
  supportContact: string
  address: string
  location: StoreLocationSettings
  orderSettings: StoreOrderSettings
  paymentSettings: StorePaymentSettings
  notifications: StoreNotificationSettings
  offlineReason: string
  enforcement: {
    status: string
    effectiveStatus: string
    isRestricted: boolean
    reason: string
    ownerNote: string
    customerMessage: string
    startsAt: string | null
    expiresAt: string | null
  }
  updatedAt: string
}

export type StoreSettingsFormErrors = Record<string, string>

export const initialStoreSettings: StoreSettings = {
  name: "",
  logoUrl: "",
  coverImageUrl: "",
  description: "",
  cuisineType: "",
  tags: [],
  documents: [],
  phone: "",
  email: "",
  supportContact: "",
  address: "",
  location: {
    city: "Netrokona",
    latitude: null,
    longitude: null,
  },
  orderSettings: {
    autoAcceptOrders: false,
    preparationTimeMinutes: 20,
  },
  paymentSettings: {
    cashOnDelivery: true,
    bkashEnabled: true,
  },
  notifications: {
    newOrder: true,
    cancellation: true,
  },
  offlineReason: "",
  enforcement: {
    status: "active",
    effectiveStatus: "active",
    isRestricted: false,
    reason: "",
    ownerNote: "",
    customerMessage: "",
    startsAt: null,
    expiresAt: null,
  },
  updatedAt: "2026-04-11T10:00:00.000Z",
}
