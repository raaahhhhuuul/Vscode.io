export type RoomBootstrapStage = "connecting" | "workspace" | "syncing" | "ready";

const STEPS: { key: Exclude<RoomBootstrapStage, "ready">; label: string }[] = [
  { key: "connecting", label: "Connecting" },
  { key: "workspace", label: "Preparing workspace" },
  { key: "syncing", label: "Syncing files" },
];

function statusFor(stepIndex: number, currentIndex: number): "done" | "active" | "pending" {
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

interface RoomLoadingScreenProps {
  stage: RoomBootstrapStage;
  /** false when nested under a header that's already shown (e.g. the team
   * code is already visible) — fills its container instead of the viewport. */
  fullScreen?: boolean;
}

/**
 * Each step lights up only when the real underlying call it represents
 * actually resolves (see Room.tsx) — there is no setTimeout driving this.
 */
export function RoomLoadingScreen({ stage, fullScreen = true }: RoomLoadingScreenProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === stage);

  return (
    <div
      className={`flex ${fullScreen ? "min-h-screen" : "h-full"} flex-col items-center justify-center gap-8 bg-editor-bg px-4`}
    >
      {fullScreen && (
        <div className="text-lg font-semibold text-editor-heading">
          VScode<span className="text-editor-accent">.io</span>
        </div>
      )}
      <ul className="w-full max-w-xs space-y-4">
        {STEPS.map((step, i) => {
          const status = statusFor(i, currentIndex);
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                  status === "done"
                    ? "border-editor-accent bg-editor-accent text-editor-bg"
                    : status === "active"
                      ? "border-editor-accent text-editor-accent"
                      : "border-editor-border text-editor-muted"
                }`}
              >
                {status === "done" ? "✓" : i + 1}
              </span>
              <span
                className={
                  status === "pending" ? "text-sm text-editor-muted" : "text-sm text-editor-text"
                }
              >
                {step.label}
                {status === "active" && (
                  <span className="animate-blink ml-1 inline-block h-3 w-[2px] translate-y-0.5 bg-editor-accent" />
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
