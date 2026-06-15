import * as React from "react"
import { useBlocker } from "react-router-dom"

export function useUnsavedChangesWarning(
  when: boolean,
  message = "You have unsaved changes. Leave without saving?"
) {
  const blocker = useBlocker(when)

  React.useEffect(() => {
    if (!when) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = message
      return message
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [message, when])

  React.useEffect(() => {
    if (blocker.state !== "blocked") return

    if (window.confirm(message)) {
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker, message])
}
