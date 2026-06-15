import { useCallback, useEffect, useRef } from "react";

export function useSafeTimeout() {
  const timeoutRefs = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(
    () => () => {
      timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
      timeoutRefs.current.clear();
    },
    [],
  );

  return useCallback((callback: () => void, delay: number) => {
    const timeout = setTimeout(() => {
      timeoutRefs.current.delete(timeout);
      callback();
    }, delay);

    timeoutRefs.current.add(timeout);

    return () => {
      clearTimeout(timeout);
      timeoutRefs.current.delete(timeout);
    };
  }, []);
}

export function useSafeAnimationFrame() {
  const frameRefs = useRef<Set<number>>(new Set());

  useEffect(
    () => () => {
      frameRefs.current.forEach((frame) => cancelAnimationFrame(frame));
      frameRefs.current.clear();
    },
    [],
  );

  return useCallback((callback: () => void) => {
    const frame = requestAnimationFrame(() => {
      frameRefs.current.delete(frame);
      callback();
    });

    frameRefs.current.add(frame);

    return () => {
      cancelAnimationFrame(frame);
      frameRefs.current.delete(frame);
    };
  }, []);
}
