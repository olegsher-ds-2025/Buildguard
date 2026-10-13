import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import type { ProjectMember } from "@prisma/client";
import type { CreatePhotoUploadResponse, PhotoSummary, PhotoTag } from "@buildguard/shared-types";
import { PhotosService } from "./photos.service";
import { ConfirmPhotoUploadDto, CreatePhotoUploadDto } from "./dto/photo.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { Roles } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

type MemberRequest = Request & { projectMember: ProjectMember };

// Viewers are read-only; the finer upload rule (a contractor's "after" photo) lives in the service.
@Controller("projects/:projectId/photos")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Post()
  @Roles("owner", "project_manager", "inspector", "contractor")
  createUpload(@Param("projectId") projectId: string, @Body() dto: CreatePhotoUploadDto): Promise<CreatePhotoUploadResponse> {
    return this.photos.createUpload(projectId, dto);
  }

  @Post(":photoId/confirm")
  @Roles("owner", "project_manager", "inspector", "contractor")
  confirmUpload(
    @Param("projectId") projectId: string,
    @Param("photoId") photoId: string,
    @Body() dto: ConfirmPhotoUploadDto,
    @Req() req: MemberRequest,
    @CurrentUser() user: JwtPayload,
  ): Promise<PhotoSummary> {
    return this.photos.confirmUpload(projectId, photoId, dto, { userId: user.sub, role: req.projectMember.role });
  }

  @Get()
  list(
    @Param("projectId") projectId: string,
    @Query("inspectionId") inspectionId: string | undefined,
    @Query("checklistItemId") checklistItemId: string | undefined,
    @Query("defectId") defectId: string | undefined,
    @Query("tag") tag: PhotoTag | undefined,
    @Req() req: MemberRequest,
    @CurrentUser() user: JwtPayload,
  ): Promise<PhotoSummary[]> {
    return this.photos.list(projectId, { inspectionId, checklistItemId, defectId, tag }, { userId: user.sub, role: req.projectMember.role });
  }
}
