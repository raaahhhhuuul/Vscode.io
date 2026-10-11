import type { EditRequest } from "@synccode/shared";

interface EditRequestsBannerProps {
  requests: EditRequest[];
  onApprove: (userId: string) => void;
  onDeny: (userId: string) => void;
}

export function EditRequestsBanner({ requests, onApprove, onDeny }: EditRequestsBannerProps) {
  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5">
      {requests.map((r) => (
        <div key={r.userId} className="flex items-center justify-between text-xs">
          <span className="text-amber-200">{r.displayName ?? r.userId} is requesting edit access</span>
          <div className="flex gap-2">
            <button
              onClick={() => onApprove(r.userId)}
              className="rounded bg-green-600/80 px-2 py-0.5 font-medium text-white hover:bg-green-600"
            >
              Approve
            </button>
            <button
              onClick={() => onDeny(r.userId)}
              className="rounded bg-red-600/60 px-2 py-0.5 font-medium text-white hover:bg-red-600"
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
