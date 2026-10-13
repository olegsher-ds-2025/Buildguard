import { NotFoundException } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import type { PrismaService } from "../../prisma/prisma.service";

function makeService(opts: { members?: string[]; already?: string[]; updated?: number; exists?: boolean } = {}) {
  const prisma = {
    projectMember: { findMany: jest.fn().mockResolvedValue((opts.members ?? ["u1", "u2"]).map((userId) => ({ userId }))) },
    notification: {
      findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(opts.already?.includes(where.userId) || opts.exists ? { id: "x" } : null)),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updated ?? 1 }),
    },
  } as unknown as PrismaService;
  return { service: new NotificationsService(prisma), prisma };
}

describe("NotificationsService", () => {
  it("notifies each member once per dedupe key", async () => {
    const { service, prisma } = makeService({ already: ["u1"] });
    const created = await service.notifyProject("p1", ["owner"], "cube_failed", { a: 1 }, "k1");
    expect(created).toBe(1);
    expect((prisma.notification.create as jest.Mock).mock.calls[0][0].data).toMatchObject({ userId: "u2", type: "cube_failed", payload: { a: 1, dedupeKey: "k1" } });
  });

  it("404s when marking another user's or a missing notification read", async () => {
    const { service } = makeService({ updated: 0 });
    await expect(service.markRead("u1", "n1")).rejects.toThrow(NotFoundException);
  });

  it("treats re-reading an already-read notification as a no-op", async () => {
    const { service } = makeService({ updated: 0, exists: true });
    await expect(service.markRead("u1", "n1")).resolves.toBeUndefined();
  });
});
