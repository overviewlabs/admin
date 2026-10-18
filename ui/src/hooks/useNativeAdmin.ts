import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminRequest } from "../api/native-admin";
import { useAdminPortalAccess } from "./useAdminPortalAccess";
export function useAdminQuery<T>(
  path: string,
  enabled = true,
  interval?: number,
) {
  const { currentUserId, access } = useAdminPortalAccess();
  return useQuery<T>({
    queryKey: ["native-admin", currentUserId, path],
    queryFn: ({ signal }) => adminRequest<T>(path, { signal }),
    enabled: enabled && !!access.data?.allowed && !access.isError,
    staleTime: 15_000,
    retry: false,
    refetchInterval: interval,
  });
}
export function useAdminAction() {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run<T>(
    action: () => Promise<T>,
    success?: (value: T) => void,
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      await client.invalidateQueries({ queryKey: ["native-admin"] });
      success?.(result);
      return result;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The operation failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return { run, error, busy, setError };
}
