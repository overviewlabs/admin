/** Admin has its own settings routes; legacy query context is redirect-only. */
export const ADMIN_MODEL_SETTINGS_PATH = "/admin/settings/models";
export function isAdminSettingsContext(search: string): boolean {
  return new URLSearchParams(search).get("workspace") === "admin";
}
export function isAdminSettingsPath(pathname: string): boolean {
  return /\/admin\/settings(?:\/|$)/.test(pathname);
}
