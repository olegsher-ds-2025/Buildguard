import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { FindingSummary } from "@buildguard/shared-types";
import { FindingsService } from "./findings.service";
import { ApproveFindingDto } from "./dto/approve-finding.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { NON_CONTRACTOR_ROLES, WRITE_ROLES, Roles } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/findings")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class FindingsController {
  constructor(private readonly findings: FindingsService) {}

  @Get()
  @Roles(...NON_CONTRACTOR_ROLES)
  list(@Param("projectId") projectId: string): Promise<FindingSummary[]> {
    return this.findings.list(projectId);
  }

  @Post(":detectionId/approve")
  @Roles(...WRITE_ROLES)
  approve(
    @Param("projectId") projectId: string,
    @Param("detectionId") detectionId: string,
    @Body() dto: ApproveFindingDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<FindingSummary> {
    return this.findings.approve(projectId, detectionId, dto, user.sub);
  }

  @Post(":detectionId/dismiss")
  @Roles(...WRITE_ROLES)
  dismiss(
    @Param("projectId") projectId: string,
    @Param("detectionId") detectionId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<FindingSummary> {
    return this.findings.dismiss(projectId, detectionId, user.sub);
  }
}
