import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { CadViewerDataResponse, CreateMeasurementRequest, MeasurementSummary } from "@buildguard/shared-types";
import { CadService } from "./cad.service";
import { CreateMeasurementDto } from "./dto/create-measurement.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { NON_CONTRACTOR_ROLES, WRITE_ROLES, Roles } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/documents/:documentId/cad")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class CadController {
  constructor(private readonly cad: CadService) {}

  @Get("viewer")
  @Roles(...NON_CONTRACTOR_ROLES)
  getViewer(
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
  ): Promise<CadViewerDataResponse> {
    return this.cad.getViewerData(projectId, documentId);
  }

  @Get("measurements")
  @Roles(...NON_CONTRACTOR_ROLES)
  listMeasurements(
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
  ): Promise<MeasurementSummary[]> {
    return this.cad.listMeasurements(projectId, documentId);
  }

  @Post("measurements")
  @Roles(...WRITE_ROLES)
  createMeasurement(
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Body() dto: CreateMeasurementDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MeasurementSummary> {
    return this.cad.createMeasurement(projectId, documentId, dto as CreateMeasurementRequest, user.sub);
  }
}
