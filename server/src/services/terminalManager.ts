import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import type { IPty, IPtyForkOptions } from "node-pty";
import { env } from "../config/env.js";
import { getRoomWorkspacePath } from "./workspaceFs.js";

// node-pty is a native addon. It's loaded on first terminal use instead of at
// import time, so a missing/broken build only disables the terminal instead
// of stopping the whole server from starting (which surfaces in the browser
// as an unhelpful "Failed to fetch" on every request, room creation included).
const requireCjs = createRequire(import.meta.url);
let ptyModule: typeof import("node-pty") | null = null;
function loadPty(): typeof import("node-pty") {
  if (!ptyModule) {
    try {
      ptyModule = requireCjs("node-pty") as typeof import("node-pty");
    } catch (err) {
      throw new Error(
        `The terminal's native module (node-pty) failed to load: ${(err as Error).message}. ` +
          "Run `npm rebuild node-pty` from the repo root.",
      );
    }
  }
  return ptyModule;
}

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
  if (process.platform === "win32") return buildWindowsSpawnConfig(cwd);

  const candidateShells = [process.env.SHELL, "/bin/bash", "/bin/sh"].filter(
    (s): s is string => !!s && existsSync(s),
  );
  const shell = candidateShells[0] ?? "/bin/sh";

  // The server runs as a non-root user, so "global" installs (pip install,
  // npm -g, cargo install, go install) go to a shared tools dir outside the
  // workspace: they work like on a personal machine without cluttering the
  // room's file explorer or ZIP export.
  const tools = "/tmp/synccode-tools";
  const basePath = process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
  const envObj: Record<string, string> = {
    PATH: [`${tools}/python/bin`, `${tools}/npm/bin`, `${tools}/cargo/bin`, `${tools}/go/bin`, basePath].join(":"),
    HOME: cwd,
    TMPDIR: "/tmp",
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    SHELL: shell,
    LANG: process.env.LANG ?? "C.UTF-8",
    PYTHONUSERBASE: `${tools}/python`,
    PIP_BREAK_SYSTEM_PACKAGES: "1",
    PIP_CACHE_DIR: `${tools}/cache/pip`,
    npm_config_prefix: `${tools}/npm`,
    npm_config_cache: `${tools}/cache/npm`,
    CARGO_HOME: `${tools}/cargo`,
    GOPATH: `${tools}/go`,
    GOCACHE: `${tools}/cache/go-build`,
    HISTFILE: "/dev/null",
  };
  if (process.env.JAVA_HOME) envObj.JAVA_HOME = process.env.JAVA_HOME;

  const ulimitScript = [
    // 0 = no virtual-memory cap. Node, Java and Go all reserve far more
    // *virtual* address space than they use, so a -v cap makes them fail to
    // start at all; bound real memory with the container's memory limit.
    ...(env.terminalMaxVirtualMemoryKb > 0 ? [`ulimit -v ${env.terminalMaxVirtualMemoryKb} 2>/dev/null`] : []),
    `ulimit -u ${env.terminalMaxProcesses} 2>/dev/null`,
    `ulimit -t ${env.terminalMaxCpuSeconds} 2>/dev/null`,
    `exec "$SHELL"`,
  ].join("; ");

  return { command: "/bin/sh", args: ["-c", ulimitScript], envObj };
}

