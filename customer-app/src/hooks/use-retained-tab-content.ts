import { useEffect, useState } from "react";

export function useRetainedTabContent(isFocused: boolean, releaseDelayMs = 900) {
  const [isRetained, setIsRetained] = useState(true);

  useEffect(() => {
    if (isFocused) {
      setIsRetained(true);
      return;
    }

    if (releaseDelayMs <= 0) {
      setIsRetained(false);
      return;
    }

    const timer = setTimeout(() => setIsRetained(false), releaseDelayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [isFocused, releaseDelayMs]);

  return isFocused || isRetained;
}
