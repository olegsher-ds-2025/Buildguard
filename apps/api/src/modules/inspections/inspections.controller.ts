import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { InspectionDetail, InspectionItemState, InspectionSummary } from "@buildguard/shared-types";
import { InspectionsService } from "./inspections.service";
import { CreateInspectionDto } from "./dto/create-inspection.dto";
import { RecordResultDto } from "./dto/record-result.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { NON_CONTRACTOR_ROLES, Roles, WRITE_ROLES } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/inspections")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get()
  @Roles(...NON_CONTRACTOR_ROLES)
  list(@Param("projectId") projectId: string): Promise<InspectionSummary[]> {
    return this.inspections.list(projectId);
  }

  @Get(":inspectionId")
  @Roles(...NON_CONTRACTOR_ROLES)
  get(@Param("projectId") projectId: string, @Param("inspectionId") inspectionId: string): Promise<InspectionDetail> {
    return this.inspections.get(projectId, inspectionId);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(
    @Param("projectId") projectId: string,
    @Body() dto: CreateInspectionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<InspectionDetail> {
    return this.inspections.create(projectId, dto, user.sub);
  }

  @Post(":inspectionId/results")
  @Roles(...WRITE_ROLES)
  recordResult(
    @Param("projectId") projectId: string,
    @Param("inspectionId") inspectionId: string,
    @Body() dto: RecordResultDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<InspectionItemState> {
    return this.inspections.recordResult(projectId, inspectionId, dto, user.sub);
  }

  @Post(":inspectionId/complete")
  @Roles(...WRITE_ROLES)
  complete(
    @Param("projectId") projectId: string,
    @Param("inspectionId") inspectionId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<InspectionDetail> {
    return this.inspections.complete(projectId, inspectionId, user.sub);
  }
}
