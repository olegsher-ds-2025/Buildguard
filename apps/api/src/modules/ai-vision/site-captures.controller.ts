import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import type { CreateSiteCaptureUploadResponse, FindingSummary } from "@buildguard/shared-types";
import { SiteCapturesService } from "./site-captures.service";
import { CreateSiteCaptureUploadDto } from "./dto/create-site-capture-upload.dto";
import { ConfirmSiteCaptureUploadDto } from "./dto/confirm-site-capture-upload.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/site-captures")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class SiteCapturesController {
  constructor(private readonly siteCaptures: SiteCapturesService) {}

  @Post()
  createUpload(
    @Param("projectId") projectId: string,
    @Body() dto: CreateSiteCaptureUploadDto,
  ): Promise<CreateSiteCaptureUploadResponse> {
    return this.siteCaptures.createUpload(projectId, dto);
  }

  @Post(":siteCaptureId/confirm")
  confirmUpload(
    @Param("projectId") projectId: string,
    @Param("siteCaptureId") siteCaptureId: string,
    @Body() dto: ConfirmSiteCaptureUploadDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<FindingSummary[]> {
    return this.siteCaptures.confirmUpload(projectId, siteCaptureId, dto.phaseId, user.sub);
  }
}
