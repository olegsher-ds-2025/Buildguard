import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import type { ProjectMember } from "@prisma/client";
import type { DefectSummary } from "@buildguard/shared-types";
import { DefectsService } from "./defects.service";
import { AssignDefectDto, DefectActionDto } from "./dto/defect.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { Roles, WRITE_ROLES } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

type MemberRequest = Request & { projectMember: ProjectMember };

@Controller("projects/:projectId/defects")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class DefectsController {
  constructor(private readonly defects: DefectsService) {}

  @Get()
  list(@Param("projectId") projectId: string, @Req() req: MemberRequest, @CurrentUser() user: JwtPayload): Promise<DefectSummary[]> {
    return this.defects.list(projectId, user.sub, req.projectMember.role);
  }

  @Post(":defectId/assign")
  @Roles(...WRITE_ROLES)
  assign(
    @Param("projectId") projectId: string,
    @Param("defectId") defectId: string,
    @Body() dto: AssignDefectDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DefectSummary> {
    return this.defects.assign(projectId, defectId, dto, user.sub);
  }

  // Role limits per action (assignee vs. reviewer) are enforced in the service.
  @Post(":defectId/start")
  start(@Param("projectId") p: string, @Param("defectId") d: string, @Body() dto: DefectActionDto, @Req() req: MemberRequest, @CurrentUser() user: JwtPayload) {
    return this.defects.transition(p, d, "start", dto.note, { userId: user.sub, role: req.projectMember.role });
  }

  @Post(":defectId/fix")
  fix(@Param("projectId") p: string, @Param("defectId") d: string, @Body() dto: DefectActionDto, @Req() req: MemberRequest, @CurrentUser() user: JwtPayload) {
    return this.defects.transition(p, d, "fix", dto.note, { userId: user.sub, role: req.projectMember.role });
  }

  @Post(":defectId/verify")
  @Roles(...WRITE_ROLES)
  verify(@Param("projectId") p: string, @Param("defectId") d: string, @Body() dto: DefectActionDto, @Req() req: MemberRequest, @CurrentUser() user: JwtPayload) {
    return this.defects.transition(p, d, "verify", dto.note, { userId: user.sub, role: req.projectMember.role });
  }

  @Post(":defectId/reopen")
  @Roles(...WRITE_ROLES)
  reopen(@Param("projectId") p: string, @Param("defectId") d: string, @Body() dto: DefectActionDto, @Req() req: MemberRequest, @CurrentUser() user: JwtPayload) {
    return this.defects.transition(p, d, "reopen", dto.note, { userId: user.sub, role: req.projectMember.role });
  }
}
