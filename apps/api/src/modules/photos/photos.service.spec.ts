import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PhotosService } from "./photos.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";

function makeService(opts: { exists?: boolean; existingPhoto?: unknown; assignedDefect?: unknown } = {}) {
  const row = { id: "ph1", tag: "after", objectKey: "k", markup: [], gpsLat: null, gpsLng: null, takenAt: null,
    uploadedByUserId: "u1", createdAt: new Date(), phaseId: null, inspectionId: null, checklistItemId: null, defectId: "d1" };
  const prisma = {
    photo: {
      findFirst: jest.fn().mockResolvedValue(opts.existingPhoto ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(row),
    },
    defect: { findFirst: jest.fn().mockResolvedValue(opts.assignedDefect ?? null) },
    phase: { findFirst: jest.fn().mockResolvedValue({}) },
    inspection: { findFirst: jest.fn().mockResolvedValue({}) },
    checklistItem: { findUnique: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  const storage = {
    getUploadUrl: jest.fn().mockResolvedValue("http://upload"),
    getDownloadUrl: jest.fn().mockResolvedValue("http://download"),
    objectExists: jest.fn().mockResolvedValue(opts.exists ?? true),
  } as unknown as StorageService;
  return { service: new PhotosService(prisma, storage), prisma, storage };
}

const inspector = { userId: "u1", role: "inspector" as const };

describe("PhotosService", () => {
  it("rejects confirmation when nothing was uploaded", async () => {
    const { service } = makeService({ exists: false });
    await expect(service.confirmUpload("p1", "ph1", { tag: "before_cover" }, inspector)).rejects.toThrow(BadRequestException);
  });

  it("persists a confirmed photo with its tag and server-built key", async () => {
    const { service, prisma } = makeService();
    await service.confirmUpload("p1", "ph1", { tag: "before_cover", inspectionId: "i1", checklistItemId: "c1" }, inspector);
    expect((prisma.photo.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
      id: "ph1", tag: "before_cover", objectKey: "projects/p1/photos/ph1", uploadedByUserId: "u1",
    });
  });

  it("returns the existing row when the same upload is confirmed twice", async () => {
    const { service, prisma } = makeService({ existingPhoto: { id: "ph1", tag: "after", objectKey: "k", markup: [], gpsLat: null, gpsLng: null, takenAt: null, uploadedByUserId: "u1", createdAt: new Date() } });
    await service.confirmUpload("p1", "ph1", { tag: "after" }, inspector);
    expect(prisma.photo.create).not.toHaveBeenCalled();
  });

  it("lets a contractor attach only an 'after' photo to their own defect", async () => {
    const contractor = { userId: "c1", role: "contractor" as const };
    await expect(
      makeService({ assignedDefect: { id: "d1" } }).service.confirmUpload("p1", "ph1", { tag: "after", defectId: "d1" }, contractor),
    ).resolves.toBeDefined();
    await expect(
      makeService({ assignedDefect: { id: "d1" } }).service.confirmUpload("p1", "ph1", { tag: "inspection", defectId: "d1" }, contractor),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      makeService({ assignedDefect: null }).service.confirmUpload("p1", "ph1", { tag: "after", defectId: "d1" }, contractor),
    ).rejects.toThrow(ForbiddenException);
  });

  it("scopes a contractor's photo list to defects assigned to them", async () => {
    const { service, prisma } = makeService();
    await service.list("p1", {}, { userId: "c1", role: "contractor" });
    expect((prisma.photo.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({
      projectId: "p1", defect: { assignedToUserId: "c1" },
    });
  });
});
