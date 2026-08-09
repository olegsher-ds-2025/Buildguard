import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AdminContractorsService } from "./admin-contractors.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

describe("AdminContractorsService", () => {
  const baseContractor = {
    id: "c-1",
    companyName: "Golan Electric",
    licenseNumber: "CON-9012",
    licenseExpiryDate: null,
    insuranceExpiryDate: null,
    verificationStatus: "pending",
    verifiedAt: null,
    user: null,
  };

  function makeService(contractor = baseContractor) {
    const prisma = {
      contractorProfile: {
        findUnique: jest.fn().mockResolvedValue(contractor),
        update: jest.fn().mockImplementation(({ data }) => ({ ...contractor, ...data, user: null })),
      },
    } as unknown as PrismaService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return { service: new AdminContractorsService(prisma, audit), prisma, audit };
  }

  it("verifying a pending contractor updates status and records an audit entry", async () => {
    const { service, prisma, audit } = makeService();
    const result = await service.verify("c-1", "staff-1");

    expect(prisma.contractorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verificationStatus: "verified", verifiedByStaffUserId: "staff-1" }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "staff",
        actorUserId: "staff-1",
        action: "contractor_verified",
        entityId: "c-1",
      }),
    );
    expect(result.verificationStatus).toBe("verified");
  });

  it("rejecting a pending contractor records the reason in the audit entry", async () => {
    const { service, audit } = makeService();
    await service.reject("c-1", { reason: "License expired" }, "staff-1");

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contractor_verification_rejected",
        metadata: expect.objectContaining({ reason: "License expired" }),
      }),
    );
  });

  it("rejects verifying a contractor that isn't pending/unverified (no re-verifying an already-decided one)", async () => {
    const { service } = makeService({ ...baseContractor, verificationStatus: "verified" });
    await expect(service.verify("c-1", "staff-1")).rejects.toThrow(BadRequestException);
  });

  it("404s for a nonexistent contractor", async () => {
    const { service, prisma } = makeService();
    (prisma.contractorProfile.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.verify("nope", "staff-1")).rejects.toThrow(NotFoundException);
  });
});
