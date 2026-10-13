import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { HoldPointSummary } from "@buildguard/shared-types";
import { HoldPointsService } from "./hold-points.service";
import { BypassHoldPointDto, InstantiateHoldPointsDto, ReopenHoldPointDto, SignHoldPointDto } from "./dto/hold-point.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { NON_CONTRACTOR_ROLES, Roles, WRITE_ROLES } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class HoldPointsController {
  constructor(private readonly holdPoints: HoldPointsService) {}

  @Get("hold-points")
  @Roles(...NON_CONTRACTOR_ROLES)
  list(@Param("projectId") projectId: string, @Query("phaseId") phaseId?: string): Promise<HoldPointSummary[]> {
    return this.holdPoints.list(projectId, phaseId);
  }

  @Post("phases/:phaseId/hold-points/from-template")
  @Roles(...WRITE_ROLES)
  instantiate(
    @Param("projectId") projectId: string,
    @Param("phaseId") phaseId: string,
    @Body() dto: InstantiateHoldPointsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<HoldPointSummary[]> {
    return this.holdPoints.instantiateForPhase(projectId, phaseId, dto.templateId, user.sub);
  }

  @Post("hold-points/:holdPointId/sign")
  @Roles(...WRITE_ROLES)
  sign(
    @Param("projectId") projectId: string,
    @Param("holdPointId") holdPointId: string,
    @Body() dto: SignHoldPointDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<HoldPointSummary> {
    return this.holdPoints.sign(projectId, holdPointId, dto, user.sub);
  }

  @Post("hold-points/:holdPointId/bypass")
  @Roles("owner")
  bypass(
    @Param("projectId") projectId: string,
    @Param("holdPointId") holdPointId: string,
    @Body() dto: BypassHoldPointDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<HoldPointSummary> {
    return this.holdPoints.bypass(projectId, holdPointId, dto, user.sub);
  }

  @Post("hold-points/:holdPointId/reopen")
  @Roles(...WRITE_ROLES)
  reopen(
    @Param("projectId") projectId: string,
    @Param("holdPointId") holdPointId: string,
    @Body() dto: ReopenHoldPointDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<HoldPointSummary> {
    return this.holdPoints.reopen(projectId, holdPointId, dto, user.sub);
  }

  @Post("phases/:phaseId/approve")
  @Roles(...WRITE_ROLES)
  approvePhase(
    @Param("projectId") projectId: string,
    @Param("phaseId") phaseId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.holdPoints.approvePhase(projectId, phaseId, user.sub);
  }
}
