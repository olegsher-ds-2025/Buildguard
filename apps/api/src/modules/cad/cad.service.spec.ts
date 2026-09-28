import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CadService } from "./cad.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { CadDataProvider } from "./cad.interface";

describe("CadService", () => {
  const document = { id: "doc-1", projectId: "proj-1" };
  const viewerData = {
    baseSvgMarkup: "<rect />",
    viewBox: "0 0 800 600",
    scaleMetersPerPixel: 0.01,
    layers: [],
  };

  function makeService(overrides: { document?: unknown } = {}) {
    const prisma = {
      document: { findFirst: jest.fn().mockResolvedValue(overrides.document === undefined ? document : overrides.document) },
      measurement: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: "m1",
            kind: data.kind,
            pointsJson: data.pointsJson,
            valueMeters: { toString: () => String(data.valueMeters) },
            unit: "m",
            createdByUserId: data.createdByUserId,
            createdAt: new Date("2026-09-01T00:00:00Z"),
          }),
        ),
      },
    } as unknown as PrismaService;
    const cadData = { getViewerData: jest.fn().mockResolvedValue(viewerData) } as unknown as CadDataProvider;
    return { service: new CadService(prisma, cadData), prisma };
  }

  it("404s for a document outside the caller's project", async () => {
    const { service } = makeService({ document: null });
    await expect(service.getViewerData("proj-1", "doc-1")).rejects.toThrow(NotFoundException);
  });

  it("rejects an area measurement with fewer than 3 points", async () => {
    const { service } = makeService();
    await expect(
      service.createMeasurement(
        "proj-1",
        "doc-1",
        { kind: "area", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
        "user-1",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("computes a length measurement as scaled polyline distance", async () => {
    const { service } = makeService();
    // 100px straight line at scale 0.01 m/px -> 1m
    const result = await service.createMeasurement(
      "proj-1",
      "doc-1",
      { kind: "length", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      "user-1",
    );
    expect(result.valueMeters).toBe(1);
  });

  it("computes an area measurement via the shoelace formula", async () => {
    const { service } = makeService();
    // 100x100 px square at scale 0.01 m/px -> 1m x 1m = 1 m^2
    const result = await service.createMeasurement(
      "proj-1",
      "doc-1",
      {
        kind: "area",
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
      },
      "user-1",
    );
    expect(result.valueMeters).toBe(1);
  });
});
