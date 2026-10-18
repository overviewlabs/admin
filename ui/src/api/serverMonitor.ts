import { api } from "./client";
export interface ServerMonitorSnapshot {
  sampledAt: string; hostname: string; platform: string; uptimeSeconds: number;
  cpu: { percent: number; cores: number; load: number[] };
  memory: { totalBytes: number; usedBytes: number; availableBytes: number };
  disk: { totalBytes: number; usedBytes: number; availableBytes: number } | null;
  primaryDisk: { mount: string; totalBytes: number; usedBytes: number; availableBytes: number } | null;
  network: { name: string; receivedBytes: number; transmittedBytes: number }[];
  services: { name: string; scope: string; load: string; state: string; subState: string }[];
  warnings: string[];
}
export const serverMonitorApi = {
  get: (id: string) => api.get<ServerMonitorSnapshot>(`/companies/${id}/monitor`),
  getInstance: () => api.get<ServerMonitorSnapshot>("/instance/monitor"),
};
