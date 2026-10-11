import type { ReactNode } from "react";
import { Link } from "react-router-dom";

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M15 14c2.5 0 5.5 1.7 5.5 5" strokeLinecap="round" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
      <path d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66" strokeLinecap="round" />
      <path d="M17.5 3v4h-4M6.5 21v-4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
      <path d="M12 3l7 3v5.5c0 4.5-3 7.7-7 9.5-4-1.8-7-5-7-9.5V6l7-3Z" strokeLinejoin="round" />
      <path d="M9 12.2l2 2 4-4.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTerminal() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M7 9.5 10.5 12 7 14.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 14.5h4.5" strokeLinecap="round" />
    </svg>
  );
}

function IconPalette() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
      <path d="M12 3a9 8 0 1 0 0 16c1.2 0 2-.9 2-2 0-.6-.2-1-.5-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17c2.2 0 4-1.8 4-4C21 5.5 17 3 12 3Z" />
      <circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
      <path d="M12 4v11" strokeLinecap="round" />
      <path d="M7.5 11 12 15.5 16.5 11" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 18.5h15" strokeLinecap="round" />
    </svg>
  );
}

const FEATURES: { title: string; desc: string; icon: ReactNode }[] = [
  {
    title: "Real-time collaborative editing",
    desc: "Monaco + Yjs keep every teammate's cursor, selection, and keystroke in sync — no merge conflicts, no save button.",
    icon: <IconUsers />,
  },
  {
    title: "Rotating team codes",
    desc: "A 6-character code refreshes every 30 seconds. No stale invite links floating around a group chat.",
    icon: <IconRefresh />,
  },
  {
    title: "Role-based permissions",
    desc: "Everyone joins as a viewer. Owners approve edit requests and can revoke or kick instantly — enforced on the server, not just hidden in the UI.",
    icon: <IconShield />,
  },
  {
    title: "Shared terminal",
    desc: "Run npm install, node, or python together in a real shared shell, rendered with xterm.js.",
    icon: <IconTerminal />,
  },
  {
    title: "VS Code-style theming",
    desc: "Dark+, Dracula, Monokai, One Dark, and more — pick a theme once, it follows you to your next session.",
    icon: <IconPalette />,
  },
  {
    title: "One-click export",
    desc: "No Git required. Download the whole room workspace as a ZIP when you're done.",
    icon: <IconDownload />,
  },
];

const STEPS = [
  {
    n: "01",
    title: "Create a room",
    desc: "Sign in, spin up a room, and you're the owner.",
  },
  {
    n: "02",
    title: "Share the code",
    desc: "Teammates enter the current 6-character code to join as viewers.",
  },
  {
    n: "03",
    title: "Code together",
    desc: "Approve edit access, open files, and build — live, in one place.",
  },
];

const STATS = ["6-character rotating codes", "8 built-in editor themes", "Real-time Yjs sync"];

function EditorMock() {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-editor-border bg-editor-panel shadow-2xl shadow-black/40">
      <div className="flex items-center gap-1.5 border-b border-editor-border bg-editor-sidebar px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
        <span className="ml-3 text-xs text-editor-muted">room-7f2a · main.py</span>
      </div>
      <div className="flex">
        <div className="hidden w-10 shrink-0 flex-col items-center gap-4 border-r border-editor-border bg-editor-sidebar py-3 sm:flex">
          <span className="h-4 w-4 rounded-sm bg-editor-text/60" />
          <span className="h-4 w-4 rounded-sm bg-editor-text/30" />
          <span className="h-4 w-4 rounded-sm bg-editor-text/30" />
        </div>
        <div className="flex-1 p-4 font-mono text-[13px] leading-6">
          <p><span className="text-pink-400">def</span> <span className="text-yellow-300">merge_sort</span>(<span className="text-orange-300">arr</span>):</p>
          <p className="pl-4"><span className="text-pink-400">if</span> len(arr) &lt;= 1:</p>
          <p className="pl-8"><span className="text-pink-400">return</span> arr</p>
          <p className="pl-4 text-editor-muted">mid = len(arr) // 2</p>
          <p className="pl-4 text-editor-muted">left, right = arr[:mid], arr[mid:]</p>
          <p className="pl-4">
            <span className="animate-blink inline-block h-4 w-[2px] translate-y-1 bg-editor-accent" />
          </p>
        </div>
      </div>
      <div className="border-t border-editor-border bg-black/40 p-3 font-mono text-xs text-green-400">
        <p>$ npm install</p>
        <p className="text-editor-muted">added 214 packages in 3s</p>
        <p>
          $ <span className="animate-blink inline-block h-3.5 w-[2px] translate-y-0.5 bg-green-400" />
        </p>
      </div>
    </div>
  );
}

