import { Controller, Get, Param, StreamableFile, UseGuards } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { NON_CONTRACTOR_ROLES, Roles, WRITE_ROLES } from "../identity/decorators/roles.decorator";

const pdf = (buffer: Buffer, filename: string) =>
  new StreamableFile(buffer, { type: "application/pdf", disposition: `attachment; filename="${filename}"` });

@Controller("projects/:projectId")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("daily-logs/:logId/pdf")
  @Roles(...NON_CONTRACTOR_ROLES)
  async dailyLog(@Param("projectId") projectId: string, @Param("logId") logId: string): Promise<StreamableFile> {
    const { buffer, filename } = await this.reports.dailyLogPdf(projectId, logId);
    return pdf(buffer, filename);
  }

  @Get("inspections/:inspectionId/report.pdf")
  @Roles(...NON_CONTRACTOR_ROLES)
  async inspection(@Param("projectId") projectId: string, @Param("inspectionId") inspectionId: string): Promise<StreamableFile> {
    const { buffer, filename } = await this.reports.inspectionReportPdf(projectId, inspectionId);
    return pdf(buffer, filename);
  }

  @Get("building-file.zip")
  @Roles(...WRITE_ROLES)
  async buildingFile(@Param("projectId") projectId: string): Promise<StreamableFile> {
    const buffer = await this.reports.buildingFileZip(projectId);
    return new StreamableFile(buffer, { type: "application/zip", disposition: 'attachment; filename="building-file.zip"' });
  }
}
