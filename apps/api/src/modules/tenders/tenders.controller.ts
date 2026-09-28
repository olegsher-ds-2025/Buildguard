import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { CreateTenderRequest, TenderDetailResponse, TenderSummary } from "@buildguard/shared-types";
import type { ProjectMember } from "@prisma/client";
import type { Request } from "express";
import { TendersService } from "./tenders.service";
import { CreateTenderDto } from "./dto/create-tender.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { Roles } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/tenders")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class TendersController {
  constructor(private readonly tenders: TendersService) {}

  @Get()
  list(@Param("projectId") projectId: string): Promise<TenderSummary[]> {
    return this.tenders.list(projectId);
  }

  @Get(":tenderId")
  getDetail(
    @Param("projectId") projectId: string,
    @Param("tenderId") tenderId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { projectMember: ProjectMember },
  ): Promise<TenderDetailResponse> {
    return this.tenders.getDetail(projectId, tenderId, user.sub, req.projectMember.role);
  }

  @Post()
  @Roles("owner", "project_manager")
  create(
    @Param("projectId") projectId: string,
    @Body() dto: CreateTenderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TenderSummary> {
    return this.tenders.create(projectId, dto as CreateTenderRequest, user.sub);
  }

  @Post(":tenderId/publish")
  @Roles("owner", "project_manager")
  publish(
    @Param("projectId") projectId: string,
    @Param("tenderId") tenderId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TenderSummary> {
    return this.tenders.publish(projectId, tenderId, user.sub);
  }

  @Post(":tenderId/cancel")
  @Roles("owner", "project_manager")
  cancel(
    @Param("projectId") projectId: string,
    @Param("tenderId") tenderId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TenderSummary> {
    return this.tenders.cancel(projectId, tenderId, user.sub);
  }
}
