import { useEffect, useState } from "react";
import { subscribe, type Category } from "./ws";

export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs = 2500,
  deps: unknown[] = [],
  wsCategory?: Category | Category[]
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = () =>
      fn()
        .then((d) => active && setData(d))
        .catch((e) => active && setError(e.message));
    load();
    const t = setInterval(load, intervalMs);

    const categories = wsCategory ? (Array.isArray(wsCategory) ? wsCategory : [wsCategory]) : [];
    const unsubscribe = categories.length
      ? subscribe((cat) => {
          if (categories.includes(cat)) load();
        })
      : undefined;

    return () => {
      active = false;
      clearInterval(t);
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error };
}
