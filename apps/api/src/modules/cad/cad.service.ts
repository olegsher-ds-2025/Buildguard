import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CadViewerDataResponse,
  CreateMeasurementRequest,
  MeasurementSummary,
  PlanPoint,
} from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { CadDataProvider } from "./cad.interface";

@Injectable()
export class CadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cadData: CadDataProvider,
  ) {}

  async getViewerData(projectId: string, documentId: string): Promise<CadViewerDataResponse> {
    await this.findOwnedDocument(projectId, documentId);
    const data = await this.cadData.getViewerData(documentId);
    return { documentId, ...data };
  }

  async listMeasurements(projectId: string, documentId: string): Promise<MeasurementSummary[]> {
    await this.findOwnedDocument(projectId, documentId);
    const measurements = await this.prisma.measurement.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
    });
    return measurements.map(this.toSummary);
  }

  async createMeasurement(
    projectId: string,
    documentId: string,
    dto: CreateMeasurementRequest,
    createdByUserId: string,
  ): Promise<MeasurementSummary> {
    await this.findOwnedDocument(projectId, documentId);

    if (dto.kind === "area" && dto.points.length < 3) {
      throw new BadRequestException("An area measurement needs at least 3 points");
    }

    const { scaleMetersPerPixel } = await this.cadData.getViewerData(documentId);
    const valueMeters =
      dto.kind === "length"
        ? this.polylineLengthPx(dto.points) * scaleMetersPerPixel
        : this.polygonAreaPx(dto.points) * scaleMetersPerPixel * scaleMetersPerPixel;

    const measurement = await this.prisma.measurement.create({
      data: {
        documentId,
        kind: dto.kind,
        pointsJson: dto.points as unknown as object[],
        valueMeters: Math.round(valueMeters * 1000) / 1000,
        createdByUserId,
      },
    });

    return this.toSummary(measurement);
  }

  private async findOwnedDocument(projectId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, projectId } });
    if (!document) throw new NotFoundException();
    return document;
  }

  private polylineLengthPx(points: PlanPoint[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return total;
  }

  // Shoelace formula.
  private polygonAreaPx(points: PlanPoint[]): number {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
  }

  private toSummary(measurement: {
    id: string;
    kind: string;
    pointsJson: unknown;
    valueMeters: { toString(): string };
    unit: string;
    createdByUserId: string;
    createdAt: Date;
  }): MeasurementSummary {
    return {
      id: measurement.id,
      kind: measurement.kind as MeasurementSummary["kind"],
      points: measurement.pointsJson as PlanPoint[],
      valueMeters: Number(measurement.valueMeters.toString()),
      unit: measurement.unit,
      createdByUserId: measurement.createdByUserId,
      createdAt: measurement.createdAt.toISOString(),
    };
  }
}
