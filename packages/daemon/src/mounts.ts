/**
 * SSHFS Mount Manager for multi-machine support.
 * Mounts remote ~/.claude/projects directories via SSHFS.
 */

import { spawn, exec } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

// Config file location
const CONFIG_PATH = path.join(os.homedir(), ".claude-code-ui", "machines.json");

// Base mount directory
const MOUNTS_DIR = path.join(os.homedir(), ".claude-code-ui", "mounts");

// Remote path to mount
const REMOTE_CLAUDE_PATH = ".claude/projects";

export interface MachineConfig {
  name: string;
  host: string;
  user?: string;
  port?: number;
}

export interface MachinesConfig {
  machines: MachineConfig[];
}

export type MountStatus = "mounting" | "mounted" | "unmounted" | "error";

export interface MountState {
  machine: MachineConfig;
  mountPoint: string;
  status: MountStatus;
  lastError?: string;
}

export interface MachineInfo {
  name: string;
  mountPoint: string;
  status: MountStatus;
  error?: string;
}

export class MountManager {
  private mounts = new Map<string, MountState>();
  private started = false;

  /**
   * Load machine config from file
   */
  loadConfig(): MachineConfig[] {
    if (!existsSync(CONFIG_PATH)) {
      return [];
    }

    try {
      const content = require("fs").readFileSync(CONFIG_PATH, "utf-8");
      const config: MachinesConfig = JSON.parse(content);

      if (!config.machines || !Array.isArray(config.machines)) {
        console.warn(`[mounts] Invalid config: missing 'machines' array`);
        return [];
      }

      // Validate each machine
      const valid: MachineConfig[] = [];
      for (const machine of config.machines) {
        if (!machine.name || !machine.host) {
          console.warn(`[mounts] Skipping invalid machine config: ${JSON.stringify(machine)}`);
          continue;
        }
        valid.push(machine);
      }

      return valid;
    } catch (error) {
      console.error(`[mounts] Failed to load config from ${CONFIG_PATH}:`, error);
      return [];
    }
  }

  /**
   * Get mount point for a machine
   */
  getMountPoint(machineName: string): string {
    return path.join(MOUNTS_DIR, machineName);
  }

