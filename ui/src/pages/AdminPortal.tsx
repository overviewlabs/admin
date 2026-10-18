import { lazy, Suspense, useEffect, useRef } from "react";
import { useAdminPortalAccess } from "../hooks/useAdminPortalAccess";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useLocation, useNavigate, Navigate } from "../lib/router";
import { ADMIN_MODEL_SETTINGS_PATH } from "../lib/admin-settings";
import { ServerMonitor } from "./ServerMonitor";
import { Button } from "../components/ui/button";
import {
  AdminDashboard,
  AdminChatList,
  CreateAdminWorkspace,
} from "../components/admin/AdminDashboard";
const AdminTerminals = lazy(() =>
  import("../components/admin/AdminTerminal").then((m) => ({
    default: m.AdminTerminals,
  })),
);
const AdminChat = lazy(() =>
  import("../components/admin/AdminChat").then((m) => ({
    default: m.AdminChat,
  })),
);
const AdminScheduled = lazy(() =>
  import("../components/admin/AdminScheduled").then((m) => ({
    default: m.AdminScheduled,
  })),
);
const AdminWorkspace = lazy(() =>
  import("../components/admin/AdminWorkspace").then((m) => ({
    default: m.AdminWorkspace,
  })),
);
export function AdminPortal() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const view = params.get("view") || "dashboard";
  const latestView = useRef(view);
  latestView.current = view;
  const { setBreadcrumbs } = useBreadcrumbs();
  const { access } = useAdminPortalAccess();
  useEffect(() => {
    setBreadcrumbs([{ label: "Admin" }]);
  }, [setBreadcrumbs]);
  if (
    ![
      "dashboard",
      "terminal",
      "scheduled",
      "chat",
      "chats",
      "workspace",
      "create-workspace",
      "monitor",
      "settings",
    ].includes(view)
  )
    return <Navigate to="/admin" replace />;
  if (
    access.isError ||
    access.data?.allowed === false
  )
    return (
      <div className="p-6 space-y-3">
        <p>Admin is available to WHOXOS server administrators.</p>
        <Button variant="outline" onClick={() => void access.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (!access.data?.allowed) return null;
  if (view === "settings") return <Navigate to={ADMIN_MODEL_SETTINGS_PATH} replace />;
  const fill = view === "terminal" || view === "chat";
  return (
    <div
      data-native-admin
      className={`flex-1 min-h-0 min-w-0 ${view === "chat" ? "" : "p-4 md:p-6"} ${fill ? "flex flex-col overflow-hidden" : "overflow-auto"}`}
    >
      <Suspense fallback={null}>
        {(view === "dashboard" || view === "create-workspace") && (
          <AdminDashboard />
        )}
        {view === "create-workspace" && (
          <CreateAdminWorkspace
            onClose={() => {
              if (latestView.current === "create-workspace") navigate("/admin");
            }}
          />
        )}
        {view === "terminal" && <AdminTerminals />}
        {view === "chat" && (
          <AdminChat
            key={`${params.get("chatId") || ""}:${params.get("request") || ""}`}
          />
        )}
        {view === "chats" && (
          <AdminChatList workspace={params.get("workspace") || undefined} />
        )}
        {view === "scheduled" && <AdminScheduled />}
        {view === "workspace" && (
          <AdminWorkspace key={params.get("workspace")} />
        )}
        {view === "monitor" && <ServerMonitor />}
      </Suspense>
    </div>
  );
}
