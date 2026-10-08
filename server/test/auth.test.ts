import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

const getUserMock = vi.fn();

vi.mock("../src/lib/supabase.js", () => ({
  supabase: { auth: { getUser: getUserMock } },
}));

const { requireSupabaseAuth } = await import("../src/middleware/supabaseAuth.js");

function mockRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  });
  return res as Response & { statusCode?: number; body?: unknown };
}

function mockReq(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request;
}

describe("requireSupabaseAuth", () => {
  beforeEach(() => {
    getUserMock.mockReset();
  });

  it("rejects requests with no bearer token", async () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = vi.fn();

    await requireSupabaseAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired token", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    const req = mockReq("Bearer bad-token");
    const res = mockRes();
    const next = vi.fn();

    await requireSupabaseAuth(req, res, next);

    expect(getUserMock).toHaveBeenCalledWith("bad-token");
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches the verified user and calls next() for a valid token", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "user-123",
          email: "student@example.com",
          user_metadata: { full_name: "Ada Lovelace", avatar_url: "https://img/ada.png" },
        },
      },
      error: null,
    });
    const req = mockReq("Bearer good-token");
    const res = mockRes();
    const next = vi.fn();

    await requireSupabaseAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({
      id: "user-123",
      email: "student@example.com",
      displayName: "Ada Lovelace",
      avatarUrl: "https://img/ada.png",
    });
  });
});
