import { Injectable, NotFoundException } from "@nestjs/common";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import { FORM4_REQUIREMENTS, weatherLabelHe } from "@buildguard/shared-types";
import type { HoldPointSummary, PhotoMarkupShape } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { evaluateResult } from "../lab-tests/concrete-rules";
import { DailyLogsService } from "../daily-logs/daily-logs.service";
import { Form4Service } from "../form4/form4.service";
import { HoldPointsService } from "../hold-points/hold-points.service";
import { RtlPdf } from "../pdf/rtl-pdf";

const DISCLAIMER = "נוסח התקן העדכני, תוכניות המתכננים והנחיות היועצים גוברים תמיד על צ׳ק ליסט כללי.";
const OUTCOME_HE = { ok: "תקין", fail: "לא תקין", na: "לא רלוונטי" } as const;
const DEFECT_STATUS_HE = { open: "פתוח", in_progress: "בטיפול", resolved: "תוקן", closed: "אומת" } as const;
const HOLD_STATE_HE = { open: "פתוחה", signed: "נחתמה", bypassed: "מעקף" } as const;
const CAPACITY_HE: Record<string, string> = { engineer: "מהנדס", soil_consultant: "יועץ קרקע", inspector: "מפקח", lab: "מעבדה", other: "אחר" };

