import { SetMetadata } from "@nestjs/common";
import type { ProjectRole } from "@buildguard/shared-types";

export const ROLES_KEY = "project_roles";

/** Restricts a project-scoped route to the given roles. Enforced by ProjectRoleGuard. */
export const Roles = (...roles: ProjectRole[]) => SetMetadata(ROLES_KEY, roles);
