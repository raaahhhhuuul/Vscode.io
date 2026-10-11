import { existsSync } from "node:fs";
import * as pty from "node-pty";
import type { IPty, IPtyForkOptions } from "node-pty";
import { env } from "../config/env.js";
import { getRoomWorkspacePath } from "./workspaceFs.js";

/**
 * Builds the shell command + a from-scratch environment for a room's
 * terminal. The env object is an explicit allow-list, not a filtered copy of
 * process.env — nothing here can leak SUPABASE_*, ROOM_TOKEN_SECRET, or
 * anything else the server process holds.
 *
 * Resource caps (ulimit -v/-u/-t) only apply on POSIX: Windows has no
 * equivalent concept, so this is dev-only there. On Linux (the actual
 * deployment target per the Dockerfile in M7), a tiny `/bin/sh -c` wrapper
 * sets the limits and then execs the user's real shell, so they're inherited
 * by every child process it spawns (npm install, a Python script, etc).
 * This has not been exercised on a real POSIX box yet — only typechecked and
 * reasoned through — flagging that honestly rather than claiming it's been
 * verified, since this dev machine is Windows.
 */
function buildSpawnConfig(cwd: string): { command: string; args: string[]; envObj: Record<string, string> } {
  if (process.platform === "win32") {
    const envObj: Record<string, string> = {
      PATH: process.env.PATH ?? "",
      SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
      windir: process.env.windir ?? process.env.SystemRoot ?? "C:\\Windows",
      // Scoped to the room workspace, not the real server user's profile —
      // tools that write config/cache here (npm, pip) stay inside the room.
      TEMP: cwd,
      TMP: cwd,
      USERPROFILE: cwd,
      TERM: "xterm-256color",
    };
    return { command: "cmd.exe", args: [], envObj };
  }

  const candidateShells = [process.env.SHELL, "/bin/bash", "/bin/sh"].filter(
    (s): s is string => !!s && existsSync(s),
  );
  const shell = candidateShells[0] ?? "/bin/sh";

  const envObj: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: cwd,
    TMPDIR: cwd,
    TERM: "xterm-256color",
    SHELL: shell,
    LANG: process.env.LANG ?? "C.UTF-8",
  };

  const ulimitScript = [
    `ulimit -v ${env.terminalMaxVirtualMemoryKb} 2>/dev/null`,
    `ulimit -u ${env.terminalMaxProcesses} 2>/dev/null`,
    `ulimit -t ${env.terminalMaxCpuSeconds} 2>/dev/null`,
    `exec "$SHELL"`,
  ].join("; ");

  return { command: "/bin/sh", args: ["-c", ulimitScript], envObj };
}

/** The subset of TerminalSession that the WS layer needs — lets
 * terminalConnection.ts be unit-tested against a fake session instead of a
 * real node-pty process. */
export interface TerminalSessionLike {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  getScrollback(): string;
  onOutput(listener: (chunk: string) => void): () => void;
  onExit(listener: (code: number) => void): () => void;
}

class TerminalSession implements TerminalSessionLike {
  private ptyProcess: IPty;
  private scrollbackBuf = "";
  private outputListeners = new Set<(chunk: string) => void>();
  private exitListeners = new Set<(code: number) => void>();
  lastActivityMs = Date.now();

  constructor(roomId: string) {
    const cwd = getRoomWorkspacePath(roomId);
    const { command, args, envObj } = buildSpawnConfig(cwd);

    const baseOptions: IPtyForkOptions = {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: envObj,
    };

    this.ptyProcess = this.spawnWithFallback(command, args, baseOptions);

    this.ptyProcess.onData((chunk) => {
      this.appendScrollback(chunk);
      for (const listener of this.outputListeners) listener(chunk);
    });
    this.ptyProcess.onExit(({ exitCode }) => {
      for (const listener of this.exitListeners) listener(exitCode);
    });
  }

  private spawnWithFallback(command: string, args: string[], options: IPtyForkOptions): IPty {
    const withUidGid: IPtyForkOptions = { ...options };
    if (process.platform !== "win32" && env.terminalUid !== undefined) {
      withUidGid.uid = env.terminalUid;
      if (env.terminalGid !== undefined) withUidGid.gid = env.terminalGid;
    }
    try {
      return pty.spawn(command, args, withUidGid);
    } catch (err) {
      if (withUidGid.uid === undefined) throw err;
      console.warn(
        "Terminal spawn with TERMINAL_UID/GID failed (server probably isn't running as root); " +
          "retrying without dropping privileges:",
        (err as Error).message,
      );
      return pty.spawn(command, args, options);
    }
  }

  private appendScrollback(chunk: string): void {
    this.scrollbackBuf += chunk;
    if (this.scrollbackBuf.length > env.terminalScrollbackBytes) {
      this.scrollbackBuf = this.scrollbackBuf.slice(-env.terminalScrollbackBytes);
    }
  }

  write(data: string): void {
    this.lastActivityMs = Date.now();
    this.ptyProcess.write(data);
  }

  resize(cols: number, rows: number): void {
    this.lastActivityMs = Date.now();
    try {
      this.ptyProcess.resize(cols, rows);
    } catch {
      // Process may have just exited; the onExit handler will clean up.
    }
  }

  /** Marks activity without writing (e.g. a viewer's read-only connection staying open). */
  touch(): void {
    this.lastActivityMs = Date.now();
  }

  /**
   * Kills the pty and resolves once it has actually exited (not merely been
   * signaled) — important on Windows, where the process holds its cwd
   * locked for a moment after kill() returns, which would otherwise race
   * with a caller trying to delete the room's workspace directory right
   * after closing the terminal.
   */
  kill(): Promise<void> {
    return new Promise((resolve) => {
      const unsubscribe = this.onExit(() => {
        unsubscribe();
        resolve();
      });
      try {
        this.ptyProcess.kill();
      } catch {
        unsubscribe();
        resolve();
      }
      setTimeout(() => resolve(), 3000); // don't hang forever if onExit never fires
    });
  }

  getScrollback(): string {
    return this.scrollbackBuf;
  }

  onOutput(listener: (chunk: string) => void): () => void {
    this.outputListeners.add(listener);
    return () => this.outputListeners.delete(listener);
  }

  onExit(listener: (code: number) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }
}

const sessions = new Map<string, TerminalSession>();

export function getOrCreateTerminal(roomId: string): TerminalSession {
  let session = sessions.get(roomId);
  if (!session) {
    session = new TerminalSession(roomId);
    session.onExit(() => sessions.delete(roomId));
    sessions.set(roomId, session);
  }
  return session;
}

export function getTerminal(roomId: string): TerminalSession | undefined {
  return sessions.get(roomId);
}

export async function closeTerminal(roomId: string): Promise<void> {
  const session = sessions.get(roomId);
  if (!session) return;
  sessions.delete(roomId);
  await session.kill();
}

// Idle sweep: kills any terminal whose pty hasn't seen input/output activity
// recently. Unref'd so it never keeps the process alive on its own.
const idleSweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [roomId, session] of sessions) {
    if (now - session.lastActivityMs > env.terminalIdleTimeoutMs) {
      console.log(`Terminal for room ${roomId} idle-timed-out, closing`);
      closeTerminal(roomId);
    }
  }
}, 30_000);
idleSweepTimer.unref();
