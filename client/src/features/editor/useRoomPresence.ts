import { useEffect, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { EditRequest } from "@synccode/shared";
import { roomWsBase } from "./wsUrl";
import { colorForUserId } from "./colors";

export interface RoomPresence {
  liveUserIds: Set<string>;
  editRequests: EditRequest[];
}

export function useRoomPresence(
  roomId: string,
  roomToken: string,
  you: { userId: string; displayName: string | null },
): RoomPresence {
  const [liveUserIds, setLiveUserIds] = useState<Set<string>>(new Set());
  const [editRequests, setEditRequests] = useState<EditRequest[]>([]);

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

    const updatePresence = () => {
      const ids = new Set<string>();
      provider.awareness.getStates().forEach((state) => {
        const user = (state as { user?: { id?: string } }).user;
        if (user?.id) ids.add(user.id);
      });
      setLiveUserIds(ids);
    };
    provider.awareness.on("change", updatePresence);
    updatePresence();

    const requestsMap = doc.getMap<EditRequest>("requests");
    const updateRequests = () => setEditRequests(Array.from(requestsMap.values()));
    requestsMap.observe(updateRequests);
    updateRequests();

    return () => {
      provider.awareness.off("change", updatePresence);
      requestsMap.unobserve(updateRequests);
      provider.destroy();
      doc.destroy();
    };
  }, [roomId, roomToken, you.userId, you.displayName]);

  return { liveUserIds, editRequests };
}
