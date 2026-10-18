import { useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useAdminAction, useAdminQuery } from "../../hooks/useNativeAdmin";
import { defaultAdminModel, type AdminModels } from "../../api/native-admin";
export function AdminError({
  error,
  retry,
}: {
  error?: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm"
    >
      <p>{error instanceof Error ? error.message : String(error)}</p>
      {retry && (
        <Button className="mt-2" variant="outline" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function AdminHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground break-words">
            {description}
          </p>
        )}
      </div>
      {children}
    </header>
  );
}
export function AdminModelSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const models = useAdminQuery<AdminModels>("chats/models");
  if (models.error)
    return (
      <AdminError error={models.error} retry={() => void models.refetch()} />
    );
  return (
    <Select
      value={value || defaultAdminModel(models.data)}
      onValueChange={onChange}
      disabled={disabled || models.isPending}
    >
      <SelectTrigger aria-label="Model" className="w-full sm:w-auto">
        <SelectValue placeholder="Choose a model" />
      </SelectTrigger>
      <SelectContent>
        {models.data?.models.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            {model.name || model.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function AdminPrompt({
  title,
  description,
  label = "Name",
  initial = "",
  confirm = "Save",
  destructive = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: string;
  label?: string;
  initial?: string;
  confirm?: string;
  destructive?: boolean;
  onConfirm: (value: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const action = useAdminAction();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !action.busy) onClose();
      }}
    >
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(() => onConfirm(value.trim()), onClose);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {description || "Changes apply to this Admin workspace."}
            </DialogDescription>
          </DialogHeader>
          {label && (
            <label className="grid gap-2 text-sm">
              {label}
              <Input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                maxLength={256}
              />
            </label>
          )}
          <AdminError error={action.error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={action.busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={action.busy || (!!label && !value.trim())}
            >
              {action.busy ? "Saving…" : confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
