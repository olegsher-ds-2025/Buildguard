import { Injectable } from "@nestjs/common";
import {
  AiVisionService,
  type DetectionResult,
  type SiteCaptureInput,
} from "./ai-vision.interface";

/**
 * Deterministic, clearly-labeled placeholder standing in for the real
 * Vision compute pipeline (design doc §7.1 — phase 3). It exists to prove
 * the upload -> detect -> suggested -> human-review lifecycle end to end
 * before any real model exists, not to simulate actual image analysis.
 */
@Injectable()
export class MockAiVisionService extends AiVisionService {
  async analyzeSiteCapture(_input: SiteCaptureInput): Promise<DetectionResult> {
    return {
      detections: [
        {
          kind: "mock_finding",
          severity: 3,
          confidence: 0.7,
          boundingBox: { x: 0.3, y: 0.3, w: 0.2, h: 0.2 },
          estimatedCostMinMinor: 50_000n,
          estimatedCostMaxMinor: 150_000n,
          currency: "ILS",
          description:
            "Mock AI finding — placeholder pending the real Vision Inspector (phase 3). Review manually.",
        },
      ],
    };
  }
}
