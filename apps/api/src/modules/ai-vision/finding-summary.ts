import type { DetectionStatus, FindingSummary } from "@buildguard/shared-types";

export interface DetectionRow {
  id: string;
  kind: string;
  severity: number;
  confidence: unknown; // Prisma.Decimal
  boundingBox: unknown; // Prisma.JsonValue
  description: string;
  estimatedCostMinMinor: bigint | null;
  estimatedCostMaxMinor: bigint | null;
  currency: string | null;
  status: string;
  createdAt: Date;
}

export function toFindingSummary(detection: DetectionRow, defectId: string | null): FindingSummary {
  return {
    id: detection.id,
    kind: detection.kind,
    severity: detection.severity as FindingSummary["severity"],
    confidence: Number(detection.confidence),
    boundingBox: detection.boundingBox as FindingSummary["boundingBox"],
    description: detection.description,
    estimatedCostMinMinor: detection.estimatedCostMinMinor?.toString() ?? null,
    estimatedCostMaxMinor: detection.estimatedCostMaxMinor?.toString() ?? null,
    currency: detection.currency,
    status: detection.status as DetectionStatus,
    createdAt: detection.createdAt.toISOString(),
    defectId,
  };
}
