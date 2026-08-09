import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { TeamService } from "./team.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

describe("TeamService", () => {
  const project = { id: "proj-1", ownerUserId: "owner-1" };

  function makeService(opts: { existingMember?: unknown; user?: unknown } = {}) {
    const prisma = {
      project: { findUniqueOrThrow: jest.fn().mockResolvedValue(project) },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue("user" in opts ? opts.user : { id: "u-2", userType: "customer" }),
      },
      projectMember: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(opts.existingMember ?? null),
        create: jest.fn().mockImplementation(({ data }) => ({
          ...data,
          user: { email: "invitee@example.com", displayName: "Invitee" },
        })),
        update: jest.fn().mockImplementation(({ where, data }) => ({
          userId: where.projectId_userId.userId,
          ...data,
          invitedAt: new Date(),
          acceptedAt: new Date(),
          user: { email: "member@example.com", displayName: "Member" },
        })),
        delete: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return { service: new TeamService(prisma, audit), prisma, audit };
  }

  it("inviting an email with no account fails clearly rather than silently no-op-ing", async () => {
    const { service } = makeService({ user: null });
    await expect(service.invite("proj-1", { email: "nobody@x.com", role: "viewer" }, "owner-1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("inviting an already-existing member is rejected, not silently duplicated", async () => {
    const { service } = makeService({ existingMember: { projectId: "proj-1", userId: "u-2" } });
    await expect(service.invite("proj-1", { email: "u2@x.com", role: "viewer" }, "owner-1")).rejects.toThrow(
      ConflictException,
    );
  });

  it("cannot change the canonical project owner's role away from owner", async () => {
    const { service } = makeService();
    await expect(service.changeRole("proj-1", "owner-1", { role: "viewer" }, "owner-1")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("can change a non-owner member's role, and it is audited", async () => {
    const { service, audit } = makeService();
    const result = await service.changeRole("proj-1", "u-2", { role: "project_manager" }, "owner-1");
    expect(result.role).toBe("project_manager");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "project_member_role_changed", entityId: "u-2" }),
    );
  });

  it("cannot remove the canonical project owner", async () => {
    const { service } = makeService();
    await expect(service.remove("proj-1", "owner-1", "owner-1")).rejects.toThrow(BadRequestException);
  });

  it("can remove a non-owner member, and it is audited", async () => {
    const { service, prisma, audit } = makeService();
    await service.remove("proj-1", "u-2", "owner-1");
    expect(prisma.projectMember.delete).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "project_member_removed", entityId: "u-2" }),
    );
  });
});
