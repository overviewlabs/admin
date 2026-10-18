import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Inbox,
  KeyRound,
  Link2,
  Loader2,
} from "lucide-react";
import type { CompanySecretProviderConfig, SecretProposalView } from "@whoxos/shared";
import { Badge } from "../../components/ui/badge";
import { secretsApi } from "../../api/secrets";
import { queryKeys } from "../../lib/queryKeys";
import { cn } from "../../lib/utils";
import { EmptyState } from "../../components/EmptyState";
import { SecretPathName } from "./SecretPathName";
import {
  AgentRefChip,
  DeliveryBadge,
  FingerprintChip,
  ProposalActions,
  ProposalJustification,
  ProposedBadge,
  bindingEnvKey,
  bindingSecretLabel,
  useProposalReview,
} from "./proposal-review";

/** ISO expiry → "expires in 12d" / "expires in 5h" / "expired". */
function expiryLabel(expiresAt: string): { text: string; urgent: boolean } {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return { text: "no expiry", urgent: false };
  if (ms <= 0) return { text: "expired", urgent: true };
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return { text: `expires in ${hours}h`, urgent: true };
  const days = Math.floor(hours / 24);
  return { text: `expires in ${days}d`, urgent: days <= 2 };
}

function ProposalRow({
  proposal,
  onApprove,
  onReject,
  disabled,
  historical = false,
}: {
  proposal: SecretProposalView;
  onApprove: (p: SecretProposalView) => void;
  onReject: (p: SecretProposalView) => void;
  disabled: boolean;
  historical?: boolean;
}) {
  const isSecret = proposal.kind === "secret";
  const expiry = expiryLabel(proposal.expiresAt);
  const secret = bindingSecretLabel(proposal);
  const envKey = bindingEnvKey(proposal);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-start sm:gap-3">
      <span
        className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground"
        aria-hidden="true"
      >
        {isSecret ? <KeyRound className="size-3.5" /> : <Link2 className="size-3.5" />}
      </span>

      <div className="min-w-0 flex-1 space-y-1.5">
        {/* Headline */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {isSecret ? (
            <SecretPathName name={proposal.proposedName ?? "—"} className="text-sm" />
          ) : (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
              {proposal.target ? (
                <AgentRefChip agent={proposal.target} className="font-medium" />
              ) : (
                <span className="text-muted-foreground">agent</span>
              )}
              <DeliveryBadge configPath={proposal.configPath} />
              <code className="font-mono text-xs">{envKey || proposal.configPath}</code>
              <ArrowRight className="size-3 text-muted-foreground" />
              <span className="inline-flex items-center gap-1">
                <KeyRound className="size-3 text-muted-foreground" />
                <span className="font-medium">{secret.name}</span>
                {secret.pending ? <ProposedBadge /> : null}
              </span>
            </span>
          )}
        </div>

        {/* Provenance meta */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            by <AgentRefChip agent={proposal.proposedBy} className="font-medium text-foreground" />
          </span>
          {proposal.originIssue ? (
            <>
              <span aria-hidden="true">·</span>
              <Link
                to={`/issues/${proposal.originIssue.key}`}
                className="inline-flex items-center gap-1 font-mono hover:text-foreground hover:underline"
                title={proposal.originIssue.title}
              >
                {proposal.originIssue.key}
                <ExternalLink className="size-3" />
              </Link>
            </>
          ) : null}
          {isSecret ? (
            <>
              <span aria-hidden="true">·</span>
              <FingerprintChip
                fingerprint={proposal.valueFingerprintSha256}
                length={proposal.valueLength}
              />
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          {historical ? (
            <>
              <Badge variant="outline" className="capitalize">{proposal.status}</Badge>
              <span>{new Date(proposal.resolvedAt ?? proposal.createdAt).toLocaleString()}</span>
            </>
          ) : (
            <span className={cn(expiry.urgent && "text-amber-600 dark:text-amber-400")}>
              {expiry.text}
            </span>
          )}
        </div>

        {historical && proposal.resolutionReason ? (
          <p className="break-words text-xs text-muted-foreground">
            Outcome: {proposal.resolutionReason}
          </p>
        ) : null}

        {/* Justification (agent-authored — framed as an untrusted claim). */}
        <ProposalJustification justification={proposal.justification} />
      </div>

      {!historical && (
        <div className="shrink-0 sm:pt-0.5">
          <ProposalActions
            proposal={proposal}
            onApprove={onApprove}
            onReject={onReject}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}

export function ProposalsTab({
  companyId,
  providerConfigs,
}: {
  companyId: string;
  providerConfigs: CompanySecretProviderConfig[];
}) {
  const proposalsQuery = useQuery({
    queryKey: queryKeys.secrets.proposals(companyId, "pending"),
    queryFn: () => secretsApi.listProposals(companyId, "pending"),
    enabled: Boolean(companyId),
  });
  const historyQuery = useQuery({
    queryKey: queryKeys.secrets.proposals(companyId, "all"),
    queryFn: () => secretsApi.listProposals(companyId, "all"),
    enabled: Boolean(companyId),
  });

  const review = useProposalReview(companyId, providerConfigs);
  const proposals = proposalsQuery.data ?? EMPTY_PROPOSALS;
  const history = (historyQuery.data ?? EMPTY_PROPOSALS).filter((proposal) => proposal.status !== "pending");

  // Secret proposals first, then bindings — an approver usually lands the
  // secret before (or alongside) the bindings that depend on it.
  const sorted = useMemo(
    () =>
      [...proposals].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "secret" ? -1 : 1;
        return a.createdAt.localeCompare(b.createdAt);
      }),
    [proposals],
  );

  if (proposalsQuery.isError) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-destructive">
        <AlertCircle className="size-4" /> Couldn’t load proposals. Try again.
      </div>
    );
  }

  if (proposalsQuery.isPending) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading proposals…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        {sorted.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No pending proposals"
            message="There is nothing to approve. Agents' new secret and access requests appear here."
          />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Review new credentials and access bindings. Proposed values are never shown — only a fingerprint and length.
            </p>
            {sorted.map((proposal) => (
              <ProposalRow
                key={proposal.id}
                proposal={proposal}
                onApprove={review.requestApprove}
                onReject={review.requestReject}
                disabled={review.isBusy}
              />
            ))}
          </>
        )}
      </section>
      <section className="space-y-2" aria-label="Recent proposal history">
        <h2 className="text-sm font-medium">Recent proposal history</h2>
        {historyQuery.isPending ? (
          <p className="text-xs text-muted-foreground">Loading history…</p>
        ) : historyQuery.isError ? (
          <p className="text-xs text-destructive">Couldn’t load proposal history. Try again.</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No resolved, rejected, withdrawn, or expired proposals yet.</p>
        ) : (
          history.map((proposal) => (
            <ProposalRow
              key={proposal.id}
              proposal={proposal}
              onApprove={review.requestApprove}
              onReject={review.requestReject}
              disabled={review.isBusy}
              historical
            />
          ))
        )}
      </section>
      {review.dialogs}
    </div>
  );
}

const EMPTY_PROPOSALS: SecretProposalView[] = [];
