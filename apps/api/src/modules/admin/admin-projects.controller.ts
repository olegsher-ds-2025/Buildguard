import { Controller, Get, UseGuards } from "@nestjs/common";
import type { AdminProjectSummary } from "@buildguard/shared-types";
import { AdminProjectsService } from "./admin-projects.service";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { StaffOnlyGuard } from "../identity/guards/staff-only.guard";

@Controller("admin/projects")
@UseGuards(JwtAuthGuard, StaffOnlyGuard)
export class AdminProjectsController {
  constructor(private readonly projects: AdminProjectsService) {}

  @Get()
  list(): Promise<AdminProjectSummary[]> {
    return this.projects.list();
  }
}
