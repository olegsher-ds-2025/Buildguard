import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { ProjectMember, ProjectRole } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { JwtPayload } from "../jwt-payload";

/**
 * Applies to routes shaped /projects/:projectId/*. Loads the caller's
 * ProjectMember row and, if @Roles(...) is set on the handler, checks the
 * role is in that list. A missing membership 404s rather than 403s, so an
 * unauthorized caller can't tell a project exists from the response code —
 * per design doc §9.1, this check happens server-side, not just in the UI.
 */
@Injectable()
export class ProjectRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload; projectMember?: ProjectMember }>();
    const projectId = request.params.projectId;
    if (!projectId) {
      throw new NotFoundException();
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: request.user.sub } },
    });
    if (!membership) {
      throw new NotFoundException();
    }

    const requiredRoles = this.reflector.get<ProjectRole[] | undefined>(ROLES_KEY, context.getHandler());
    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException();
    }

    request.projectMember = membership;
    return true;
  }
}
