import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { accessApi } from "@/api/access";
import { queryKeys } from "@/lib/queryKeys";

/** Fail closed while loading, with permission data isolated by signed-in account. */
export function useOrganizationCreation() {
  const session = useQuery({ queryKey: queryKeys.auth.session, queryFn: authApi.getSession, retry: false });
  const userId = session.data?.user.id;
  const access = useQuery({
    queryKey: [...queryKeys.access.currentBoardAccess, userId ?? null],
    queryFn: accessApi.getCurrentBoardAccess,
    enabled: Boolean(userId),
    retry: false,
  });
  return Boolean(userId && access.isSuccess && access.data?.userId === userId && access.data.canCreateOrganizations);
}