  /**
   * Check if SSHFS is available
   */
  private async checkSshfs(): Promise<boolean> {
    return new Promise((resolve) => {
      exec("which sshfs", (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Check if a path is mounted
   */
  private async isMounted(mountPoint: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(`mount | grep -q "${mountPoint}"`, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Mount all configured machines
   */
  async mountAll(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    // Check for SSHFS
    const hasSshfs = await this.checkSshfs();
    if (!hasSshfs) {
      console.log(`[mounts] SSHFS not found. Install with: brew install sshfs`);
      return;
    }

    const machines = this.loadConfig();
    if (machines.length === 0) {
      console.log(`[mounts] No remote machines configured`);
      return;
    }

    // Ensure mounts directory exists
    if (!existsSync(MOUNTS_DIR)) {
      mkdirSync(MOUNTS_DIR, { recursive: true });
    }

    console.log(`[mounts] Mounting ${machines.length} remote machine(s)`);

    for (const machine of machines) {
      const mountPoint = this.getMountPoint(machine.name);

      this.mounts.set(machine.name, {
        machine,
        mountPoint,
        status: "mounting",
      });

      await this.mount(machine.name);
    }
  }

  /**
   * Mount a single machine
   */
  private async mount(name: string): Promise<void> {
    const state = this.mounts.get(name);
    if (!state) return;

    const { machine, mountPoint } = state;

    // Create mount point if needed
    if (!existsSync(mountPoint)) {
      mkdirSync(mountPoint, { recursive: true });
    }

    // Check if already mounted
    if (await this.isMounted(mountPoint)) {
      state.status = "mounted";
      console.log(`[mounts] ${name}: Already mounted at ${mountPoint}`);
      return;
    }

    // Build SSHFS command
    // sshfs [user@]host:path mountpoint [-p port] -o reconnect,ServerAliveInterval=15
    const remoteSpec = machine.user
      ? `${machine.user}@${machine.host}:${REMOTE_CLAUDE_PATH}`
      : `${machine.host}:${REMOTE_CLAUDE_PATH}`;

    const args: string[] = [
      remoteSpec,
      mountPoint,
      "-o", "reconnect",
      "-o", "ServerAliveInterval=15",
      "-o", "ServerAliveCountMax=3",
      "-o", "follow_symlinks",
    ];

    if (machine.port) {
      args.push("-p", machine.port.toString());
    }

    console.log(`[mounts] ${name}: Mounting ${remoteSpec} -> ${mountPoint}`);
    state.status = "mounting";

    return new Promise((resolve) => {
      const proc = spawn("sshfs", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderr = "";

      proc.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("exit", async (code) => {
        if (code === 0) {
          // Verify mount succeeded
          if (await this.isMounted(mountPoint)) {
            state.status = "mounted";
            state.lastError = undefined;
            console.log(`[mounts] ${name}: Mounted successfully`);
          } else {
            state.status = "error";
            state.lastError = "Mount command succeeded but mount not found";
            console.error(`[mounts] ${name}: Mount verification failed`);
          }
        } else {
          state.status = "error";
          state.lastError = stderr.trim() || `Exit code ${code}`;
          console.error(`[mounts] ${name}: Mount failed: ${state.lastError}`);
        }
        resolve();
      });

      proc.on("error", (error) => {
        state.status = "error";
        state.lastError = error.message;
        console.error(`[mounts] ${name}: Error: ${error.message}`);
        resolve();
      });
    });
  }

  /**
   * Unmount all machines
   */
  async unmountAll(): Promise<void> {
    this.started = false;

    for (const [name, state] of this.mounts.entries()) {
      if (state.status === "mounted") {
        await this.unmount(name);
      }
    }
  }

  /**
   * Unmount a single machine
   */
  private async unmount(name: string): Promise<void> {
    const state = this.mounts.get(name);
    if (!state) return;

    const { mountPoint } = state;

    if (!(await this.isMounted(mountPoint))) {
      state.status = "unmounted";
      return;
    }

    console.log(`[mounts] ${name}: Unmounting...`);

    return new Promise((resolve) => {
      // Use umount on macOS, fusermount -u on Linux
      const cmd = process.platform === "darwin" ? "umount" : "fusermount";
      const args = process.platform === "darwin" ? [mountPoint] : ["-u", mountPoint];

      const proc = spawn(cmd, args);

      proc.on("exit", (code) => {
        if (code === 0) {
          state.status = "unmounted";
          console.log(`[mounts] ${name}: Unmounted`);
        } else {
          console.error(`[mounts] ${name}: Unmount failed (code ${code})`);
        }
        resolve();
      });

      proc.on("error", () => {
        resolve();
      });
    });
  }

  /**
   * Get all mount states
   */
  getMountStates(): MountState[] {
    return Array.from(this.mounts.values());
  }

  /**
   * Get all watch paths (local + mounted)
   */
  getWatchPaths(): { path: string; hostname: string }[] {
    const localClaudePath = path.join(os.homedir(), ".claude", "projects");
    const localHostname = process.env.HOSTNAME || os.hostname();

    const paths: { path: string; hostname: string }[] = [
      { path: localClaudePath, hostname: localHostname },
    ];

    for (const state of this.mounts.values()) {
      if (state.status === "mounted") {
        paths.push({
          path: state.mountPoint,
          hostname: state.machine.name,
        });
      }
    }

    return paths;
  }

  /**
   * Get hostname for a session file path
   */
  getHostnameForPath(sessionPath: string): string {
    // Check if path is under a mount point
    for (const state of this.mounts.values()) {
      if (sessionPath.startsWith(state.mountPoint)) {
        return state.machine.name;
      }
    }

    // Default to local hostname
    return process.env.HOSTNAME || os.hostname();
  }

  /**
   * Get machine info for API response
   */
  getMachineInfo(): MachineInfo[] {
    const localHostname = process.env.HOSTNAME || os.hostname();
    const localClaudePath = path.join(os.homedir(), ".claude", "projects");

    const machines: MachineInfo[] = [
      {
        name: localHostname,
        mountPoint: localClaudePath,
        status: "mounted", // Local is always "mounted"
      },
    ];

    for (const state of this.mounts.values()) {
      machines.push({
        name: state.machine.name,
        mountPoint: state.mountPoint,
        status: state.status,
        error: state.lastError,
      });
    }

    return machines;
  }
}

// Singleton instance
let mountManager: MountManager | null = null;

export function getMountManager(): MountManager {
  if (!mountManager) {
    mountManager = new MountManager();
  }
  return mountManager;
}