const GIT_BASH_CANDIDATES = [
  process.env.TERMINAL_SHELL,
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Programs\\Git\\bin\\bash.exe` : undefined,
];

/** Reads a variable's *current* machine + user value from the registry, so a
 * language installed after the server started (which updates PATH/JAVA_HOME
 * there) works in new terminals without restarting the server. */
function readRegistryEnv(name: string): string | undefined {
  const keys = [
    "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
    "HKCU\\Environment",
  ];
  const values: string[] = [];
  for (const key of keys) {
    try {
      const out = execFileSync("reg", ["query", key, "/v", name], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 3000,
        stdio: ["ignore", "pipe", "ignore"], // "value not found" is expected, not log-worthy
      });
      const match = out.match(new RegExp(`^\\s*${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)$`, "im"));
      if (match) values.push(expandWindowsVars(match[1].trim()));
    } catch {
      // not set in this hive
    }
  }
  return values.length > 0 ? values.join(";") : undefined;
}

function expandWindowsVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] ?? whole);
}

function freshWindowsPath(): string {
  const seen = new Set<string>();
  const parts = [readRegistryEnv("Path"), process.env.PATH]
    .filter((p): p is string => !!p)
    .flatMap((p) => p.split(";"))
    .map((p) => p.trim())
    .filter((p) => {
      const key = p.toLowerCase().replace(/\\+$/, "");
      if (!p || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return parts.join(";");
}

/**
 * Windows dev: runs Git Bash (bash commands, ls/grep/curl, ./scripts) when
 * it's installed, falling back to cmd.exe. Windows has no ulimit equivalent,
 * so there are no resource caps here — the deployment target is Linux.
 */
function buildWindowsSpawnConfig(cwd: string): { command: string; args: string[]; envObj: Record<string, string> } {
  const passthrough = [
    "SystemRoot", "windir", "ComSpec", "PATHEXT", "OS", "SystemDrive",
    "ProgramData", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432",
    "CommonProgramFiles", "CommonProgramFiles(x86)", "CommonProgramW6432",
    "APPDATA", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "COMPUTERNAME",
  ];
  const envObj: Record<string, string> = {};
  for (const name of passthrough) {
    const value = process.env[name];
    if (value) envObj[name] = value;
  }
  Object.assign(envObj, {
    PATH: freshWindowsPath(),
    // Temp files go to the system temp dir, not the room's file explorer.
    TEMP: process.env.TEMP ?? cwd,
    TMP: process.env.TMP ?? cwd,
    USERPROFILE: cwd,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  });
  // Toolchain locations/caches, read fresh in case they were just installed.
  for (const name of ["JAVA_HOME", "GOROOT"]) {
    const value = readRegistryEnv(name) ?? process.env[name];
    if (value) envObj[name] = value.split(";")[0];
  }
  if (process.env.USERPROFILE) envObj.GOPATH = `${process.env.USERPROFILE}\\go`;

  const bash = GIT_BASH_CANDIDATES.find((p): p is string => !!p && existsSync(p));
  if (!bash) {
    console.warn("[terminal] Git Bash not found — falling back to cmd.exe. Install Git for Windows for a bash terminal.");
    return { command: "cmd.exe", args: [], envObj };
  }

  Object.assign(envObj, {
    HOME: cwd,
    // Keep Windows' PATH (python, java, go…) on top of Git's own tools.
    MSYS2_PATH_TYPE: "inherit",
    // Start in the workspace, not $HOME, after the login profile runs.
    CHERE_INVOKING: "1",
    MSYSTEM: "MINGW64",
    LANG: "en_US.UTF-8",
    // No ~/.bash_history file appearing in the room's file explorer.
    HISTFILE: "/dev/null",
  });
  return { command: bash, args: ["--rcfile", windowsBashRcPath(), "-i"], envObj };
}

// Startup script for the Windows bash terminal. Kept in the OS temp dir (not
// the workspace) so it never shows up in the room's file explorer.
const WINDOWS_BASHRC = `# Generated by SyncCode — the shared terminal's bash startup file.
[ -f /etc/profile ] && . /etc/profile
# Windows' "python3" is a Microsoft Store stub; on Linux python3/pip3 are the
# normal names, so point them at the real Python when it's installed.
if ! python3 --version >/dev/null 2>&1 && python --version >/dev/null 2>&1; then
  alias python3=python
  alias pip3='python -m pip'
fi
command -v pip >/dev/null 2>&1 || { python --version >/dev/null 2>&1 && alias pip='python -m pip'; }
# Windows make is often installed as mingw32-make only.
command -v make >/dev/null 2>&1 || { command -v mingw32-make >/dev/null 2>&1 && alias make=mingw32-make; }
`;

let windowsBashRc: string | null = null;
function windowsBashRcPath(): string {
  if (!windowsBashRc) {
    const file = path.join(os.tmpdir(), "synccode-terminal.bashrc");
    writeFileSync(file, WINDOWS_BASHRC, "utf8");
    windowsBashRc = file.replace(/\\/g, "/");
  }
  return windowsBashRc;
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
      return loadPty().spawn(command, args, withUidGid);
    } catch (err) {
      if (withUidGid.uid === undefined) throw err;
      console.warn(
        "Terminal spawn with TERMINAL_UID/GID failed (server probably isn't running as root); " +
          "retrying without dropping privileges:",
        (err as Error).message,
      );
      return loadPty().spawn(command, args, options);
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
