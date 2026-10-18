import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderUp, Loader2 } from "lucide-react";
import { PROJECT_FOLDER_LIMITS, skipProjectUploadPath, validateProjectUploadPaths } from "@whoxos/shared/project-folder-upload";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

export function ProjectFolderUpload({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const picker = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const relativePath = (file: File) => file.webkitRelativePath.split("/").slice(1).join("/");
  function choose(selected: File[]) {
    setError("");
    const included = selected.filter(file => !skipProjectUploadPath(relativePath(file)));
    setSkipped(selected.length - included.length);
    setName(selected[0]?.webkitRelativePath.split("/")[0] ?? "");
    setFiles([]);
    try {
      validateProjectUploadPaths(included.map(relativePath));
      if (included.some(file => file.size > PROJECT_FOLDER_LIMITS.fileBytes)) throw new Error("Each file must be 25 MiB or smaller.");
      if (included.reduce((sum, file) => sum + file.size, 0) > PROJECT_FOLDER_LIMITS.totalBytes) throw new Error("Folder exceeds the 100 MiB upload limit.");
      setFiles(included);
    } catch (failure) { setError((failure as Error).message); }
  }
  async function upload() {
    if (busy || !files.length || !name.trim()) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.append("name", name.trim());
    body.append("paths", JSON.stringify(files.map(relativePath)));
    files.forEach(file => body.append("files", file, file.name));
    try {
      const project = await projectsApi.uploadFolder(companyId, body);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(companyId) });
      setOpen(false);
      setFiles([]);
      setSuccess(`Created ${project.name} with ${files.length.toLocaleString()} files.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Upload failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <>
    <Button size="sm" variant="outline" onClick={() => { setSuccess(""); setError(""); setFiles([]); setName(""); setOpen(true); }}>
      <FolderUp className="h-4 w-4 mr-1" /> Upload folder
    </Button>
    {success && <span role="status" className="text-sm text-muted-foreground">{success}</span>}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Upload a project folder</DialogTitle>
          <DialogDescription>Create a project from your local files. Subfolders are preserved. Git metadata, dependency folders, and Python caches are skipped.</DialogDescription>
        </DialogHeader>
        <input ref={picker} type="file" multiple {...{ webkitdirectory: "" }} className="hidden" aria-label="Project folder" onChange={event => { choose(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <Button variant="outline" disabled={busy} onClick={() => picker.current?.click()}>Choose folder</Button>
        <label className="space-y-2 text-sm">Project name
          <Input value={name} maxLength={200} disabled={busy} onChange={event => setName(event.target.value)} placeholder="My project" />
        </label>
        {files.length > 0 && <p className="text-sm" role="status">{files.length.toLocaleString()} files · {(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MiB{skipped > 0 ? ` · ${skipped.toLocaleString()} skipped` : ""}</p>}
        <p className="text-xs text-muted-foreground">Up to 2,000 files, 25 MiB per file, 100 MiB total. Empty folders are not included.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={busy || !files.length || !name.trim()} onClick={() => void upload()}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{busy ? "Uploading folder…" : "Upload and create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
