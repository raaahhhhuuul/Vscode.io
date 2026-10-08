import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createEntry,
  deleteEntry,
  deleteRoomWorkspace,
  ensureRoomWorkspace,
  listTree,
  PathTraversalError,
  readFileSafe,
  renameEntry,
  resolveSafePath,
  writeFileSafe,
} from "../src/services/workspaceFs.js";

describe("workspaceFs", () => {
  const roomIds: string[] = [];

  function freshRoomId(): string {
    const id = randomUUID();
    roomIds.push(id);
    return id;
  }

  afterEach(async () => {
    await Promise.all(roomIds.splice(0).map((id) => deleteRoomWorkspace(id)));
  });

  it("resolves a normal nested path inside the room workspace", async () => {
    const roomId = freshRoomId();
    await ensureRoomWorkspace(roomId);
    expect(() => resolveSafePath(roomId, "src/index.ts")).not.toThrow();
  });

  it.each(["../secret.txt", "../../etc/passwd", "a/../../b", "..\\..\\windows\\system.ini"])(
    "rejects a traversal attempt: %s",
    (maliciousPath) => {
      const roomId = freshRoomId();
      expect(() => resolveSafePath(roomId, maliciousPath)).toThrow(PathTraversalError);
    },
  );

  it("rejects an absolute path", () => {
    const roomId = freshRoomId();
    expect(() => resolveSafePath(roomId, "/etc/passwd")).toThrow(PathTraversalError);
    expect(() => resolveSafePath(roomId, "C:\\Windows\\system.ini")).toThrow(PathTraversalError);
  });

  it("rejects a path containing a null byte", () => {
    const roomId = freshRoomId();
    expect(() => resolveSafePath(roomId, "file.txt\0.png")).toThrow(PathTraversalError);
  });

  it("creates, writes, reads, renames, and deletes a file", async () => {
    const roomId = freshRoomId();
    await ensureRoomWorkspace(roomId);

    await createEntry(roomId, "notes/todo.md", "file");
    await writeFileSafe(roomId, "notes/todo.md", "- ship it");
    expect(await readFileSafe(roomId, "notes/todo.md")).toBe("- ship it");

    await renameEntry(roomId, "notes/todo.md", "notes/done.md");
    expect(await readFileSafe(roomId, "notes/done.md")).toBe("- ship it");

    await deleteEntry(roomId, "notes/done.md");
    await expect(readFileSafe(roomId, "notes/done.md")).rejects.toThrow();
  });

  it("will not create a file that already exists, or delete/rename via a traversal path", async () => {
    const roomId = freshRoomId();
    await ensureRoomWorkspace(roomId);
    await createEntry(roomId, "a.txt", "file");

    await expect(createEntry(roomId, "a.txt", "file")).rejects.toThrow();
    await expect(deleteEntry(roomId, "../a.txt")).rejects.toThrow(PathTraversalError);
    await expect(renameEntry(roomId, "a.txt", "../a.txt")).rejects.toThrow(PathTraversalError);
  });

  it("lists the tree with directories before files, alphabetically", async () => {
    const roomId = freshRoomId();
    await ensureRoomWorkspace(roomId);
    await createEntry(roomId, "zeta.txt", "file");
    await createEntry(roomId, "alpha", "dir");
    await deleteEntry(roomId, "README.md"); // seeded by ensureRoomWorkspace

    const tree = await listTree(roomId);
    expect(tree.map((n) => n.name)).toEqual(["alpha", "zeta.txt"]);
    expect(tree[0].type).toBe("dir");
  });
});
