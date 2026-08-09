import { BadRequestException, NotFoundException } from "@nestjs/common";
import { FindingsService } from "./findings.service";
import type { PrismaService } from "../../prisma/prisma.service";

describe("FindingsService", () => {
  const baseDetection = {
    id: "det-1",
    kind: "exposed_reinforcement",
    severity: 4,
    confidence: 0.91 as unknown,
    boundingBox: { x: 0.3, y: 0.2, w: 0.25, h: 0.25 } as unknown,
    description: "Exposed reinforcement — column C-4",
    estimatedCostMinMinor: 180_000n,
    estimatedCostMaxMinor: 320_000n,
    currency: "ILS",
    status: "suggested",
    createdAt: new Date("2026-08-01T00:00:00Z"),
  };

  function makeService(detection = baseDetection) {
    const prisma = {
      detection: {
        findFirst: jest.fn().mockResolvedValue(detection),
        update: jest.fn().mockImplementation(({ data }) => ({ ...detection, ...data })),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...detection, status: "approved" }),
      },
      defect: {
        create: jest.fn().mockResolvedValue({ id: "defect-1" }),
      },
      defectEvent: {
        create: jest.fn().mockResolvedValue({ id: "event-1" }),
      },
      $transaction: jest.fn().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    } as unknown as PrismaService;
    return { service: new FindingsService(prisma), prisma };
  }

  it("approving a suggested finding creates a Defect and a defect_events row, never mutating a Detection into a Defect directly", async () => {
    const { service, prisma } = makeService();
    const result = await service.approve("proj-1", "det-1", {}, "user-1");

    expect(prisma.defect.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ detectionId: "det-1", projectId: "proj-1", severity: 4 }),
      }),
    );
    expect(prisma.defectEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ defectId: "defect-1", eventType: "created", actorUserId: "user-1" }),
      }),
    );
    expect(result.defectId).toBe("defect-1");
  });

  it("rejects approving a finding that isn't suggested (already approved or dismissed)", async () => {
    const { service } = makeService({ ...baseDetection, status: "approved" });
    await expect(service.approve("proj-1", "det-1", {}, "user-1")).rejects.toThrow(BadRequestException);
  });

  it("rejects dismissing a finding that isn't suggested", async () => {
    const { service } = makeService({ ...baseDetection, status: "dismissed" });
    await expect(service.dismiss("proj-1", "det-1", "user-1")).rejects.toThrow(BadRequestException);
  });

  it("dismissing a suggested finding never creates a Defect", async () => {
    const { service, prisma } = makeService();
    const result = await service.dismiss("proj-1", "det-1", "user-1");

    expect(prisma.defect.create).not.toHaveBeenCalled();
    expect(result.defectId).toBeNull();
    expect(result.status).toBe("dismissed");
  });

  it("404s rather than 403s for a detection outside the caller's project (no existence leakage)", async () => {
    const { service, prisma } = makeService();
    (prisma.detection.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.approve("proj-1", "det-1", {}, "user-1")).rejects.toThrow(NotFoundException);
  });
});
