import type { Participant } from "@synccode/shared";
import { colorForUserId } from "./colors";

interface PresenceAvatarsProps {
  participants: Participant[];
  liveUserIds: Set<string>;
}

export function PresenceAvatars({ participants, liveUserIds }: PresenceAvatarsProps) {
  return (
    <div className="flex items-center gap-1.5 px-3">
      {participants.map((p) => {
        const online = liveUserIds.has(p.userId);
        const initial = (p.displayName ?? p.userId).charAt(0).toUpperCase();
        return (
          <div
            key={p.userId}
            title={`${p.displayName ?? p.userId} · ${p.role}${online ? " · online" : " · offline"}`}
            className="relative flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-editor-bg"
            style={{ backgroundColor: colorForUserId(p.userId), opacity: online ? 1 : 0.4 }}
          >
            {initial}
            {online && (
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-editor-panel bg-green-400" />
            )}
          </div>
        );
      })}
    </div>
  );
}
