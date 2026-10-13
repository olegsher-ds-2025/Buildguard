import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { HoldPointsService } from "./hold-points.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

const event = (kind: string, extra: object = {}) => ({ id: "e", kind, createdAt: new Date("2026-10-01T00:00:00Z"), signerName: null, signerCapacity: null, reason: null, photoId: null, documentId: null, ...extra });
const hp = (id: string, events: object[]) => ({ id, projectId: "p1", phaseId: "ph1", text: `hp ${id}`, subStage: null, phase: { name: "Structure" }, events });

function makeService(opts: { holdPoint?: unknown; holdPoints?: unknown[]; photo?: unknown; phase?: unknown } = {}) {
  const tx = {
    phase: { update: jest.fn() },
    milestone: { updateMany: jest.fn() },
    holdPoint: { findMany: jest.fn().mockResolvedValue(opts.holdPoints ?? []) },
  };
  const prisma = {
    holdPoint: {
      findFirst: jest.fn().mockResolvedValue(opts.holdPoint ?? null),
      findMany: jest.fn().mockResolvedValue(opts.holdPoints ?? []),
    },
    holdPointEvent: { create: jest.fn() },
    photo: { findFirst: jest.fn().mockResolvedValue(opts.photo === undefined ? { id: "photo" } : opts.photo) },
    document: { findFirst: jest.fn().mockResolvedValue({ id: "doc" }) },
    phase: { findFirst: jest.fn().mockResolvedValue(opts.phase === undefined ? { id: "ph1", status: "in_progress" } : opts.phase) },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  return { service: new HoldPointsService(prisma, audit), prisma, audit, tx };
}

const signDto = { signerName: "מהנדס כהן", signerCapacity: "engineer" as const, photoId: "11111111-1111-4111-8111-111111111111" };

describe("HoldPointsService.assertNoOpenHoldPoints", () => {
  it("passes when every hold point is signed or bypassed", async () => {
    const { service, prisma } = makeService({ holdPoints: [hp("a", [event("signed")]), hp("b", [event("bypassed")])] });
    await expect(service.assertNoOpenHoldPoints(prisma, "ph1")).resolves.toBeUndefined();
  });

  it("blocks on a hold point with no events or whose latest event is a reopen", async () => {
    const { service, prisma } = makeService({ holdPoints: [hp("a", []), hp("b", [event("reopened")]), hp("c", [event("signed")])] });
    await expect(service.assertNoOpenHoldPoints(prisma, "ph1")).rejects.toThrow(ConflictException);
  });
});

describe("HoldPointsService.sign / bypass / reopen", () => {
  it("won't close a hold point without an attachment, and checks the attachment is in the project", async () => {
    const open = hp("a", []);
    await expect(makeService({ holdPoint: open }).service.sign("p1", "a", { signerName: "x y", signerCapacity: "engineer" }, "u1")).rejects.toThrow(/attached/);
    await expect(makeService({ holdPoint: open, photo: null }).service.sign("p1", "a", signDto, "u1")).rejects.toThrow(NotFoundException);
  });

  it("signs an open hold point, recording the signer and auditing", async () => {
    const { service, prisma, audit } = makeService({ holdPoint: hp("a", []) });
    await service.sign("p1", "a", signDto, "u1");
    expect((prisma.holdPointEvent.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
      kind: "signed", signerName: "מהנדס כהן", signerCapacity: "engineer", actorUserId: "u1",
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "hold_point_signed" }));
  });

  it("refuses to sign or bypass a hold point that is already closed", async () => {
    const closed = hp("a", [event("signed")]);
    await expect(makeService({ holdPoint: closed }).service.sign("p1", "a", signDto, "u1")).rejects.toThrow(BadRequestException);
    await expect(makeService({ holdPoint: closed }).service.bypass("p1", "a", { reason: "long enough reason" }, "u1")).rejects.toThrow(BadRequestException);
  });

  it("records a bypass with its reason in the audit log", async () => {
    const { service, audit } = makeService({ holdPoint: hp("a", []) });
    await service.bypass("p1", "a", { reason: "הקונסטרוקטור אישר טלפונית" }, "owner-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "hold_point_bypassed", metadata: expect.objectContaining({ reason: "הקונסטרוקטור אישר טלפונית" }) }),
    );
  });

  it("reopens only a closed hold point", async () => {
    await expect(makeService({ holdPoint: hp("a", []) }).service.reopen("p1", "a", {}, "u1")).rejects.toThrow(BadRequestException);
    const { service, prisma } = makeService({ holdPoint: hp("a", [event("bypassed")]) });
    await service.reopen("p1", "a", {}, "u1");
    expect((prisma.holdPointEvent.create as jest.Mock).mock.calls[0][0].data.kind).toBe("reopened");
  });
});

describe("HoldPointsService.approvePhase", () => {
  it("is blocked by an open hold point and changes nothing", async () => {
    const { service, tx } = makeService({ holdPoints: [hp("a", [])] });
    await expect(service.approvePhase("p1", "ph1", "u1")).rejects.toThrow(ConflictException);
    expect(tx.phase.update).not.toHaveBeenCalled();
  });

  it("verifies the phase and its pending milestones once everything is closed", async () => {
    const { service, tx, audit } = makeService({ holdPoints: [hp("a", [event("signed")])] });
    await service.approvePhase("p1", "ph1", "u1");
    expect(tx.phase.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "verified" } }));
    expect(tx.milestone.updateMany).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "phase_approved" }));
  });

  it("won't approve an already-approved phase", async () => {
    const { service } = makeService({ phase: { id: "ph1", status: "verified" } });
    await expect(service.approvePhase("p1", "ph1", "u1")).rejects.toThrow(BadRequestException);
  });
});
