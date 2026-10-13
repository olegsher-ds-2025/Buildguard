import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type {
  CreateDocumentUploadResponse,
  DocumentSummary,
  DownloadUrlResponse,
} from "@buildguard/shared-types";
import { DocumentsService } from "./documents.service";
import { CreateDocumentUploadDto } from "./dto/create-document-upload.dto";
import { ConfirmDocumentUploadDto } from "./dto/confirm-document-upload.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { NON_CONTRACTOR_ROLES, WRITE_ROLES, Roles } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/documents")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @Roles(...NON_CONTRACTOR_ROLES)
  list(@Param("projectId") projectId: string): Promise<DocumentSummary[]> {
    return this.documents.list(projectId);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  createUpload(
    @Param("projectId") projectId: string,
    @Body() dto: CreateDocumentUploadDto,
  ): Promise<CreateDocumentUploadResponse> {
    return this.documents.createUpload(projectId, dto);
  }

  @Post(":documentId/versions/:versionId/confirm")
  @Roles(...WRITE_ROLES)
  confirmUpload(
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Body() dto: ConfirmDocumentUploadDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DocumentSummary> {
    return this.documents.confirmUpload(projectId, documentId, versionId, dto, user.sub);
  }

  @Get(":documentId/download")
  @Roles(...NON_CONTRACTOR_ROLES)
  getDownloadUrl(
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
  ): Promise<DownloadUrlResponse> {
    return this.documents.getDownloadUrl(projectId, documentId);
  }
}
