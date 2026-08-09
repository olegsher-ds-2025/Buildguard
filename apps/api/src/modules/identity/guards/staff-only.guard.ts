import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { JwtPayload } from "../jwt-payload";

/**
 * Must run after JwtAuthGuard (e.g. @UseGuards(JwtAuthGuard, StaffOnlyGuard)).
 * Checks the token's audience, not just user_type — a leaked customer token
 * has aud='monitor' and is rejected here even before any user_type check.
 */
@Injectable()
export class StaffOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;
    if (!user || user.aud !== "admin" || user.userType !== "staff") {
      throw new ForbiddenException("Staff access required");
    }
    return true;
  }
}
