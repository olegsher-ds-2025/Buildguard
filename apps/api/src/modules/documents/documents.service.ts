import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  CreateDocumentUploadResponse,
  DocumentKind,
  DocumentSummary,
  DownloadUrlResponse,
  PlanVersionStatus,
} from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { CreateDocumentUploadDto } from "./dto/create-document-upload.dto";
import type { ConfirmDocumentUploadDto } from "./dto/confirm-document-upload.dto";

/**
 * plan_versions is append-only (UPDATE/DELETE revoked — see the M1
 * migration), so this deliberately never writes a "processing" row and
 * flips it to "ready": nothing is persisted until the upload is confirmed
 * AND independently verified to exist in storage. If a client abandons an
 * upload mid-flow, no row — not even a stale one — is ever created.
 *
 * "Current version" is derived by querying for the highest version_no
 * rather than stored as a pointer column on Document — see the schema
 * comment on Document for why a real FK into plan_versions can't work.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // Deterministic from path params alone — the confirm step recomputes this
  // rather than trusting a client-echoed key, so confirming only ever
  // succeeds against an object this API itself issued a presigned PUT for.
  private objectKeyFor(projectId: string, documentId: string): string {
    return `projects/${projectId}/documents/${documentId}/v1/original`;
  }

  async createUpload(
    projectId: string,
    dto: CreateDocumentUploadDto,
  ): Promise<CreateDocumentUploadResponse> {
    const documentId = randomUUID();
    const versionId = randomUUID();
    const objectKey = this.objectKeyFor(projectId, documentId);
    const uploadUrl = await this.storage.getUploadUrl(objectKey, dto.contentType);
    return { documentId, versionId, uploadUrl };
  }

  async confirmUpload(
    projectId: string,
    documentId: string,
    versionId: string,
    dto: ConfirmDocumentUploadDto,
    uploadedByUserId: string,
  ): Promise<DocumentSummary> {
    const objectKey = this.objectKeyFor(projectId, documentId);

    const exists = await this.storage.objectExists(objectKey);
    if (!exists) {
      throw new BadRequestException("No file was found at the expected storage location — upload it first.");
    }

    const [document, version] = await this.prisma.$transaction([
      this.prisma.document.create({
        data: { id: documentId, projectId, kind: dto.kind, title: dto.title },
      }),
      this.prisma.planVersion.create({
        data: {
          id: versionId,
          documentId,
          versionNo: 1,
          objectKey,
          uploadedByUserId,
          status: "ready",
        },
      }),
    ]);

    return this.toSummary(document, version);
  }

  async list(projectId: string): Promise<DocumentSummary[]> {
    const documents = await this.prisma.document.findMany({
      where: { projectId },
      include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
    return documents.map((d) => this.toSummary(d, d.versions[0] ?? null));
  }

  async getDownloadUrl(projectId: string, documentId: string): Promise<DownloadUrlResponse> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, projectId },
      include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
    });
    const currentVersion = document?.versions[0];
    if (!currentVersion) throw new NotFoundException();

    const downloadUrl = await this.storage.getDownloadUrl(currentVersion.objectKey);
    return { downloadUrl };
  }

  private toSummary(
    document: { id: string; title: string; kind: string },
    currentVersion: { id: string; versionNo: number; status: string; uploadedAt: Date } | null,
  ): DocumentSummary {
    return {
      id: document.id,
      title: document.title,
      kind: document.kind as DocumentKind,
      currentVersion: currentVersion
        ? {
            id: currentVersion.id,
            versionNo: currentVersion.versionNo,
            status: currentVersion.status as PlanVersionStatus,
            uploadedAt: currentVersion.uploadedAt.toISOString(),
          }
        : null,
    };
  }
}
