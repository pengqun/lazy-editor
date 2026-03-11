import { useEffect, useRef, useState } from "react";

/**
 * Returns a debounced version of the given value.
 * The returned value only updates after `delay` ms of inactivity,
 * reducing downstream re-renders for rapidly-changing sources
 * (e.g. word count during typing).
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setDebounced(value), delay);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [value, delay]);

  return debounced;
}
