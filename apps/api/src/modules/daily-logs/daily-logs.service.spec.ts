import { ConflictException, NotFoundException } from "@nestjs/common";
import { DailyLogsService, hashContent, siteDate } from "./daily-logs.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { WeatherProvider } from "./weather.provider";

const baseLog = () => ({
  id: "l1", projectId: "p1", logDate: new Date("2026-10-13"), status: "draft", weatherCode: null, temperatureC: null,
  headcount: [{ name: "קבלן א", workers: 4 }], workDone: "יציקה", safetyOk: true, safetyNotes: null, createdByUserId: "u1",
  approvedByUserId: null, approvedAt: null, contentHash: null,
});

function makeService(opts: { log?: object | null; existing?: object | null; coords?: object | null; weather?: object | null } = {}) {
  const prisma = {
    dailyLog: {
      findUnique: jest.fn().mockResolvedValue(opts.existing ?? null),
      findFirst: jest.fn().mockResolvedValue(opts.log === undefined ? baseLog() : opts.log),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...baseLog(), ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...baseLog(), ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    project: { findUnique: jest.fn().mockResolvedValue(opts.coords === undefined ? { latitude: 32.1, longitude: 34.9 } : opts.coords) },
    concretePour: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const weather = { getWeather: jest.fn().mockResolvedValue(opts.weather === undefined ? { weatherCode: 0, temperatureC: 27 } : opts.weather) } as unknown as WeatherProvider;
  return { service: new DailyLogsService(prisma, audit, weather), prisma, audit, weather };
}

describe("DailyLogsService", () => {
  it("allows one log per project per day", async () => {
    const { service } = makeService({ existing: { id: "x" } });
    await expect(service.create("p1", { logDate: "2026-10-13" }, "u1")).rejects.toThrow(ConflictException);
  });

  it("fills weather from the provider when none was entered, but never overrides what was", async () => {
    const auto = makeService();
    const created = await auto.service.create("p1", { logDate: "2026-10-13" }, "u1");
    expect(created).toMatchObject({ weatherCode: 0, temperatureC: 27 });

    const manual = makeService();
    await manual.service.create("p1", { logDate: "2026-10-13", weatherCode: 63, temperatureC: 14 }, "u1");
    expect(manual.weather.getWeather).not.toHaveBeenCalled();
  });

  it("works without coordinates or a weather provider result", async () => {
    const { service } = makeService({ coords: { latitude: null, longitude: null } });
    const created = await service.create("p1", { logDate: "2026-10-13" }, "u1");
    expect(created.weatherCode ?? null).toBeNull();
  });

  it("locks on approval with a content hash, audits, and refuses later edits", async () => {
    const { service, audit, prisma } = makeService();
    const approved = await service.approve("p1", "l1", "inspector-1");
    expect(approved.status).toBe("locked");
    expect(approved.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "daily_log_approved" }));
    expect((prisma.dailyLog.update as jest.Mock).mock.calls[0][0].data.approvedByUserId).toBe("inspector-1");

    const locked = makeService({ log: { ...baseLog(), status: "locked" } });
    await expect(locked.service.update("p1", "l1", { workDone: "x" })).rejects.toThrow(ConflictException);
    await expect(locked.service.approve("p1", "l1", "u")).rejects.toThrow(ConflictException);
  });

  it("404s when the weather lookup has nothing for the project and date", async () => {
    const { service } = makeService({ weather: null });
    await expect(service.fetchWeather("p1", "l1")).rejects.toThrow(NotFoundException);
  });
});

describe("hashContent / siteDate", () => {
  const summary = { id: "a", logDate: "2026-10-13", status: "draft" as const, weatherCode: 0, temperatureC: 20, headcount: [], workDone: "x", safetyOk: true, safetyNotes: null, pours: [], approvedAt: null, contentHash: null };

  it("depends on content, not on status or approval fields", () => {
    expect(hashContent(summary)).toBe(hashContent({ ...summary, status: "locked", approvedAt: "2026-10-13T10:00:00Z" }));
    expect(hashContent(summary)).not.toBe(hashContent({ ...summary, workDone: "y" }));
  });

  it("puts a late-evening UTC instant on the next calendar day in Jerusalem", () => {
    expect(siteDate(new Date("2026-10-13T22:30:00Z"))).toBe("2026-10-14");
    expect(siteDate(new Date("2026-10-13T10:00:00Z"))).toBe("2026-10-13");
  });
});
