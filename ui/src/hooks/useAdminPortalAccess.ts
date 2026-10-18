import { useQuery } from "@tanstack/react-query";
import { authApi } from "../api/auth";
import { api } from "../api/client";
import { queryKeys } from "../lib/queryKeys";

// The switcher and Admin page share this instance-level, user-scoped check.
// Reuse it during navigation instead of delaying Admin with a second check.
export function useAdminPortalAccess() {
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    staleTime: 30_000,
    retry: false,
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const access = useQuery({
    queryKey: ["admin-portal-access", currentUserId],
    queryFn: () => api.get<{ allowed: boolean }>("/instance/admin-portal/access"),
    enabled: Boolean(currentUserId),
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  });
  return { currentUserId, access };
}
