import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Photo, Prisma, ProjectRole } from "@prisma/client";
import type {
  CreatePhotoUploadResponse,
  PhotoMarkupShape,
  PhotoSummary,
  PhotoTag,
} from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ConfirmPhotoUploadDto, CreatePhotoUploadDto } from "./dto/photo.dto";

const UPLOADER_ROLES: ProjectRole[] = ["owner", "project_manager", "inspector"];

export interface PhotoFilter {
  inspectionId?: string;
  checklistItemId?: string;
  defectId?: string;
  tag?: PhotoTag;
}

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private objectKeyFor(projectId: string, photoId: string): string {
    return `projects/${projectId}/photos/${photoId}`;
  }

  async createUpload(projectId: string, dto: CreatePhotoUploadDto): Promise<CreatePhotoUploadResponse> {
    const photoId = randomUUID();
    const uploadUrl = await this.storage.getUploadUrl(this.objectKeyFor(projectId, photoId), dto.contentType);
    return { photoId, uploadUrl };
  }

  /** Persists nothing until the file is really in storage. Confirming twice returns the first row. */
  async confirmUpload(
    projectId: string,
    photoId: string,
    dto: ConfirmPhotoUploadDto,
    actor: { userId: string; role: ProjectRole },
  ): Promise<PhotoSummary> {
    await this.assertMayUpload(projectId, dto, actor);

    const existing = await this.prisma.photo.findFirst({ where: { id: photoId, projectId } });
    if (existing) return this.toSummary(existing);

    await this.assertLinksBelongToProject(projectId, dto);
    const objectKey = this.objectKeyFor(projectId, photoId);
    if (!(await this.storage.objectExists(objectKey))) {
      throw new BadRequestException("No file was found at the expected storage location — upload it first.");
    }

    const photo = await this.prisma.photo.create({
      data: {
        id: photoId,
        projectId,
        tag: dto.tag,
        phaseId: dto.phaseId,
        inspectionId: dto.inspectionId,
        checklistItemId: dto.checklistItemId,
        defectId: dto.defectId,
        objectKey,
        markup: (dto.markup ?? []) as unknown as Prisma.InputJsonValue,
        gpsLat: dto.gpsLat,
        gpsLng: dto.gpsLng,
        takenAt: dto.takenAt ? new Date(dto.takenAt) : undefined,
        uploadedByUserId: actor.userId,
      },
    });
    return this.toSummary(photo);
  }

  /** Contractors see only photos attached to defects assigned to them. */
  async list(
    projectId: string,
    filter: PhotoFilter,
    actor: { userId: string; role: ProjectRole },
  ): Promise<PhotoSummary[]> {
    const where: Prisma.PhotoWhereInput = { projectId, ...filter };
    if (actor.role === "contractor") where.defect = { assignedToUserId: actor.userId };
    const photos = await this.prisma.photo.findMany({ where, orderBy: { createdAt: "asc" } });
    return Promise.all(photos.map((p) => this.toSummary(p)));
  }

  // Contractors may only attach an "after" photo to a defect assigned to them.
  private async assertMayUpload(projectId: string, dto: ConfirmPhotoUploadDto, actor: { userId: string; role: ProjectRole }) {
    if (UPLOADER_ROLES.includes(actor.role)) return;
    if (actor.role === "contractor" && dto.tag === "after" && dto.defectId) {
      const defect = await this.prisma.defect.findFirst({
        where: { id: dto.defectId, projectId, assignedToUserId: actor.userId },
        select: { id: true },
      });
      if (defect) return;
    }
    throw new ForbiddenException();
  }

  private async assertLinksBelongToProject(projectId: string, dto: ConfirmPhotoUploadDto) {
    const checks: [string, Promise<unknown>][] = [];
    if (dto.phaseId) checks.push(["phase", this.prisma.phase.findFirst({ where: { id: dto.phaseId, projectId } })]);
    if (dto.inspectionId) {
      checks.push(["inspection", this.prisma.inspection.findFirst({ where: { id: dto.inspectionId, projectId } })]);
    }
    if (dto.defectId) checks.push(["defect", this.prisma.defect.findFirst({ where: { id: dto.defectId, projectId } })]);
    if (dto.checklistItemId) {
      checks.push(["checklist item", this.prisma.checklistItem.findUnique({ where: { id: dto.checklistItemId } })]);
    }
    for (const [name, lookup] of checks) {
      if (!(await lookup)) throw new NotFoundException(`${name} not found in this project`);
    }
  }

  private async toSummary(p: Photo): Promise<PhotoSummary> {
    return {
      id: p.id,
      tag: p.tag,
      url: await this.storage.getDownloadUrl(p.objectKey),
      phaseId: p.phaseId ?? undefined,
      inspectionId: p.inspectionId ?? undefined,
      checklistItemId: p.checklistItemId ?? undefined,
      defectId: p.defectId ?? undefined,
      markup: p.markup as unknown as PhotoMarkupShape[],
      gpsLat: p.gpsLat === null ? null : Number(p.gpsLat),
      gpsLng: p.gpsLng === null ? null : Number(p.gpsLng),
      takenAt: p.takenAt?.toISOString() ?? null,
      uploadedByUserId: p.uploadedByUserId,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
