import { BadRequestException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { LeadsService } from "./leads.service";
import { LeadsRetention } from "./leads.retention";
import { normalizeIsraeliPhone } from "./phone";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

const ORIGIN = "https://yesod.sher.biz";

const register = (overrides: Record<string, unknown> = {}) => ({
  name: "דנה כהן",
  phone: "050-123-4567",
  email: " Dana@Example.com ",
  role: "inspector",
  projectCount: 3,
  privacyConsent: true,
  website: "",
  t0: Date.now() - 60_000,
  ...overrides,
});

const contact = (overrides: Record<string, unknown> = {}) => ({
  name: "יוסי",
  email: "yossi@example.com",
  topic: "demo",
  message: "אשמח לתאם הדגמה בשבוע הבא",
  privacyConsent: true,
  ...overrides,
});

function makeService(opts: { env?: Record<string, string>; duplicate?: boolean; countToday?: number; lead?: object } = {}) {
  const env: Record<string, string> = { LEADS_ALLOWED_ORIGINS: `${ORIGIN}, http://10.0.0.100:8114/`, ...opts.env };
  const prisma = {
    lead: {
      findFirst: jest.fn().mockResolvedValue(opts.duplicate ? { id: "dup" } : null),
      count: jest.fn().mockResolvedValue(opts.countToday ?? 0),
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(opts.lead ?? null),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...opts.lead, ...data, updatedAt: new Date() })),
    },
  } as unknown as PrismaService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return { service: new LeadsService(prisma, audit, config), prisma, audit };
}

async function validationErrors(promise: Promise<unknown>): Promise<Record<string, string>> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(BadRequestException);
  return ((err as BadRequestException).getResponse() as { errors: Record<string, string> }).errors;
}

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("normalizeIsraeliPhone", () => {
  it.each([
    ["050-123-4567", "+972501234567"],
    ["0501234567", "+972501234567"],
    ["+972 50 123 4567", "+972501234567"],
    ["+972-050-1234567", "+972501234567"],
    ["00972501234567", "+972501234567"],
    ["972501234567", "+972501234567"],
    ["(03) 123-4567", "+97231234567"],
    ["077-1234567", "+972771234567"],
  ])("%s -> %s", (raw, e164) => {
    expect(normalizeIsraeliPhone(raw)).toBe(e164);
  });

  it.each(["050123456", "05012345678", "0101234567", "+1 212 555 0100", "abc", ""])("rejects %s", (raw) => {
    expect(normalizeIsraeliPhone(raw)).toBeNull();
  });
});

