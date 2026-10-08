import { useEffect, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { roomWsBase } from "./wsUrl";
import { colorForUserId } from "./colors";

export function useRoomPresence(
  roomId: string,
  roomToken: string,
  you: { userId: string; displayName: string | null },
): Set<string> {
  const [liveUserIds, setLiveUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(roomWsBase(), `presence:${roomId}`, doc, {
      params: { token: roomToken },
    });
    provider.awareness.setLocalStateField("user", {
      id: you.userId,
      name: you.displayName ?? "Anonymous",
      color: colorForUserId(you.userId),
    });

    const update = () => {
      const ids = new Set<string>();
      provider.awareness.getStates().forEach((state) => {
        const user = (state as { user?: { id?: string } }).user;
        if (user?.id) ids.add(user.id);
      });
      setLiveUserIds(ids);
    };
    provider.awareness.on("change", update);
    update();

    return () => {
      provider.awareness.off("change", update);
      provider.destroy();
      doc.destroy();
    };
  }, [roomId, roomToken, you.userId, you.displayName]);

  return liveUserIds;
}
