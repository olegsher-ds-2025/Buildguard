import { ExecutionContext, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ProjectRoleGuard } from "./project-role.guard";
import type { PrismaService } from "../../../prisma/prisma.service";
import type { JwtPayload } from "../jwt-payload";

function contextFor(user: JwtPayload, projectId: string | undefined): ExecutionContext {
  const request: Record<string, unknown> = { user, params: { projectId } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
  } as unknown as ExecutionContext;
}

describe("ProjectRoleGuard", () => {
  const user: JwtPayload = { sub: "user-1", userType: "customer", aud: "monitor" };

  function makeGuard(findUniqueResult: unknown, requiredRoles?: string[]) {
    const prisma = {
      projectMember: { findUnique: jest.fn().mockResolvedValue(findUniqueResult) },
    } as unknown as PrismaService;
    const reflector = { get: jest.fn().mockReturnValue(requiredRoles) } as unknown as Reflector;
    return new ProjectRoleGuard(reflector, prisma);
  }

  it("404s when the projectId param is missing", async () => {
    const guard = makeGuard(null);
    await expect(guard.canActivate(contextFor(user, undefined))).rejects.toThrow(NotFoundException);
  });

  it("404s when the caller has no membership on the project (no leakage via 403)", async () => {
    const guard = makeGuard(null);
    await expect(guard.canActivate(contextFor(user, "project-1"))).rejects.toThrow(NotFoundException);
  });

  it("allows access when no specific role is required, just membership", async () => {
    const guard = makeGuard({ projectId: "project-1", userId: "user-1", role: "viewer" });
    await expect(guard.canActivate(contextFor(user, "project-1"))).resolves.toBe(true);
  });

  it("403s when the member's role is not in the required set", async () => {
    const guard = makeGuard({ projectId: "project-1", userId: "user-1", role: "viewer" }, ["owner", "project_manager"]);
    await expect(guard.canActivate(contextFor(user, "project-1"))).rejects.toThrow(ForbiddenException);
  });

  it("allows access when the member's role is in the required set", async () => {
    const guard = makeGuard({ projectId: "project-1", userId: "user-1", role: "owner" }, ["owner", "project_manager"]);
    await expect(guard.canActivate(contextFor(user, "project-1"))).resolves.toBe(true);
  });
});
