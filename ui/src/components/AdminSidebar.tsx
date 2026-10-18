import { useAdminQuery } from "../hooks/useNativeAdmin";
import type { AdminWorkspace } from "../api/native-admin";
import {
  Activity,
  CalendarClock,
  FolderOpen,
  LayoutDashboard,
  MessageSquare,
  Monitor,
  Plus,
  Terminal,
} from "lucide-react";
import { useLocation, useNavigate } from "../lib/router";
import { useSidebar } from "../context/SidebarContext";
import { SidebarCompanyMenu } from "./SidebarCompanyMenu";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarSection } from "./SidebarSection";
import { primarySidebarStyles } from "./primary-sidebar-styles";
import { cn } from "../lib/utils";

export function AdminSidebar() {
  const { collapsed, peeking } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const view = params.get("view") ?? "dashboard";
  const workspaceQuery = useAdminQuery<AdminWorkspace[]>("state/workspaces");
  const workspaces = workspaceQuery.data ?? [];
  const item = (key: string, label: string, icon: typeof Monitor) => (
    <SidebarNavItem
      key={key}
      to={`/admin?view=${key}`}
      label={label}
      icon={icon}
      active={view === key}
    />
  );
  return (
    <aside
      data-rail={collapsed && !peeking ? "true" : undefined}
      className={cn(
        "whox-sidebar w-full h-full min-h-0 flex flex-col",
        primarySidebarStyles.surface,
      )}
    >
      <div className="flex h-(--sz-60px) shrink-0 items-center gap-1 px-3">
        <SidebarCompanyMenu />
      </div>
      <nav className={primarySidebarStyles.nav} aria-label="Admin navigation">
        <SidebarSection label="Platform">
          {item("dashboard", "Dashboard", LayoutDashboard)}
          {item("chats", "Conversations", MessageSquare)}
          {item("terminal", "Terminal", Terminal)}
          {item("scheduled", "Scheduled", CalendarClock)}
        </SidebarSection>
        <SidebarSection
          label="Workspaces"
          headerAction={{
            ariaLabel: "Create workspace",
            icon: Plus,
            onClick: () =>
              navigate(`/admin?view=create-workspace&request=${Date.now()}`),
          }}
        >
          {workspaces.map((w) => (
            <SidebarNavItem
              key={w.path}
              to={`/admin?view=workspace&workspace=${encodeURIComponent(w.path)}`}
              label={w.name || w.path.split("/").pop() || w.path}
              icon={FolderOpen}
              active={
                view === "workspace" && params.get("workspace") === w.path
              }
            />
          ))}
          {!workspaces.length && !(collapsed && !peeking) && (
            <p className="px-4 py-4 text-xs text-muted-foreground">
              No workspaces yet
            </p>
          )}
        </SidebarSection>
        <div className={cn(primarySidebarStyles.group, "mt-auto")}>
          {item("monitor", "Monitor", Activity)}
        </div>
      </nav>
    </aside>
  );
}
