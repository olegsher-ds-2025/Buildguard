import { IsEmail, IsIn } from "class-validator";
import type { ProjectRole } from "@buildguard/shared-types";

const PROJECT_ROLES: ProjectRole[] = ["owner", "project_manager", "contractor", "inspector", "viewer"];

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(PROJECT_ROLES)
  role!: ProjectRole;
}
