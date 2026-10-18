import { HQL_COMPANY_ID } from "../api/hqlLeads";
import { SidebarSearch } from "./SidebarSearch";
import { Plus } from "lucide-react";
import {
  Inbox,
  ListChecks,
  CircleCheck,
  Target,
  LayoutDashboard,
  DollarSign,
  History,
  Network,
  Boxes,
  Repeat,
  Layers,
  GitBranch,
  Package,
  Settings,
  FolderOpen,
  Unplug,
  MessagesSquare,
  GanttChartSquare,
  LayoutGrid,
  Users,
} from "lucide-react";
import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarAgents } from "./SidebarAgents";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarStarredProjects } from "./SidebarStarredProjects";
import { SidebarAgentChats } from "./SidebarAgentChats";
import { useAgentChatEnabled } from "@/hooks/useAgentChatEnabled";
import { useDialogActions } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { useSidebar } from "../context/SidebarContext";
import { attentionApi } from "../api/attention";
import { heartbeatsApi } from "../api/heartbeats";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { attentionBadgeCount } from "../lib/attention";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { useStreamlinedUiEnabled } from "../hooks/useStreamlinedUiEnabled";
import { usePublishSharedQueryData, useSharedPollingQuery } from "../hooks/useSharedPolling";
import { cn } from "../lib/utils";
import { PluginSlotOutlet } from "@/plugins/slots";
import { PluginLauncherOutlet } from "@/plugins/launchers";
import { SidebarCompanyMenu } from "./SidebarCompanyMenu";
import { primarySidebarStyles } from "./primary-sidebar-styles";
import { TREASURY_COMPANY_ID } from "@whoxos/shared";

