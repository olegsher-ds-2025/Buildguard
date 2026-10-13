import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FORM4_REQUIREMENTS } from "@buildguard/shared-types";
import type { Form4ItemSummary, Form4Readiness } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { evaluateResult } from "../lab-tests/concrete-rules";
import { HoldPointsService } from "../hold-points/hold-points.service";
import { SaveForm4ItemDto } from "./dto/form4.dto";

@Injectable()
export class Form4Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly holdPoints: HoldPointsService,
  ) {}

  async get(projectId: string): Promise<Form4Readiness> {
    const rows = await this.prisma.form4Item.findMany({ where: { projectId }, include: { document: { select: { title: true } } } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const items: Form4ItemSummary[] = FORM4_REQUIREMENTS.map(({ key }) => {
      const row = byKey.get(key);
      return {
        key,
        satisfied: row?.satisfied ?? false,
        documentId: row?.documentId ?? null,
        documentTitle: row?.document?.title ?? null,
        note: row?.note ?? null,
        satisfiedAt: row?.satisfiedAt?.toISOString() ?? null,
      };
    });
    const satisfiedCount = items.filter((i) => i.satisfied).length;
    return {
      items,
      satisfiedCount,
      totalCount: items.length,
      readinessPct: Math.round((satisfiedCount / items.length) * 100),
      blockers: await this.blockers(projectId),
    };
  }

  async save(projectId: string, key: string, dto: SaveForm4ItemDto, userId: string): Promise<Form4Readiness> {
    if (!FORM4_REQUIREMENTS.some((r) => r.key === key)) throw new NotFoundException("Unknown Form 4 requirement");
    if (dto.satisfied && !dto.documentId) {
      throw new BadRequestException("Marking a requirement satisfied needs the supporting document");
    }
    if (dto.documentId && !(await this.prisma.document.findFirst({ where: { id: dto.documentId, projectId }, select: { id: true } }))) {
      throw new NotFoundException("Document not found in this project");
    }

    const data = {
      satisfied: dto.satisfied,
      documentId: dto.documentId ?? null,
      note: dto.note ?? null,
      satisfiedAt: dto.satisfied ? new Date() : null,
      satisfiedByUserId: dto.satisfied ? userId : null,
    };
    await this.prisma.form4Item.upsert({
      where: { projectId_key: { projectId, key } },
      create: { projectId, key, ...data },
      update: data,
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: "customer",
      action: "form4_item_updated",
      entityType: "form4_item",
      entityId: key,
      projectId,
      metadata: { satisfied: dto.satisfied, documentId: dto.documentId ?? null },
    });
    return this.get(projectId);
  }

  private async blockers(projectId: string): Promise<Form4Readiness["blockers"]> {
    const [holdPoints, unapprovedPhases, pours] = await Promise.all([
      this.holdPoints.list(projectId),
      this.prisma.phase.count({ where: { projectId, status: { not: "verified" } } }),
      this.prisma.concretePour.findMany({ where: { projectId }, include: { results: true } }),
    ]);
    const failedConcreteResults = pours.filter((pour) => {
      const latest = new Map<number, (typeof pour.results)[number]>();
      for (const r of [...pour.results].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) latest.set(r.ageDays, r);
      return [...latest.values()].some((r) => evaluateResult(r.ageDays, Number(r.strengthMpa), Number(pour.requiredMpa28)) === "fail");
    }).length;
    return { openHoldPoints: holdPoints.filter((h) => h.state === "open").length, unapprovedPhases, failedConcreteResults };
  }
}
