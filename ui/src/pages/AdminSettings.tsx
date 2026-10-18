import { Cpu } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useAdminPortalAccess } from "../hooks/useAdminPortalAccess";
import { useEffect, useState } from "react";
import { useAdminQuery } from "../hooks/useNativeAdmin";
import { adminRequest, defaultAdminModel } from "../api/native-admin";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

type Models = {
  models: Array<{ id: string; name: string }>;
  default: string | null;
};
export function AdminSettings() {
  const { access } = useAdminPortalAccess();
  if (access.isError || access.data?.allowed === false) {
    return <p role="alert">Admin model settings are available to server administrators.</p>;
  }
  if (!access.data?.allowed) return null;
  return <AdminModelSettings />;
}

function AdminModelSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Admin settings" }, { label: "Models" }]);
  }, [setBreadcrumbs]);
  const models = useAdminQuery<Models>("chats/models");
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (models.data) setSelected(defaultAdminModel(models.data));
  }, [models.data]);
  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await adminRequest("admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { "chat.default_model": selected } }),
      });
      await models.refetch();
      setMessage(
        "Admin model saved. New chats and new scheduled tasks will use this default.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save the model. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex items-center gap-2">
        <Cpu className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Models</h1>
      </div>
      <section className="max-w-2xl space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Admin model</div>
        <p className="text-sm text-muted-foreground">Choose the default model for new Admin conversations and scheduled tasks.</p>
        <label htmlFor="admin-default-model" className="text-sm font-medium">
          Default model
        </label>
        <p className="text-sm text-muted-foreground">
          Existing chats and scheduled tasks keep their selected model.
          Organization agents are unchanged.
        </p>
        {models.isPending ? (
          <p role="status">Loading available models…</p>
        ) : models.isError ? (
          <div role="alert">
            <p>{models.error.message}</p>
            <Button variant="outline" onClick={() => void models.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <Select
              value={selected}
              onValueChange={setSelected}
              disabled={saving}
            >
              <SelectTrigger id="admin-default-model" className="w-full">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.data.models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name || model.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={
                saving ||
                !models.data.models.some((model) => model.id === selected)
              }
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save model"}
            </Button>
          </>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
