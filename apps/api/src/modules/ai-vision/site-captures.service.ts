import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { CreateSiteCaptureUploadResponse, FindingSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AiVisionService } from "./ai-vision.interface";
import type { CreateSiteCaptureUploadDto } from "./dto/create-site-capture-upload.dto";
import { toFindingSummary } from "./finding-summary";

@Injectable()
export class SiteCapturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly aiVision: AiVisionService,
  ) {}

  private objectKeyFor(projectId: string, siteCaptureId: string): string {
    return `projects/${projectId}/site-captures/${siteCaptureId}/original`;
  }

  async createUpload(
    projectId: string,
    dto: CreateSiteCaptureUploadDto,
  ): Promise<CreateSiteCaptureUploadResponse> {
    const siteCaptureId = randomUUID();
    const objectKey = this.objectKeyFor(projectId, siteCaptureId);
    const uploadUrl = await this.storage.getUploadUrl(objectKey, dto.contentType);
    return { siteCaptureId, uploadUrl };
  }

  /**
   * Verifies the upload happened, persists the SiteCapture, runs it through
   * the AI seam, and persists each returned candidate as a `suggested`
   * Detection. Nothing here ever creates a Defect directly — see
   * FindingsService.approve for the only path a Defect can come from.
   */
  async confirmUpload(
    projectId: string,
    siteCaptureId: string,
    phaseId: string | undefined,
    uploadedByUserId: string,
  ): Promise<FindingSummary[]> {
    const objectKey = this.objectKeyFor(projectId, siteCaptureId);
    const exists = await this.storage.objectExists(objectKey);
    if (!exists) {
      throw new BadRequestException("No file was found at the expected storage location — upload it first.");
    }

    await this.prisma.siteCapture.create({
      data: {
        id: siteCaptureId,
        projectId,
        phaseId,
        uploadedByUserId,
        objectKey,
        status: "uploaded",
      },
    });

    const result = await this.aiVision.analyzeSiteCapture({ siteCaptureId, projectId, imageObjectKey: objectKey });

    const detections = await this.prisma.$transaction(
      result.detections.map((d) =>
        this.prisma.detection.create({
          data: {
            siteCaptureId,
            kind: d.kind,
            severity: d.severity,
            confidence: d.confidence,
            boundingBox: d.boundingBox,
            estimatedCostMinMinor: d.estimatedCostMinMinor,
            estimatedCostMaxMinor: d.estimatedCostMaxMinor,
            currency: d.currency,
            description: d.description,
            status: "suggested",
          },
        }),
      ),
    );

    // Not part of the same transaction as the detections: this is a status
    // flag on the SiteCapture, not something that needs to be atomic with
    // the findings it produced — if it somehow failed to flip, the findings
    // themselves are still correctly persisted and reviewable.
    await this.prisma.siteCapture.update({ where: { id: siteCaptureId }, data: { status: "processed" } });

    return detections.map((d) => toFindingSummary(d, null));
  }
}