describe("LeadsService.submit", () => {
  it("stores a valid registration with normalised phone and email", async () => {
    const { service, prisma } = makeService();
    await service.submit(
      "register",
      register({ utm: { source: "facebook", campaign: "pilot" }, marketingOptIn: true, referrer: "https://www.google.com/search?q=x" }),
      ORIGIN,
    );

    expect((prisma.lead.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
      kind: "register",
      name: "דנה כהן",
      phone: "+972501234567",
      email: "dana@example.com",
      role: "inspector",
      projectCount: 3,
      marketingOptIn: true,
      referrer: "www.google.com",
      utmSource: "facebook",
      utmCampaign: "pilot",
    });
  });

  it("stores the audience-specific fields from an owner and a contractor form", async () => {
    const { service, prisma } = makeService();
    await service.submit(
      "register",
      register({
        role: "owner_builder",
        audience: "owner",
        landingPath: "/owners/",
        projectKind: "renovation",
        budgetRange: "250k_1m",
        needContractors: true,
      }),
      ORIGIN,
    );
    await service.submit(
      "register",
      register({
        email: "amir@example.com",
        role: "contractor",
        audience: "contractor",
        landingPath: "/contractors/",
        trades: ["electrical", "plumbing"],
        teamSize: "2_5",
      }),
      ORIGIN,
    );

    const [owner, contractor] = (prisma.lead.create as jest.Mock).mock.calls.map((c) => c[0].data);
    expect(owner).toMatchObject({ audience: "owner", landingPath: "/owners/", projectKind: "renovation", budgetRange: "250k_1m", needContractors: true, trades: [] });
    expect(contractor).toMatchObject({ audience: "contractor", landingPath: "/contractors/", trades: ["electrical", "plumbing"], teamSize: "2_5" });
  });

  it("reads no-JS form values for trades and the yes/no radio", async () => {
    const { service, prisma } = makeService();
    await service.submit("register", register({ trades: "electrical", needContractors: "no", t0: "" }), ORIGIN);
    expect((prisma.lead.create as jest.Mock).mock.calls[0][0].data).toMatchObject({ trades: ["electrical"], needContractors: false });
  });

  it("rejects unknown audience, trade and a landingPath that is not a bare path", async () => {
    const { service } = makeService();
    const errors = await validationErrors(
      service.submit("register", register({ audience: "admin", trades: ["welding"], landingPath: "https://evil.example/x?a=1" }), ORIGIN),
    );
    expect(errors).toEqual({ audience: "invalid", trades: "invalid", landingPath: "invalid" });
  });

  it("tags the contact form with its audience too", async () => {
    const { service, prisma } = makeService();
    await service.submit("contact", contact({ audience: "other", landingPath: "/" }), ORIGIN);
    expect((prisma.lead.create as jest.Mock).mock.calls[0][0].data).toMatchObject({ audience: "other", landingPath: "/" });
  });

  it("filters the list by audience", async () => {
    const { service, prisma } = makeService();
    await service.list({ audience: "contractor" });
    expect((prisma.lead.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({ audience: "contractor" });
  });

  it("accepts a no-JS urlencoded post: strings, empty optionals and an empty t0", async () => {
    const { service, prisma } = makeService();
    const form = {
      name: "דנה כהן",
      phone: "0501234567",
      email: "dana@example.com",
      role: "owner_builder",
      projectCount: "",
      projectStage: "",
      region: "",
      company: "",
      message: "",
      privacyConsent: "true",
      website: "",
      t0: "",
    };
    await service.submit("register", form, ORIGIN);
    const data = (prisma.lead.create as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({ projectCount: undefined, projectStage: undefined, company: undefined, message: undefined, marketingOptIn: false });

    await service.submit("register", { ...form, email: "b@example.com", projectCount: "4", projectStage: "structure" }, ORIGIN);
    expect((prisma.lead.create as jest.Mock).mock.calls[1][0].data).toMatchObject({ projectCount: 4, projectStage: "structure" });
  });

  it("reports each invalid field with a code", async () => {
    const { service, prisma } = makeService();
    const errors = await validationErrors(
      service.submit("register", register({ name: "", phone: "02-1234567", email: "nope", role: "astronaut", projectCount: 2.5, privacyConsent: false }), ORIGIN),
    );
    expect(errors).toEqual({ name: "required", phone: "invalid", email: "invalid", role: "invalid", projectCount: "invalid", privacyConsent: "required" });
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("requires a mobile number for registration but accepts a landline for contact", async () => {
    const { service, prisma } = makeService();
    await expect(validationErrors(service.submit("register", register({ phone: "03-1234567" }), ORIGIN))).resolves.toEqual({ phone: "invalid" });
    await service.submit("contact", contact({ email: undefined, phone: "03-1234567" }), ORIGIN);
    expect((prisma.lead.create as jest.Mock).mock.calls[0][0].data).toMatchObject({ phone: "+97231234567", email: undefined });
  });

  it("requires a phone or an email on contact", async () => {
    const { service } = makeService();
    const errors = await validationErrors(service.submit("contact", contact({ email: "" }), ORIGIN));
    expect(errors).toEqual({ phone: "required", email: "required" });
  });

  it("enforces the contact message length", async () => {
    const { service } = makeService();
    await expect(validationErrors(service.submit("contact", contact({ message: "קצר" }), ORIGIN))).resolves.toEqual({ message: "too_short" });
    await expect(validationErrors(service.submit("contact", contact({ message: "א".repeat(2001) }), ORIGIN))).resolves.toEqual({ message: "too_long" });
  });

  it("silently drops a filled honeypot without validating or storing", async () => {
    const { service, prisma } = makeService();
    await expect(service.submit("register", { website: "http://spam.example" }, ORIGIN)).resolves.toBeUndefined();
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("silently drops a form filled in under 3 seconds", async () => {
    const { service, prisma } = makeService();
    await service.submit("register", register({ t0: Date.now() - 1000 }), ORIGIN);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("accepts a missing t0 (no JS) and a client clock running ahead", async () => {
    const { service, prisma } = makeService();
    await service.submit("register", register({ t0: undefined }), ORIGIN);
    await service.submit("register", register({ t0: Date.now() + 60_000 }), ORIGIN);
    expect(prisma.lead.create).toHaveBeenCalledTimes(2);
  });

  it("silently drops a duplicate within 24 h, matching on email and kind", async () => {
    const { service, prisma } = makeService({ duplicate: true });
    await service.submit("register", register(), ORIGIN);

    const where = (prisma.lead.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where).toMatchObject({ kind: "register", email: "dana@example.com" });
    expect(Date.now() - where.createdAt.gte.getTime()).toBeCloseTo(24 * 60 * 60 * 1000, -3);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("dedupes a phone-only contact on the phone", async () => {
    const { service, prisma } = makeService();
    await service.submit("contact", contact({ email: undefined, phone: "0501234567" }), ORIGIN);
    expect((prisma.lead.findFirst as jest.Mock).mock.calls[0][0].where).toMatchObject({ kind: "contact", phone: "+972501234567" });
  });

  it("answers 503 once the daily cap is reached and alerts the webhook once", async () => {
    const { service, prisma } = makeService({ env: { LEADS_DAILY_CAP: "5", LEADS_WEBHOOK_URL: "https://ntfy.example/leads" }, countToday: 5 });
    await expect(service.submit("register", register(), ORIGIN)).rejects.toThrow(ServiceUnavailableException);
    await expect(service.submit("register", register({ email: "b@example.com" }), ORIGIN)).rejects.toThrow(ServiceUnavailableException);

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts leads below the cap", async () => {
    const { service, prisma } = makeService({ env: { LEADS_DAILY_CAP: "5" }, countToday: 4 });
    await service.submit("register", register(), ORIGIN);
    expect(prisma.lead.create).toHaveBeenCalled();
  });

  it("rejects a foreign Origin with 403 and allows listed ones (trailing slash ignored)", async () => {
    const { service, prisma } = makeService();
    await expect(service.submit("register", register(), "https://evil.example")).rejects.toThrow(ForbiddenException);
    await expect(service.submit("register", register(), "null")).rejects.toThrow(ForbiddenException);
    await service.submit("register", register(), "http://10.0.0.100:8114");
    expect(prisma.lead.create).toHaveBeenCalledTimes(1);
  });

  it("allows a missing Origin (non-browser client) and any Origin when no allow-list is set", async () => {
    const { service, prisma } = makeService();
    await service.submit("register", register(), undefined);
    const open = makeService({ env: { LEADS_ALLOWED_ORIGINS: "" } });
    await open.service.submit("register", register(), "https://anything.example");
    expect(prisma.lead.create).toHaveBeenCalled();
    expect(open.prisma.lead.create).toHaveBeenCalled();
  });

  it("pings the webhook with category labels only, never personal data", async () => {
    const { service } = makeService({ env: { LEADS_WEBHOOK_URL: "https://ntfy.example/leads" } });
    await service.submit("register", register(), ORIGIN);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ntfy.example/leads");
    expect(init.body).toBe("ליד חדש: הרשמה · מפקח / מהנדס · 3 פרויקטים");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not fail the submission when the webhook is down", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const { service, prisma } = makeService({ env: { LEADS_WEBHOOK_URL: "https://ntfy.example/leads" } });
    await expect(service.submit("contact", contact(), ORIGIN)).resolves.toBeUndefined();
    expect(prisma.lead.create).toHaveBeenCalled();
  });
});

describe("LeadsService admin", () => {
  const lead = {
    id: "l1",
    kind: "register",
    status: "new",
    name: "=HYPERLINK(\"http://x\")",
    phone: "+972501234567",
    email: "a@example.com",
    staffNotes: null,
    marketingOptIn: false,
    createdAt: new Date("2026-10-01T10:00:00Z"),
    updatedAt: new Date("2026-10-01T10:00:00Z"),
  };

  it("audits a status change without the notes text", async () => {
    const { service, audit } = makeService({ lead });
    await service.update("l1", { status: "contacted", staffNotes: "התקשרתי, לחזור ביום ב'" }, "staff-1");

    expect(audit.record).toHaveBeenCalledWith({
      actorUserId: "staff-1",
      actorType: "staff",
      action: "lead_updated",
      entityType: "lead",
      entityId: "l1",
      metadata: { fromStatus: "new", toStatus: "contacted", notesChanged: true },
    });
  });

  it("neutralises formula cells in the CSV but keeps E.164 phones readable", async () => {
    const { service, prisma } = makeService();
    (prisma.lead as unknown as { findMany: jest.Mock }).findMany = jest.fn().mockResolvedValue([lead]);
    const csv = (await service.csv({})).toString("utf8");

    expect(csv.startsWith("﻿\"createdAt\"")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(`"+972501234567"`);
  });
});

describe("LeadsRetention", () => {
  it("purges spam after 7 days, contacts after 12 months and unconverted registrations after 24 months", async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const retention = new LeadsRetention({ lead: { deleteMany } } as unknown as PrismaService);
    const now = new Date("2026-10-15T04:00:00Z");

    await expect(retention.purge(now)).resolves.toBe(3);
    expect(deleteMany.mock.calls[0][0].where.OR).toEqual([
      { status: "spam", updatedAt: { lt: new Date("2026-10-08T04:00:00Z") } },
      { kind: "contact", createdAt: { lt: new Date("2025-10-15T04:00:00Z") } },
      { kind: "register", status: { not: "converted" }, createdAt: { lt: new Date("2024-10-15T04:00:00Z") } },
    ]);
  });
});
