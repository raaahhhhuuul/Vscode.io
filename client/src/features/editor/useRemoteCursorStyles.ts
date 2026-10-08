import { useEffect } from "react";
import type { Awareness } from "y-protocols/awareness";

interface AwareUser {
  name: string;
  color: string;
}

/**
 * y-monaco only applies generic CSS classes to remote selections/cursors
 * (`yRemoteSelection-<clientID>`, `yRemoteSelectionHead-<clientID>`) — it
 * deliberately leaves coloring and name labels to the app. This injects a
 * <style> tag with per-client rules derived from awareness state, rebuilt
 * whenever presence changes.
 */
export function useRemoteCursorStyles(awareness: Awareness | null): void {
  useEffect(() => {
    if (!awareness) return;

    const styleEl = document.createElement("style");
    document.head.appendChild(styleEl);

    const render = () => {
      let css = "";
      awareness.getStates().forEach((state, clientId) => {
        const user = (state as { user?: AwareUser }).user;
        if (!user) return;
        css += `
          .yRemoteSelection-${clientId} { background-color: ${user.color}33; }
          .yRemoteSelectionHead-${clientId} {
            position: relative;
            border-left: 2px solid ${user.color};
          }
          .yRemoteSelectionHead-${clientId}::after {
            content: '${user.name.replace(/'/g, "")}';
            position: absolute;
            top: -1.1em;
            left: -2px;
            font-size: 10px;
            line-height: 1.3;
            background: ${user.color};
            color: #1e1e1e;
            padding: 0 4px;
            border-radius: 2px;
            white-space: nowrap;
            pointer-events: none;
          }
        `;
      });
      styleEl.textContent = css;
    };

    awareness.on("change", render);
    render();

    return () => {
      awareness.off("change", render);
      styleEl.remove();
    };
  }, [awareness]);
}