export function Landing() {
  return (
    <div className="min-h-screen bg-editor-bg text-editor-text">
      <header className="sticky top-0 z-10 border-b border-editor-border/60 bg-editor-bg/80 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold text-editor-heading">
            Sync<span className="text-editor-accent">Code</span>
          </span>
          <div className="flex items-center gap-6">
            <a href="#features" className="hidden text-sm text-editor-muted hover:text-editor-heading sm:block">
              Features
            </a>
            <a href="#how-it-works" className="hidden text-sm text-editor-muted hover:text-editor-heading sm:block">
              How it works
            </a>
            <Link
              to="/login"
              className="rounded-md bg-editor-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm shadow-editor-accent/30 transition hover:brightness-110"
            >
              Sign in
            </Link>
          </div>
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-10rem] h-[28rem] w-[56rem] -translate-x-1/2 rounded-full bg-editor-accent/10 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-editor-border bg-editor-panel px-3 py-1 text-xs font-medium text-editor-text">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              No installs. No Git required.
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight text-editor-heading sm:text-5xl">
              Code with your team, <span className="text-editor-accent">live</span>, in the browser.
            </h1>
            <p className="mt-5 max-w-md text-editor-text">
              A VS Code-style collaborative IDE built for hackathon teams who don't want to fight with
              Git. Join a room with a rotating code, get real-time editing, and a shared terminal —
              no installs.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="rounded-md bg-editor-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-editor-accent/30 transition hover:brightness-110"
              >
                Get started free
              </Link>
              <a
                href="#how-it-works"
                className="rounded-md border border-editor-border px-6 py-3 text-sm font-semibold text-editor-text transition hover:border-editor-accent hover:text-editor-heading"
              >
                See how it works
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-editor-muted">
              {STATS.map((stat) => (
                <li key={stat} className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-editor-accent" />
                  {stat}
                </li>
              ))}
            </ul>
          </div>
          <div className="animate-fade-up [animation-delay:150ms]">
            <EditorMock />
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-editor-border/60 bg-editor-panel/40 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-bold text-editor-heading sm:text-3xl">Everything your team needs</h2>
          <p className="mx-auto mt-3 max-w-md text-center text-sm text-editor-muted">
            Built for the stuff that actually slows teams down during a hackathon.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-lg border border-editor-border bg-editor-panel p-6 transition hover:border-editor-accent/60 hover:bg-editor-panel/80"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-editor-accent/10 text-editor-accent transition group-hover:bg-editor-accent/20">
                  {f.icon}
                </div>
                <h3 className="mt-4 font-semibold text-editor-heading">{f.title}</h3>
                <p className="mt-2 text-sm text-editor-text">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-bold text-editor-heading sm:text-3xl">How it works</h2>
          <div className="relative mt-12 grid gap-10 md:grid-cols-3">
            <div
              aria-hidden
              className="absolute left-0 right-0 top-6 hidden h-px bg-editor-border md:block"
              style={{ marginInline: "16.6%" }}
            />
            {STEPS.map((s) => (
              <div key={s.n} className="relative text-center">
                <div className="relative z-10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-editor-accent/40 bg-editor-bg font-mono text-editor-accent">
                  {s.n}
                </div>
                <h3 className="font-semibold text-editor-heading">{s.title}</h3>
                <p className="mt-2 text-sm text-editor-text">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-editor-border/60 bg-editor-panel/40 py-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-2xl font-bold text-editor-heading sm:text-3xl">Ready to ship your next hackathon project?</h2>
          <p className="mt-3 text-editor-text">Free to use. No Git knowledge required.</p>
          <Link
            to="/login"
            className="mt-8 inline-block rounded-md bg-editor-accent px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-editor-accent/30 transition hover:brightness-110"
          >
            Create a room
          </Link>
        </div>
      </section>

      <footer className="border-t border-editor-border/60 py-8 text-center text-xs text-editor-muted">
        SyncCode is inspired by VS Code's look and feel but is an independent project, not affiliated with Microsoft.
      </footer>
    </div>
  );
}
