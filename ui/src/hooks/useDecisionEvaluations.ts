import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { decisionEvaluationsApi } from "@/api/decision-evaluations";

export function useDecisionEvaluations(issueId: string | null, active: boolean) {
  const query = useInfiniteQuery({
    queryKey: ["issues", issueId, "decision-evaluations"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => decisionEvaluationsApi.list(issueId!, pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: Boolean(issueId),
    retry: 1,
    refetchInterval: current => active || current.state.data?.pages.some(page => page.items.some(item => ["queued", "running", "dispatching", "pending"].includes(item.status))) ? 2000 : 15000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (query.hasNextPage && !query.isFetching && !query.isFetchNextPageError) void query.fetchNextPage();
  }, [query.hasNextPage, query.isFetching, query.isFetchNextPageError, query.fetchNextPage]);
  const items = useMemo(() => [...new Map((query.data?.pages.flatMap(page => page.items) ?? []).map(item => [item.evaluationId, item])).values()], [query.data]);
  return { items, error: query.isError, retry: query.refetch };
}
