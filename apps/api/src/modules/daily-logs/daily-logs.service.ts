import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { DailyLog, Prisma } from "@prisma/client";
import type { DailyLogSummary, HeadcountEntry } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateDailyLogDto, SaveDailyLogDto } from "./dto/daily-log.dto";
import { WeatherProvider } from "./weather.provider";

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = "Asia/Jerusalem";
const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar date of an instant as seen on site (Asia/Jerusalem), YYYY-MM-DD. */
export function siteDate(instant: Date): string {
  return localDate.format(instant);
}

@Injectable()
export class DailyLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly weather: WeatherProvider,
  ) {}

  /** One log per project per day; creating twice for a date is a conflict, not a duplicate. */
  async create(projectId: string, dto: CreateDailyLogDto, userId: string): Promise<DailyLogSummary> {
    const existing = await this.prisma.dailyLog.findUnique({
      where: { projectId_logDate: { projectId, logDate: new Date(dto.logDate) } },
      select: { id: true },
    });
    if (existing) throw new ConflictException("A log for this date already exists");

    const fetched = dto.weatherCode == null ? await this.lookupWeather(projectId, dto.logDate) : null;
    const log = await this.prisma.dailyLog.create({
      data: {
        projectId,
        logDate: new Date(dto.logDate),
        createdByUserId: userId,
        weatherCode: dto.weatherCode ?? fetched?.weatherCode,
        temperatureC: dto.temperatureC ?? fetched?.temperatureC,
        headcount: (dto.headcount ?? []) as unknown as Prisma.InputJsonValue,
        workDone: dto.workDone ?? "",
        safetyOk: dto.safetyOk,
        safetyNotes: dto.safetyNotes,
      },
    });
    return this.toSummary(log);
  }

  async list(projectId: string): Promise<DailyLogSummary[]> {
    const logs = await this.prisma.dailyLog.findMany({ where: { projectId }, orderBy: { logDate: "desc" } });
    return Promise.all(logs.map((l) => this.toSummary(l)));
  }

  async get(projectId: string, logId: string): Promise<DailyLogSummary> {
    return this.toSummary(await this.findOwned(projectId, logId));
  }

  async update(projectId: string, logId: string, dto: SaveDailyLogDto): Promise<DailyLogSummary> {
    const log = await this.findOwned(projectId, logId);
    if (log.status === "locked") throw new ConflictException("The log is locked");
    const updated = await this.prisma.dailyLog.update({
      where: { id: logId },
      data: {
        weatherCode: dto.weatherCode,
        temperatureC: dto.temperatureC,
        headcount: dto.headcount as unknown as Prisma.InputJsonValue | undefined,
        workDone: dto.workDone,
        safetyOk: dto.safetyOk,
        safetyNotes: dto.safetyNotes,
      },
    });
    return this.toSummary(updated);
  }

  async fetchWeather(projectId: string, logId: string): Promise<DailyLogSummary> {
    const log = await this.findOwned(projectId, logId);
    if (log.status === "locked") throw new ConflictException("The log is locked");
    const weather = await this.lookupWeather(projectId, siteDateOf(log));
    if (!weather) throw new NotFoundException("No weather is available for this project and date");
    const updated = await this.prisma.dailyLog.update({
      where: { id: logId },
      data: { weatherCode: weather.weatherCode, temperatureC: weather.temperatureC },
    });
    return this.toSummary(updated);
  }

  /** Supervisor approval locks the log and stamps a hash of its content. */
  async approve(projectId: string, logId: string, userId: string): Promise<DailyLogSummary> {
    const log = await this.findOwned(projectId, logId);
    if (log.status === "locked") throw new ConflictException("The log is already locked");
    const summary = await this.toSummary(log);
    const contentHash = hashContent(summary);

    const updated = await this.prisma.dailyLog.update({
      where: { id: logId },
      data: { status: "locked", approvedAt: new Date(), approvedByUserId: userId, contentHash },
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: "customer",
      action: "daily_log_approved",
      entityType: "daily_log",
      entityId: logId,
      projectId,
      metadata: { logDate: summary.logDate, contentHash },
    });
    return this.toSummary(updated);
  }

  private async lookupWeather(projectId: string, date: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { latitude: true, longitude: true },
    });
    if (!project?.latitude || !project.longitude) return null;
    return this.weather.getWeather(Number(project.latitude), Number(project.longitude), date);
  }

  private async findOwned(projectId: string, logId: string): Promise<DailyLog> {
    const log = await this.prisma.dailyLog.findFirst({ where: { id: logId, projectId } });
    if (!log) throw new NotFoundException();
    return log;
  }

  /** Pours on the log's date are read from the lab-test records rather than copied. */
  async toSummary(log: DailyLog): Promise<DailyLogSummary> {
    const date = siteDateOf(log);
    const around = new Date(`${date}T12:00:00Z`);
    const pours = await this.prisma.concretePour.findMany({
      where: { projectId: log.projectId, castAt: { gte: new Date(around.getTime() - DAY_MS), lte: new Date(around.getTime() + DAY_MS) } },
      select: { id: true, element: true, concreteGrade: true, castAt: true },
      orderBy: { castAt: "asc" },
    });
    return {
      id: log.id,
      logDate: date,
      status: log.status,
      weatherCode: log.weatherCode,
      temperatureC: log.temperatureC === null ? null : Number(log.temperatureC),
      headcount: log.headcount as unknown as HeadcountEntry[],
      workDone: log.workDone,
      safetyOk: log.safetyOk,
      safetyNotes: log.safetyNotes,
      pours: pours.filter((p) => siteDate(p.castAt) === date).map(({ id, element, concreteGrade }) => ({ id, element, concreteGrade })),
      approvedAt: log.approvedAt?.toISOString() ?? null,
      contentHash: log.contentHash,
    };
  }
}

function siteDateOf(log: DailyLog): string {
  return log.logDate.toISOString().slice(0, 10);
}

/** Hash over the log's content only, so re-reading an approved log reproduces it. */
export function hashContent(summary: DailyLogSummary): string {
  const { logDate, weatherCode, temperatureC, headcount, workDone, safetyOk, safetyNotes, pours } = summary;
  return createHash("sha256")
    .update(JSON.stringify({ logDate, weatherCode, temperatureC, headcount, workDone, safetyOk, safetyNotes, pours }))
    .digest("hex");
}
