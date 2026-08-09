import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { FindingSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { ApproveFindingDto } from "./dto/approve-finding.dto";
import { toFindingSummary } from "./finding-summary";

@Injectable()
export class FindingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(projectId: string): Promise<FindingSummary[]> {
    const detections = await this.prisma.detection.findMany({
      where: { siteCapture: { projectId } },
      include: { defect: true },
      orderBy: { createdAt: "desc" },
    });
    return detections.map((d) => toFindingSummary(d, d.defect?.id ?? null));
  }

  /**
   * The only place a Defect is ever created — always by promoting an
   * existing suggested Detection, never written directly. This is the
   * Detection-vs-Defect separation the design doc's advisory-AI rule
   * depends on (§5.2, §8): AI output cannot become a tracked business
   * entity without this explicit human action.
   */
  async approve(
    projectId: string,
    detectionId: string,
    dto: ApproveFindingDto,
    reviewedByUserId: string,
  ): Promise<FindingSummary> {
    const detection = await this.findOwnedDetection(projectId, detectionId);
    if (detection.status !== "suggested") {
      throw new BadRequestException(`Finding is already ${detection.status}`);
    }

    const [, defect] = await this.prisma.$transaction([
      this.prisma.detection.update({
        where: { id: detectionId },
        data: { status: "approved", reviewedByUserId, reviewedAt: new Date() },
      }),
      this.prisma.defect.create({
        data: {
          detectionId,
          projectId,
          title: dto.title ?? detection.description,
          severity: detection.severity,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        },
      }),
    ]);

    await this.prisma.defectEvent.create({
      data: {
        defectId: defect.id,
        eventType: "created",
        payload: { fromDetectionId: detectionId },
        actorUserId: reviewedByUserId,
      },
    });

    await this.audit.record({
      actorUserId: reviewedByUserId,
      actorType: "customer",
      action: "detection_approved",
      entityType: "defect",
      entityId: defect.id,
      projectId,
      metadata: { detectionId },
    });

    const updated = await this.prisma.detection.findUniqueOrThrow({ where: { id: detectionId } });
    return toFindingSummary(updated, defect.id);
  }

  async dismiss(projectId: string, detectionId: string, reviewedByUserId: string): Promise<FindingSummary> {
    const detection = await this.findOwnedDetection(projectId, detectionId);
    if (detection.status !== "suggested") {
      throw new BadRequestException(`Finding is already ${detection.status}`);
    }

    const updated = await this.prisma.detection.update({
      where: { id: detectionId },
      data: { status: "dismissed", reviewedByUserId, reviewedAt: new Date() },
    });

    await this.audit.record({
      actorUserId: reviewedByUserId,
      actorType: "customer",
      action: "detection_dismissed",
      entityType: "detection",
      entityId: detectionId,
      projectId,
    });

    return toFindingSummary(updated, null);
  }

  private async findOwnedDetection(projectId: string, detectionId: string) {
    const detection = await this.prisma.detection.findFirst({
      where: { id: detectionId, siteCapture: { projectId } },
    });
    if (!detection) throw new NotFoundException();
    return detection;
  }
}
