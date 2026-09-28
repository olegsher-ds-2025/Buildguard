import { Controller, Get, UseGuards } from "@nestjs/common";
import type { WorkCategorySummary } from "@buildguard/shared-types";
import { WorkCategoriesService } from "./work-categories.service";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";

/** Global reference data (not project-scoped) — used by both frontends to populate category dropdowns. */
@Controller("work-categories")
@UseGuards(JwtAuthGuard)
export class WorkCategoriesController {
  constructor(private readonly workCategories: WorkCategoriesService) {}

  @Get()
  list(): Promise<WorkCategorySummary[]> {
    return this.workCategories.list();
  }
}
