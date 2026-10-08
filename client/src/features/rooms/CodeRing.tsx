import { useEffect, useState } from "react";

interface CodeRingProps {
  rotatesAt: string;
  durationMs?: number;
  size?: number;
}

export function CodeRing({ rotatesAt, durationMs = 30_000, size = 40 }: CodeRingProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const rotatesAtMs = new Date(rotatesAt).getTime();
  const remainingMs = Math.max(0, rotatesAtMs - now);
  const fraction = Math.min(1, remainingMs / durationMs);

  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fraction);
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-editor-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="text-editor-accent transition-[stroke-dashoffset] duration-200 ease-linear"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-editor-muted">
        {seconds}
      </span>
    </div>
  );
}
