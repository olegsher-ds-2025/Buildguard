import { SetMetadata } from "@nestjs/common";
import type { ProjectRole } from "@buildguard/shared-types";

export const ROLES_KEY = "project_roles";

/** Restricts a project-scoped route to the given roles. Enforced by ProjectRoleGuard. */
export const Roles = (...roles: ProjectRole[]) => SetMetadata(ROLES_KEY, roles);

/** Everyone except contractors, who see only what is explicitly shared with them. */
export const NON_CONTRACTOR_ROLES: ProjectRole[] = ["owner", "project_manager", "inspector", "viewer"];

/** Roles that may create or change project records. */
export const WRITE_ROLES: ProjectRole[] = ["owner", "project_manager", "inspector"];
