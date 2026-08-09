import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { StaffOnlyGuard } from "./staff-only.guard";
import type { JwtPayload } from "../jwt-payload";

function contextWithUser(user: JwtPayload | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe("StaffOnlyGuard", () => {
  const guard = new StaffOnlyGuard();

  it("allows a staff token with aud=admin", () => {
    const ctx = contextWithUser({ sub: "u1", userType: "staff", aud: "admin", staffRole: "ops_admin" });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("rejects a customer token even with aud spoofed to admin", () => {
    const ctx = contextWithUser({ sub: "u1", userType: "customer", aud: "admin" });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("rejects a staff token whose aud is monitor", () => {
    const ctx = contextWithUser({ sub: "u1", userType: "staff", aud: "monitor", staffRole: "ops_admin" });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("rejects when there is no user on the request", () => {
    const ctx = contextWithUser(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
