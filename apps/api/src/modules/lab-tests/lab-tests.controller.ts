import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { ConcretePourSummary, TimedTestSummary } from "@buildguard/shared-types";
import { ConcreteService } from "./concrete.service";
import { TimedTestsService } from "./timed-tests.service";
import { CompleteTimedTestDto, CreateConcretePourDto, RecordConcreteResultDto, StartTimedTestDto } from "./dto/lab-tests.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { NON_CONTRACTOR_ROLES, Roles, WRITE_ROLES } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class LabTestsController {
  constructor(
    private readonly concrete: ConcreteService,
    private readonly timedTests: TimedTestsService,
  ) {}

  @Get("concrete-pours")
  @Roles(...NON_CONTRACTOR_ROLES)
  listPours(@Param("projectId") projectId: string): Promise<ConcretePourSummary[]> {
    return this.concrete.list(projectId);
  }

  @Post("concrete-pours")
  @Roles(...WRITE_ROLES)
  createPour(@Param("projectId") projectId: string, @Body() dto: CreateConcretePourDto, @CurrentUser() user: JwtPayload): Promise<ConcretePourSummary> {
    return this.concrete.create(projectId, dto, user.sub);
  }

  @Post("concrete-pours/:pourId/results")
  @Roles(...WRITE_ROLES)
  recordResult(
    @Param("projectId") projectId: string,
    @Param("pourId") pourId: string,
    @Body() dto: RecordConcreteResultDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ConcretePourSummary> {
    return this.concrete.recordResult(projectId, pourId, dto, user.sub);
  }

  @Post("concrete-pours/:pourId/formwork-removed")
  @Roles(...WRITE_ROLES)
  removeFormwork(@Param("projectId") projectId: string, @Param("pourId") pourId: string, @CurrentUser() user: JwtPayload): Promise<ConcretePourSummary> {
    return this.concrete.removeFormwork(projectId, pourId, user.sub);
  }

  @Get("timed-tests")
  @Roles(...NON_CONTRACTOR_ROLES)
  listTimedTests(@Param("projectId") projectId: string): Promise<TimedTestSummary[]> {
    return this.timedTests.list(projectId);
  }

  @Post("timed-tests")
  @Roles(...WRITE_ROLES)
  startTimedTest(@Param("projectId") projectId: string, @Body() dto: StartTimedTestDto, @CurrentUser() user: JwtPayload): Promise<TimedTestSummary> {
    return this.timedTests.start(projectId, dto, user.sub);
  }

  @Post("timed-tests/:testId/complete")
  @Roles(...WRITE_ROLES)
  completeTimedTest(
    @Param("projectId") projectId: string,
    @Param("testId") testId: string,
    @Body() dto: CompleteTimedTestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TimedTestSummary> {
    return this.timedTests.complete(projectId, testId, dto, user.sub);
  }
}
