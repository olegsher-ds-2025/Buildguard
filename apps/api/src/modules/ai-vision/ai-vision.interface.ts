/**
 * The AI seam (design doc §7.3, build plan §2): swapping this one binding
 * (see AiVisionModule) for a real out-of-process client is the entire
 * integration point for the future AI service — no controller, schema, or
 * frontend-contract change required, because the boundary is this interface
 * plus the Detection shape the schema already defines.
 */
export interface SiteCaptureInput {
  siteCaptureId: string;
  projectId: string;
  imageObjectKey: string;
  planVersionId?: string;
}

export interface DetectionCandidate {
  kind: string;
  severity: 1 | 2 | 3 | 4 | 5;
  confidence: number;
  boundingBox: { x: number; y: number; w: number; h: number };
  estimatedCostMinMinor?: bigint;
  estimatedCostMaxMinor?: bigint;
  currency?: string;
  description: string;
}

export interface DetectionResult {
  detections: DetectionCandidate[];
}

export abstract class AiVisionService {
  abstract analyzeSiteCapture(input: SiteCaptureInput): Promise<DetectionResult>;
}