export function Sidebar({ children }: { children?: ReactNode }) {
  const { openNewIssue } = useDialogActions();
  const { enabled: agentChatEnabled } = useAgentChatEnabled();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { collapsed, peeking } = useSidebar();
  const { enabled: streamlinedUiEnabled } = useStreamlinedUiEnabled();
  const rail = collapsed && !peeking;
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const liveRunsQueryKey = queryKeys.liveRuns(selectedCompanyId!);
  const sharedLiveRuns = useSharedPollingQuery({
    companyId: selectedCompanyId,
    resourceKey: "live-runs",
    queryKey: liveRunsQueryKey,
    enabled: !!selectedCompanyId,
    // Event-sourced via LiveUpdatesProvider (GitHub issue 9627) + reconnect reconcile — no
    // interval poll needed. Polling here also re-armed React Query's timer on
    // every live-event cache write, a major source of steady-state churn.
    refetchInterval: false,
    leaderOnly: true,
  });
  const { data: liveRuns, dataUpdatedAt: liveRunsUpdatedAt } = useQuery({
    queryKey: liveRunsQueryKey,
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: sharedLiveRuns.enabled,
    refetchInterval: sharedLiveRuns.refetchInterval,
  });
  usePublishSharedQueryData(sharedLiveRuns, liveRuns, liveRunsUpdatedAt);
  const liveRunCount = liveRuns?.length ?? 0;
  const showWorkspacesLink = experimentalSettings?.enableIsolatedWorkspaces === true;
  const showPipelines = experimentalSettings?.enablePipelines === true;
  const showStatusCards = experimentalSettings?.enableStatusCards === true;
  const goalsLinkPending = experimentalSettings === undefined;
  const showGoalsLink = experimentalSettings?.enableGoalsSidebarLink === true;
  // Decisions (attention home) is an experimental surface (PAP-13481): the nav
  // item is hidden entirely until the flag is enabled (same no-flash pattern as
  // showWorkspacesLink — it defaults hidden, so no placeholder is needed).
  const showDecisions = experimentalSettings?.enableDecisions === true;
  const { data: attentionFeed } = useQuery({
    queryKey: queryKeys.attention(selectedCompanyId!),
    queryFn: () => attentionApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && showDecisions,
    refetchInterval: 60_000,
  });
  const attentionCount = attentionBadgeCount(attentionFeed);
  const showCases = experimentalSettings?.enableCases === true;
  // Conference Room Chat flag (PAP-136/PAP-137): the Conference Room nav item
  // is a new surface, hidden entirely while the flag is off (same no-flash
  // pattern as showWorkspacesLink above).
  const conferenceRoomChatEnabled = experimentalSettings?.enableConferenceRoomChat === true;

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside
      data-rail={rail ? "true" : undefined}
      className={cn(
        "whox-sidebar w-full h-full min-h-0 flex flex-col",
        streamlinedUiEnabled
          ? primarySidebarStyles.surface
          : "border-r border-border bg-background",
      )}
    >
      {/* Top bar: company name, aligned with top sections and borderless.
          Search deliberately does NOT live here:
          the header's spare width goes to the workspace/organization name,
          which is the user's orientation anchor and truncates otherwise.
          Search is the first nav item below instead. */}
      <div className="flex h-(--sz-60px) shrink-0 items-center gap-1 px-3">
        <SidebarCompanyMenu />
      </div>

      <nav className={primarySidebarStyles.nav}>
        <div className={primarySidebarStyles.group}>
          <SidebarSearch key={selectedCompanyId} />
          <SidebarNavItem to="/dashboard" label="Dashboard" icon={LayoutDashboard} liveCount={liveRunCount} />
          {selectedCompanyId === TREASURY_COMPANY_ID && <SidebarNavItem to="/treasury/settings" label="My trading settings" icon={DollarSign} />}
          <SidebarNavItem
            to="/inbox"
            label="Inbox"
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeLabel="unread"
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
          />
          {showDecisions ? (
            <SidebarNavItem
              to="/decisions"
              label="Decisions"
              icon={ListChecks}
              badge={attentionCount}
              badgeLabel="decisions"
            />
          ) : null}
          {showStatusCards ? (
            <SidebarNavItem to="/status" label="Status" icon={LayoutGrid} textBadge="beta" />
          ) : null}
          {conferenceRoomChatEnabled ? (
            <SidebarNavItem to="/board-chat" label="Conference Room" icon={MessagesSquare} />
          ) : null}

          <div className="relative group/task-nav">
            <SidebarNavItem to="/issues" label="Tasks" icon={CircleCheck} className={rail ? undefined : "pr-10 group-hover/task-nav:bg-sidebar-accent group-focus-within/task-nav:bg-sidebar-accent"} />
            {!rail && <button type="button" aria-label="New task" title="New task" onClick={() => openNewIssue()} className="absolute right-7 top-(--pct-50) -translate-y-(--pct-50) flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><Plus aria-hidden="true" className="h-4 w-4" /></button>}
          </div>
          {streamlinedUiEnabled ? (
            <>
              <SidebarNavItem to="/projects" label="Projects" icon={FolderOpen} />
              <SidebarStarredProjects />
            </>
          ) : null}
          {selectedCompanyId === HQL_COMPANY_ID && <SidebarNavItem to="/leads" label="Leads" icon={Target} />}
          <SidebarNavItem to="/routines" label="Routines" icon={Repeat} />
          <SidebarNavItem to="/artifacts" label="Artifacts" icon={Package} />
          {showCases ? (
            <SidebarNavItem to="/cases" label="Cases" icon={Layers} textBadge="beta" />
          ) : null}
          {showPipelines ? (
            <SidebarNavItem to="/pipelines" label="Pipelines" icon={GitBranch} />
          ) : null}
          {showGoalsLink ? (
            <SidebarNavItem to="/goals" label="Goals" icon={Target} />
          ) : goalsLinkPending ? (
            <div
              data-testid="sidebar-goals-placeholder"
              className="h-8 pointer-coarse:h-7"
              aria-hidden="true"
            />
          ) : null}
          {showWorkspacesLink ? (
            <SidebarNavItem to="/workspaces" label="Workspaces" icon={GitBranch} />
          ) : null}
          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-(length:--text-compact) font-medium"
            missingBehavior="placeholder"
          />
          <PluginLauncherOutlet
            placementZones={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-(length:--text-compact) font-medium"
          />
        </div>

        {children}
        {agentChatEnabled && !children && <SidebarAgentChats />}

        {!streamlinedUiEnabled && (
          <>
            <SidebarProjects />
            <SidebarAgents />
            <SidebarSection
              label="Organization"
            >
              <SidebarNavItem to="/org" label="Organization" icon={Network} />
              <SidebarNavItem to="/apps" label="Connectors" icon={Unplug} />
              <SidebarNavItem to="/timeline" label="Timeline" icon={GanttChartSquare} />
              <SidebarNavItem to="/costs" label="Costs" icon={DollarSign} />
              <SidebarNavItem to="/activity" label="Activity" icon={History} />
              <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} />
            </SidebarSection>
          </>
        )}

        <PluginSlotOutlet
          slotTypes={["sidebarPanel"]}
          context={pluginContext}
          className="flex flex-col gap-3"
          itemClassName="rounded-lg border border-border p-3"
          missingBehavior="placeholder"
        />
      </nav>
      {streamlinedUiEnabled && (
        <nav aria-label="Organization" className="shrink-0 px-3 py-2">
          <SidebarSection
            label="Organization"
          >
            <SidebarNavItem to="/agents" label="Agents" icon={Users} />
            <SidebarNavItem to="/skills" label="Skills" icon={Boxes} />
            <SidebarNavItem to="/apps" label="Connectors" icon={Unplug} />
            <SidebarNavItem to="/activity" label="Audit" icon={History} />
          </SidebarSection>
        </nav>
      )}
    </aside>
  );
}
