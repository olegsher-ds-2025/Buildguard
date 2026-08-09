import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { ProjectDashboardResponse, ProjectSummary } from "@buildguard/shared-types";
import { ProjectsService } from "./projects.service";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects")
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload): Promise<ProjectSummary[]> {
    return this.projects.listForUser(user.sub);
  }

  @Get(":projectId/dashboard")
  @UseGuards(ProjectRoleGuard)
  dashboard(@Param("projectId") projectId: string): Promise<ProjectDashboardResponse> {
    return this.projects.getDashboard(projectId);
  }
}