const formatDate = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });
const formatDateTime = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const fileSafe = (name: string) =>
  [...name].filter((c) => c.charCodeAt(0) >= 32).join("").replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 80) || "file";

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly dailyLogs: DailyLogsService,
    private readonly form4: Form4Service,
    private readonly holdPoints: HoldPointsService,
  ) {}

  async dailyLogPdf(projectId: string, logId: string): Promise<{ buffer: Buffer; filename: string }> {
    const [project, log] = await Promise.all([this.project(projectId), this.dailyLogs.get(projectId, logId)]);
    const row = await this.prisma.dailyLog.findUniqueOrThrow({
      where: { id: logId },
      include: { createdBy: { select: { displayName: true } }, approvedBy: { select: { displayName: true } } },
    });

    const pdf = new RtlPdf(`יומן עבודה ${log.logDate}`);
    pdf.heading(`יומן עבודה — ${formatDate.format(new Date(`${log.logDate}T12:00:00Z`))}`);
    pdf.keyValue("פרויקט", `${project.name} — ${project.address}`);
    pdf.keyValue("מזג אוויר", log.weatherCode === null ? "לא נרשם" : `${weatherLabelHe(log.weatherCode)}${log.temperatureC === null ? "" : `, ${log.temperatureC}°C`}`);
    pdf.keyValue("נרשם על ידי", row.createdBy.displayName);

    pdf.heading("כוח אדם", 2);
    if (log.headcount.length === 0) pdf.muted("לא נרשם כוח אדם.");
    else {
      pdf.table(
        [{ title: "קבלן / מקצוע", width: 4 }, { title: "עובדים", width: 1 }],
        [...log.headcount.map((h) => [h.name, String(h.workers)]), ["סה״כ", String(log.headcount.reduce((a, h) => a + h.workers, 0))]],
      );
    }

    pdf.heading("עבודות שבוצעו", 2);
    pdf.text(log.workDone || "לא נרשמו עבודות.");

    pdf.heading("יציקות היום", 2);
    if (log.pours.length === 0) pdf.muted("לא נרשמו יציקות.");
    else log.pours.forEach((p) => pdf.text(`• ${p.element} (${p.concreteGrade})`));

    pdf.heading("בטיחות", 2);
    pdf.keyValue("בדיקות בטיחות", log.safetyOk === null ? "לא נרשם" : log.safetyOk ? "תקינות" : "נמצאו ליקויים");
    if (log.safetyNotes) pdf.text(log.safetyNotes);

    pdf.rule();
    if (log.status === "locked" && row.approvedBy && log.approvedAt) {
      pdf.keyValue("אושר על ידי", `${row.approvedBy.displayName}, ${formatDateTime.format(new Date(log.approvedAt))}`);
      pdf.muted(`חותמת תוכן (SHA-256): ${log.contentHash}`);
    } else {
      pdf.muted("טיוטה — היומן טרם אושר ונעול.");
    }
    return { buffer: await pdf.finish(project.name), filename: `daily-log-${log.logDate}.pdf` };
  }

  async inspectionReportPdf(projectId: string, inspectionId: string): Promise<{ buffer: Buffer; filename: string }> {
    const inspection = await this.prisma.inspection.findFirst({
      where: { id: inspectionId, projectId },
      include: {
        phase: { select: { name: true } },
        inspector: { select: { displayName: true } },
        template: { include: { items: { orderBy: { sortOrder: "asc" } } } },
        results: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!inspection) throw new NotFoundException();
    const project = await this.project(projectId);

    const latest = new Map(inspection.results.map((r) => [r.checklistItemId, r]));
    const failed = [...latest.values()].filter((r) => r.outcome === "fail");
    const defectIds = failed.map((r) => r.defectId).filter((id): id is string => id !== null);
    const [defects, photos, holdPoints] = await Promise.all([
      this.prisma.defect.findMany({ where: { id: { in: defectIds } } }),
      this.prisma.photo.findMany({ where: { inspectionId }, orderBy: { createdAt: "asc" } }),
      this.holdPoints.list(projectId, inspection.phaseId),
    ]);

    const pdf = new RtlPdf(`דוח ביקור מפקח — ${inspection.template.title}`);
    pdf.heading("דוח ביקור מפקח");
    pdf.keyValue("פרויקט", `${project.name} — ${project.address}`);
    pdf.keyValue("שלב", `${inspection.template.stageNo}. ${inspection.template.title} (${inspection.phase.name})`);
    pdf.keyValue("מפקח", inspection.inspector.displayName);
    pdf.keyValue("תאריך", formatDate.format(inspection.completedAt ?? inspection.startedAt));
    pdf.keyValue("סטטוס", inspection.status === "completed" ? "הושלם" : "בתהליך");
    pdf.keyValue("סעיפים שנבדקו", `${latest.size} מתוך ${inspection.template.items.length}`);
    pdf.muted(DISCLAIMER);

    pdf.heading("סעיפים", 2);
    pdf.table(
      [{ title: "סעיף", width: 6 }, { title: "תוצאה", width: 1.4 }, { title: "ערך", width: 1 }, { title: "הערה", width: 2.5 }],
      inspection.template.items.map((item) => {
        const r = latest.get(item.id);
        return [item.text, r ? OUTCOME_HE[r.outcome] : "—", r?.numericValue == null ? "" : String(r.numericValue), r?.note ?? ""];
      }),
    );

    pdf.heading("ליקויים שנפתחו", 2);
    if (defects.length === 0) pdf.muted("לא נפתחו ליקויים בבדיקה זו.");
    for (const defect of defects) {
      pdf.text(`${defect.title}`, { size: 11 });
      pdf.muted(`חומרה ${defect.severity}/5 · ${DEFECT_STATUS_HE[defect.status]}`);
      const itemId = failed.find((r) => r.defectId === defect.id)?.checklistItemId;
      for (const photo of photos.filter((p) => p.defectId === defect.id || (itemId && p.checklistItemId === itemId))) {
        await this.embedPhoto(pdf, photo.objectKey, photo.markup as unknown as PhotoMarkupShape[]);
      }
    }

    pdf.heading("נקודות עצירה", 2);
    this.holdPointLines(pdf, holdPoints);

    pdf.rule();
    pdf.keyValue("חתימת המפקח", `${inspection.inspector.displayName}, ${formatDateTime.format(inspection.completedAt ?? new Date())}`);
    return { buffer: await pdf.finish(project.name), filename: `inspection-${inspection.template.stageNo}-${inspection.id.slice(0, 8)}.pdf` };
  }

  /** Form 4 readiness, stage approvals, hold-point sign-offs, lab results and defect counts in one document. */
  async summaryPdf(projectId: string): Promise<Buffer> {
    const project = await this.project(projectId);
    const [readiness, phases, holdPoints, pours, timedTests, defects] = await Promise.all([
      this.form4.get(projectId),
      this.prisma.phase.findMany({ where: { projectId }, orderBy: { sequenceNo: "asc" } }),
      this.holdPoints.list(projectId),
      this.prisma.concretePour.findMany({ where: { projectId }, orderBy: { castAt: "asc" }, include: { results: true } }),
      this.prisma.timedTest.findMany({ where: { projectId }, orderBy: { startedAt: "asc" } }),
      this.prisma.defect.groupBy({ by: ["status"], where: { projectId }, _count: { _all: true } }),
    ]);

    const pdf = new RtlPdf(`תיק מבנה — ${project.name}`);
    pdf.heading("תיק מבנה — סיכום");
    pdf.keyValue("פרויקט", `${project.name} — ${project.address}`);
    pdf.keyValue("הופק בתאריך", formatDateTime.format(new Date()));

    pdf.heading("מוכנות לטופס 4", 2);
    pdf.keyValue("מוכנות", `${readiness.readinessPct}% (${readiness.satisfiedCount} מתוך ${readiness.totalCount})`);
    pdf.table(
      [{ title: "דרישה", width: 5 }, { title: "סטטוס", width: 1.4 }, { title: "מסמך", width: 3 }],
      readiness.items.map((i) => [FORM4_REQUIREMENTS.find((r) => r.key === i.key)?.titleHe ?? i.key, i.satisfied ? "הושלם" : "חסר", i.documentTitle ?? ""]),
    );

    pdf.heading("אישורי שלבים", 2);
    pdf.table([{ title: "שלב", width: 5 }, { title: "סטטוס", width: 2 }], phases.map((p) => [p.name, p.status === "verified" ? "אושר" : "לא אושר"]));

    pdf.heading("נקודות עצירה", 2);
    this.holdPointLines(pdf, holdPoints);

    pdf.heading("בדיקות בטון", 2);
    if (pours.length === 0) pdf.muted("לא נרשמו יציקות.");
    else {
      pdf.table(
        [{ title: "אלמנט", width: 3 }, { title: "דרגה", width: 1 }, { title: "יציקה", width: 1.6 }, { title: "7 ימים", width: 1.4 }, { title: "28 יום", width: 1.4 }],
        pours.map((p) => {
          const required = Number(p.requiredMpa28);
          const cell = (age: number) => {
            const r = [...p.results].filter((x) => x.ageDays === age).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
            return r ? `${Number(r.strengthMpa)} (${evaluateResult(age, Number(r.strengthMpa), required) === "pass" ? "עבר" : "נכשל"})` : "—";
          };
          return [p.element, p.concreteGrade, formatDate.format(p.castAt), cell(7), cell(28)];
        }),
      );
    }

    pdf.heading("בדיקות לחץ והצפה", 2);
    if (timedTests.length === 0) pdf.muted("לא נרשמו בדיקות.");
    else {
      pdf.table(
        [{ title: "סוג", width: 1.4 }, { title: "מיקום", width: 3 }, { title: "תחילה", width: 2 }, { title: "תוצאה", width: 1.4 }],
        timedTests.map((t) => [t.kind === "pressure" ? "לחץ" : "הצפה", t.location, formatDateTime.format(t.startedAt), t.outcome === "passed" ? "עברה" : t.outcome === "failed" ? "נכשלה" : "בתהליך"]),
      );
    }

    pdf.heading("ליקויים", 2);
    pdf.table([{ title: "סטטוס", width: 2 }, { title: "מספר", width: 1 }], defects.map((d) => [DEFECT_STATUS_HE[d.status], String(d._count._all)]));
    pdf.muted(DISCLAIMER);
    return pdf.finish(project.name);
  }

  /** Handover file: summary, locked daily logs, before-cover photos and each document's latest version. */
  async buildingFileZip(projectId: string): Promise<Buffer> {
    const project = await this.project(projectId);
    const missing: string[] = [];
    const entries: { name: string; data: Buffer }[] = [{ name: "00-summary.pdf", data: await this.summaryPdf(projectId) }];

    const logs = await this.prisma.dailyLog.findMany({ where: { projectId, status: "locked" }, orderBy: { logDate: "asc" } });
    for (const log of logs) {
      const { buffer, filename } = await this.dailyLogPdf(projectId, log.id);
      entries.push({ name: `daily-logs/${filename}`, data: buffer });
    }

    const photos = await this.prisma.photo.findMany({ where: { projectId, tag: "before_cover" }, orderBy: { createdAt: "asc" } });
    for (const [i, photo] of photos.entries()) {
      const data = await this.storage.getObjectBuffer(photo.objectKey);
      if (data) entries.push({ name: `before-cover-photos/${String(i + 1).padStart(3, "0")}-${photo.id.slice(0, 8)}.jpg`, data });
      else missing.push(`photo ${photo.id}`);
    }

    const documents = await this.prisma.document.findMany({
      where: { projectId },
      include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
    });
    for (const doc of documents) {
      const version = doc.versions[0];
      if (!version) continue;
      const data = await this.storage.getObjectBuffer(version.objectKey);
      if (data) entries.push({ name: `documents/${fileSafe(doc.kind)}/${fileSafe(doc.title)}-v${version.versionNo}`, data });
      else missing.push(`document ${doc.title}`);
    }
    if (missing.length > 0) {
      entries.push({ name: "MISSING.txt", data: Buffer.from(`Files that could not be read from storage:\n${missing.join("\n")}\n`) });
    }
    return zip(entries, project.name);
  }

  private holdPointLines(pdf: RtlPdf, holdPoints: HoldPointSummary[]): void {
    if (holdPoints.length === 0) {
      pdf.muted("אין נקודות עצירה.");
      return;
    }
    pdf.table(
      [{ title: "נקודת עצירה", width: 5 }, { title: "מצב", width: 1.2 }, { title: "אישור", width: 3 }],
      holdPoints.map((h) => [
        `${h.phaseName}: ${h.text}`,
        HOLD_STATE_HE[h.state],
        h.state === "signed"
          ? `${h.signerName} (${CAPACITY_HE[h.signerCapacity ?? "other"]}), ${h.closedAt ? formatDate.format(new Date(h.closedAt)) : ""}`
          : h.state === "bypassed"
            ? `מעקף בעלים: ${h.reason}`
            : "",
      ]),
    );
  }

  private async embedPhoto(pdf: RtlPdf, objectKey: string, markup: PhotoMarkupShape[]): Promise<void> {
    const data = await this.storage.getObjectBuffer(objectKey);
    if (data) pdf.image(data, { maxWidth: 260, maxHeight: 200, markup });
  }

  private async project(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { name: true, address: true } });
    if (!project) throw new NotFoundException();
    return project;
  }
}

function zip(entries: { name: string; data: Buffer }[], comment: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 }, comment });
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on("data", (c: Buffer) => chunks.push(c));
    sink.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    archive.pipe(sink);
    for (const e of entries) archive.append(e.data, { name: e.name });
    void archive.finalize();
  });
}
