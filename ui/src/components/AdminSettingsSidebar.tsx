import { ArrowLeft, Cpu } from "lucide-react";
import { ADMIN_MODEL_SETTINGS_PATH } from "../lib/admin-settings";
import { ContextualSidebarFrame } from "./ContextualSidebarFrame";
import { SidebarNavItem } from "./SidebarNavItem";
import { primarySidebarStyles } from "./primary-sidebar-styles";

export function AdminSettingsSidebar() {
  return (
    <ContextualSidebarFrame surface="settings" title="Admin settings" showHeader={false} className={primarySidebarStyles.surface}>
      <div data-slot="settings-sidebar-header" className="flex h-(--sz-60px) shrink-0 items-center px-3">
        <div className={`${primarySidebarStyles.group} w-full`}>
          <SidebarNavItem to="/admin" label="Back to Admin" icon={ArrowLeft} end />
        </div>
      </div>
      <nav aria-label="Admin settings" className={primarySidebarStyles.nav}>
        <div className={primarySidebarStyles.group}>
          <SidebarNavItem to={ADMIN_MODEL_SETTINGS_PATH} label="Models" icon={Cpu} end />
        </div>
      </nav>
    </ContextualSidebarFrame>
  );
}
