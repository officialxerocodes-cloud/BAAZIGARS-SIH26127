import { useEffect, useState } from "react";

/**
 * useLiveClock
 * Ticks every second and returns a formatted IST-style date/time string.
 * Swap the `format` function if you want a different display style.
 */
export default function useLiveClock(intervalMs = 1000) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  const formatted = now.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return { now, formatted };
}
