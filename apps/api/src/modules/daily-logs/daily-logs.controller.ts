import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import type { DailyLogSummary } from "@buildguard/shared-types";
import { DailyLogsService } from "./daily-logs.service";
import { CreateDailyLogDto, SaveDailyLogDto } from "./dto/daily-log.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { NON_CONTRACTOR_ROLES, Roles, WRITE_ROLES } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/daily-logs")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class DailyLogsController {
  constructor(private readonly logs: DailyLogsService) {}

  @Get()
  @Roles(...NON_CONTRACTOR_ROLES)
  list(@Param("projectId") projectId: string): Promise<DailyLogSummary[]> {
    return this.logs.list(projectId);
  }

  @Get(":logId")
  @Roles(...NON_CONTRACTOR_ROLES)
  get(@Param("projectId") projectId: string, @Param("logId") logId: string): Promise<DailyLogSummary> {
    return this.logs.get(projectId, logId);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Param("projectId") projectId: string, @Body() dto: CreateDailyLogDto, @CurrentUser() user: JwtPayload): Promise<DailyLogSummary> {
    return this.logs.create(projectId, dto, user.sub);
  }

  @Put(":logId")
  @Roles(...WRITE_ROLES)
  update(@Param("projectId") projectId: string, @Param("logId") logId: string, @Body() dto: SaveDailyLogDto): Promise<DailyLogSummary> {
    return this.logs.update(projectId, logId, dto);
  }

  @Post(":logId/fetch-weather")
  @Roles(...WRITE_ROLES)
  fetchWeather(@Param("projectId") projectId: string, @Param("logId") logId: string): Promise<DailyLogSummary> {
    return this.logs.fetchWeather(projectId, logId);
  }

  @Post(":logId/approve")
  @Roles(...WRITE_ROLES)
  approve(@Param("projectId") projectId: string, @Param("logId") logId: string, @CurrentUser() user: JwtPayload): Promise<DailyLogSummary> {
    return this.logs.approve(projectId, logId, user.sub);
  }
}
