import { useState } from "react";
import type { Participant, Role } from "@synccode/shared";

interface ManageAccessPanelProps {
  participants: Participant[];
  ownerId: string;
  onChangeRole: (userId: string, role: "editor" | "viewer") => void;
  onKick: (userId: string) => void;
  onClose: () => void;
}

export function ManageAccessPanel({ participants, ownerId, onChangeRole, onKick, onClose }: ManageAccessPanelProps) {
  return (
    <div className="absolute right-4 top-12 z-20 w-72 rounded-md border border-editor-border bg-editor-panel shadow-xl">
      <div className="flex items-center justify-between border-b border-editor-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-editor-muted">Manage access</span>
        <button onClick={onClose} className="text-xs text-editor-muted hover:text-white">
          ✕
        </button>
      </div>
      <ul className="max-h-80 overflow-y-auto">
        {participants.map((p) => (
          <ParticipantRow
            key={p.userId}
            participant={p}
            isOwnerRow={p.userId === ownerId}
            onChangeRole={onChangeRole}
            onKick={onKick}
          />
        ))}
      </ul>
    </div>
  );
}

function ParticipantRow({
  participant,
  isOwnerRow,
  onChangeRole,
  onKick,
}: {
  participant: Participant;
  isOwnerRow: boolean;
  onChangeRole: (userId: string, role: "editor" | "viewer") => void;
  onKick: (userId: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleRoleChange(role: Role) {
    if (role !== "editor" && role !== "viewer") return;
    setBusy(true);
    try {
      onChangeRole(participant.userId, role);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="truncate">{participant.displayName ?? participant.userId}</span>
      {isOwnerRow ? (
        <span className="text-xs text-editor-muted">owner</span>
      ) : (
        <div className="flex items-center gap-1.5">
          <select
            value={participant.role}
            disabled={busy}
            onChange={(e) => handleRoleChange(e.target.value as Role)}
            className="rounded border border-editor-border bg-editor-bg px-1 py-0.5 text-xs text-editor-text"
          >
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
          </select>
          <button
            onClick={() => onKick(participant.userId)}
            title="Remove from room"
            className="text-xs text-editor-muted hover:text-red-400"
          >
            Kick
          </button>
        </div>
      )}
    </li>
  );
}
