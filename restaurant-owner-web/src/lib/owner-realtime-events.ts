export const OWNER_NEW_ORDER_EVENT = "owner:new-order"

export type OwnerNewOrderEventDetail = {
  orderId: string
}

export function dispatchOwnerNewOrderEvent(orderId: string) {
  window.dispatchEvent(
    new CustomEvent<OwnerNewOrderEventDetail>(OWNER_NEW_ORDER_EVENT, {
      detail: { orderId },
    })
  )
}
