import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_MODE } from "../api/client";

/**
 * useApi
 * Fetches from the backend with a mock/fallback value so the dashboard
 * always renders something meaningful while the API is down.
 *
 * @param {() => Promise<any>} fetcher  returns fresh data each call
 * @param {any} fallback                value shown until/unless fetch succeeds
 * @param {{pollMs?:number, enabled?:boolean, deps?:any[]}} opts
 *   pollMs > 0 re-fetches on an interval (e.g. live feed).
 */
export default function useApi(
  fetcher,
  fallback,
  { pollMs = 0, enabled = true, deps = [] } = {}
) {
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  // Timestamp (ms) of the last successful fetch. Null until the backend
  // answers at least once — this is what separates "backend reachable but
  // empty" (show honest empty state) from "backend down" (show demo data).
  const [updatedAt, setUpdatedAt] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    // Demo-data mode: never hit the network. Fallback stays on screen,
    // updatedAt stays null so feedState() reports 'offline' honestly.
    if (DEMO_MODE) {
      setLoading(false);
      return;
    }
    try {
      const result = await fetcherRef.current();
      if (result !== undefined && result !== null) setData(result);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const run = () => {
      if (!cancelled) load();
    };
    run();
    if (pollMs > 0) {
      const id = setInterval(run, pollMs);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pollMs, ...deps]);

  return { data, loading, error, updatedAt, setData };
}