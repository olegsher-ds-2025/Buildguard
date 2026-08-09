import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { ProjectMemberSummary } from "@buildguard/shared-types";
import { TeamService } from "./team.service";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { ChangeMemberRoleDto } from "./dto/change-member-role.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { Roles } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/members")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(@Param("projectId") projectId: string): Promise<ProjectMemberSummary[]> {
    return this.team.list(projectId);
  }

  @Post()
  @Roles("owner")
  invite(
    @Param("projectId") projectId: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProjectMemberSummary> {
    return this.team.invite(projectId, dto, user.sub);
  }

  @Patch(":userId")
  @Roles("owner")
  changeRole(
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
    @Body() dto: ChangeMemberRoleDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProjectMemberSummary> {
    return this.team.changeRole(projectId, userId, dto, user.sub);
  }

  @Delete(":userId")
  @Roles("owner")
  remove(
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.team.remove(projectId, userId, user.sub);
  }
}
