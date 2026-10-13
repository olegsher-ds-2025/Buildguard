import { BadRequestException, ConflictException } from "@nestjs/common";
import { ContractsService } from "./contracts.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { HoldPointsService } from "../hold-points/hold-points.service";

describe("ContractsService.releasePaymentMilestone", () => {
  const contract = { id: "c1", projectId: "p1", status: "signed", contractorProfile: { companyName: "x" } };
  const milestone = { id: "m1", contractId: "c1", phaseId: "ph1", status: "pending", amountMinor: 1_000n, currency: "ILS", sequenceNo: 1, description: "d", releasedAt: null };

  function makeService(opts: { contract?: object; milestone?: object; phaseStatus?: string; gate?: jest.Mock } = {}) {
    const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...milestone, ...data }));
    const tx = {
      phase: { findUnique: jest.fn().mockResolvedValue({ id: "ph1", status: opts.phaseStatus ?? "verified" }) },
      contractPaymentMilestone: { update },
    };
    const prisma = {
      contract: { findFirst: jest.fn().mockResolvedValue({ ...contract, ...opts.contract }) },
      contractPaymentMilestone: { findFirst: jest.fn().mockResolvedValue({ ...milestone, ...opts.milestone }) },
      $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const gate = opts.gate ?? jest.fn();
    const holdPoints = { assertNoOpenHoldPoints: gate } as unknown as HoldPointsService;
    return { service: new ContractsService(prisma, audit, holdPoints), audit, update, gate };
  }

  it("releases an approved phase's payment and audits it", async () => {
    const { service, audit, update, gate } = makeService();
    const result = await service.releasePaymentMilestone("p1", "c1", "m1", "owner-1");

    expect(gate).toHaveBeenCalledWith(expect.anything(), "ph1");
    expect(update).toHaveBeenCalled();
    expect(result.status).toBe("released");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "payment_milestone_released" }));
  });

  it("is blocked by an open hold point, writing and auditing nothing", async () => {
    const gate = jest.fn().mockRejectedValue(new ConflictException("open hold points"));
    const { service, audit, update } = makeService({ gate });
    await expect(service.releasePaymentMilestone("p1", "c1", "m1", "owner-1")).rejects.toThrow(ConflictException);
    expect(update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("is blocked until the supervisor has approved the phase", async () => {
    const { service, update } = makeService({ phaseStatus: "in_progress" });
    await expect(service.releasePaymentMilestone("p1", "c1", "m1", "owner-1")).rejects.toThrow(/not been approved/);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects draft contracts and already-released milestones", async () => {
    await expect(makeService({ contract: { status: "draft" } }).service.releasePaymentMilestone("p1", "c1", "m1", "o")).rejects.toThrow(BadRequestException);
    await expect(makeService({ milestone: { status: "released" } }).service.releasePaymentMilestone("p1", "c1", "m1", "o")).rejects.toThrow(BadRequestException);
  });

  it("has nothing to gate on for a milestone without a phase", async () => {
    const { service, gate } = makeService({ milestone: { phaseId: null } });
    await service.releasePaymentMilestone("p1", "c1", "m1", "owner-1");
    expect(gate).not.toHaveBeenCalled();
  });
});
