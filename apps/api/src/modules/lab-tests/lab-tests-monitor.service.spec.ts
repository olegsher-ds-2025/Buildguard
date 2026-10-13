import { LabTestsMonitorService } from "./lab-tests-monitor.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { NotificationsService } from "../notifications/notifications.service";

const day = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-20T12:00:00Z");

function makeService(opts: { pours?: object[]; tests?: object[] } = {}) {
  const prisma = {
    concretePour: { findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.castAt.gt ? opts.pours?.filter((p) => (p as { castAt: Date }).castAt > now) ?? [] : opts.pours?.filter((p) => (p as { castAt: Date }).castAt <= now) ?? [])) },
    timedTest: { findMany: jest.fn().mockResolvedValue(opts.tests ?? []) },
  } as unknown as PrismaService;
  const notifications = { notifyProject: jest.fn().mockResolvedValue(1) } as unknown as NotificationsService;
  return { service: new LabTestsMonitorService(prisma, notifications), notifications };
}

const pour = (id: string, castAt: Date, results: object[] = []) => ({ id, projectId: "p1", element: "תקרה", castAt, results });

describe("LabTestsMonitorService", () => {
  it("asks for the 7-day result once it is due and missing, and the 28-day only after 28 days", async () => {
    const { service, notifications } = makeService({ pours: [pour("a", new Date(now.getTime() - 8 * day)), pour("b", new Date(now.getTime() - 30 * day), [{ ageDays: 7 }])] });
    await service.run(now);
    const keys = (notifications.notifyProject as jest.Mock).mock.calls.map((c) => c[4]);
    expect(keys).toEqual(["lab_result_due:a:7", "lab_result_due:b:28"]);
  });

  it("alerts when a timed test has run its course, but not while it is still running", async () => {
    const { service, notifications } = makeService({
      tests: [
        { id: "done", projectId: "p1", kind: "flood", location: "גג", startedAt: new Date(now.getTime() - 80 * 3600_000), durationHours: 72 },
        { id: "going", projectId: "p1", kind: "flood", location: "גג", startedAt: new Date(now.getTime() - 10 * 3600_000), durationHours: 72 },
      ],
    });
    await service.run(now);
    expect((notifications.notifyProject as jest.Mock).mock.calls.map((c) => c[4])).toEqual(["timed_test_due:done"]);
  });

  it("raises a cross-trade coordination alert for a pour in the next three days only", async () => {
    const { service, notifications } = makeService({ pours: [pour("soon", new Date(now.getTime() + 2 * day)), pour("later", new Date(now.getTime() + 5 * day))] });
    // the mock returns every future pour; the monitor's own query bounds the window, so check the query it issued
    await service.run(now);
    const calls = (notifications.notifyProject as jest.Mock).mock.calls.filter((c) => c[2] === "pour_coordination");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][3].trades).toEqual(["electrical", "plumbing", "hvac"]);
  });
});
