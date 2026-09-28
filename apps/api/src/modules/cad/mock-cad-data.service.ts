import { Injectable } from "@nestjs/common";
import { CadDataProvider, CadViewerData } from "./cad.interface";

/**
 * Deterministic, clearly-labeled placeholder standing in for a real
 * DWG/DXF -> geometry conversion pipeline (design doc §6.5, phase 3). It's
 * a hand-authored demo floor plan, not derived from any uploaded file —
 * it exists to prove the layer-toggle and measurement lifecycle end to end
 * before any real CAD conversion exists. Same scale/layout regardless of
 * which document is requested.
 */
@Injectable()
export class MockCadDataService extends CadDataProvider {
  async getViewerData(_documentId: string): Promise<CadViewerData> {
    return {
      viewBox: "0 0 800 600",
      // 800px spans a 10m building envelope in this demo drawing.
      scaleMetersPerPixel: 0.0125,
      baseSvgMarkup: `<rect x="20" y="20" width="760" height="560" fill="none" stroke="#333333" stroke-width="4" />`,
      layers: [
        {
          id: "structural",
          name: "Structural",
          colorHex: "#555555",
          defaultVisible: true,
          svgMarkup: `
            <line x1="400" y1="20" x2="400" y2="300" stroke="#555555" stroke-width="3" />
            <line x1="20" y1="300" x2="760" y2="300" stroke="#555555" stroke-width="3" />
          `,
        },
        {
          id: "electrical",
          name: "Electrical",
          colorHex: "#f5a623",
          defaultVisible: false,
          svgMarkup: `
            <circle cx="60" cy="60" r="6" fill="#f5a623" />
            <circle cx="740" cy="60" r="6" fill="#f5a623" />
            <circle cx="60" cy="540" r="6" fill="#f5a623" />
            <line x1="60" y1="60" x2="740" y2="60" stroke="#f5a623" stroke-width="1" stroke-dasharray="4 2" />
          `,
        },
        {
          id: "plumbing",
          name: "Plumbing",
          colorHex: "#4a90d9",
          defaultVisible: false,
          svgMarkup: `
            <line x1="400" y1="300" x2="400" y2="560" stroke="#4a90d9" stroke-width="3" />
            <circle cx="400" cy="560" r="8" fill="#4a90d9" />
          `,
        },
        {
          id: "finishing",
          name: "Finishing",
          colorHex: "#7ed321",
          defaultVisible: false,
          svgMarkup: `<rect x="24" y="24" width="752" height="552" fill="#7ed321" fill-opacity="0.08" />`,
        },
      ],
    };
  }
}
