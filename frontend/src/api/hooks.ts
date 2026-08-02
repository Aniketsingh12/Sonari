import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./client";

// Minimal data-fetching hook: loading / error / data + manual refetch.
// Kept dependency-free on purpose (no react-query) to keep the bundle lean.

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** HTTP status of a failed request — lets callers tell 404 (no business
   *  configured yet) apart from a network error (backend down). */
  status: number | null;
  refetch: () => void;
}

export function useQuery<T>(path: string | null, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (path === null) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setStatus(null);
    api
      .get<T>(path)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setStatus(200);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message ?? "Request failed");
        setStatus(e instanceof ApiError ? e.status : null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  return { data, loading, error, status, refetch };
}
