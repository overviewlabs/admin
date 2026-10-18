import os from "node:os";
import { readFile, statfs } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const cpuSample = () => os.cpus().reduce((sum, cpu) => ({ idle: sum.idle + cpu.times.idle, total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 });
let previous = cpuSample();
export function cpuUsage(before: {idle: number; total: number}, after: {idle: number; total: number}) {
  const total = after.total - before.total;
  return total > 0 ? Math.max(0, Math.min(100, 100 * (1 - (after.idle - before.idle) / total))) : 0;
}
export function hasBlockMount(mounts: string) {
  return mounts.split("\n").some(line => { const fields = line.split(" "); return fields[4] === "/.WHOX" && line.includes(" - ext4 /dev/"); });
}
async function primaryStorage() {
  const mounts = await readFile("/proc/self/mountinfo", "utf8");
  if (!hasBlockMount(mounts)) throw new Error("Block storage is not mounted");
  const fs = await statfs("/.WHOX");
  return { mount: "/.WHOX", totalBytes: fs.blocks * fs.bsize, availableBytes: fs.bavail * fs.bsize, usedBytes: (fs.blocks - fs.bfree) * fs.bsize };
}
export async function collectServerMonitor() {
  const current = cpuSample();
  const cpuPercent = cpuUsage(previous, current); previous = current;
  const warnings: string[] = [];
  const [memory, network, disk, services, primaryDisk] = await Promise.all([
    readFile("/proc/meminfo", "utf8").catch(() => { warnings.push("Detailed memory metrics unavailable"); return ""; }),
    readFile("/proc/net/dev", "utf8").catch(() => { warnings.push("Network metrics unavailable"); return ""; }),
    statfs("/").catch(() => { warnings.push("Disk metrics unavailable"); return null; }),
    Promise.all([false, true].map(async user => {
      try {
        const { stdout } = await exec("systemctl", [...(user ? ["--user"] : []), "list-units", "--type=service", "--all", "--no-pager", "--plain", "--no-legend"], { timeout: 2500, maxBuffer: 1024 * 1024 });
        return stdout.split("\n").flatMap(line => {
          const fields = line.trim().replace(/^●\s*/, "").split(/\s+/);
          if (!fields[0]?.endsWith(".service")) return [];
          return [{ name: fields[0], scope: user ? "Application" : "System", load: fields[1], state: fields[2], subState: fields[3] }];
        });
      } catch { warnings.push(`${user ? "Application" : "System"} service status unavailable`); return []; }
    })).then(items => items.flat()),
    primaryStorage().catch(() => { warnings.push("Primary block storage is unavailable or not mounted"); return null; }),
  ]);
  const availableMatch = memory.match(/^MemAvailable:\s+(\d+)/m);
  const available = availableMatch ? Number(availableMatch[1]) * 1024 : os.freemem();
  return {
    sampledAt: new Date().toISOString(), hostname: os.hostname(), platform: `${os.type()} ${os.release()}`, uptimeSeconds: os.uptime(),
    cpu: { percent: cpuPercent, cores: os.cpus().length, load: os.loadavg() },
    memory: { totalBytes: os.totalmem(), availableBytes: available, usedBytes: os.totalmem() - available },
    disk: disk ? { totalBytes: disk.blocks * disk.bsize, availableBytes: disk.bavail * disk.bsize, usedBytes: (disk.blocks - disk.bfree) * disk.bsize } : null,
    primaryDisk,
    network: network.split("\n").flatMap(line => {
      const parts = line.split(":"); if (parts.length !== 2 || parts[0].trim() === "lo") return [];
      const fields = parts[1].trim().split(/\s+/).map(Number);
      return [{ name: parts[0].trim(), receivedBytes: fields[0], transmittedBytes: fields[8] }];
    }), services, warnings,
  };
}
let cached: Awaited<ReturnType<typeof collectServerMonitor>> | undefined;
let inflight: ReturnType<typeof collectServerMonitor> | undefined;
let expires = 0;
export async function getServerMonitor() {
  if (cached && Date.now() < expires) return cached;
  if (!inflight) inflight = collectServerMonitor().then(value => { cached = value; expires = Date.now() + 4000; return value; }).finally(() => { inflight = undefined; });
  return inflight;
}
