/**
 * The CAD conversion seam (design doc §6.5, §12 risk R5): swapping this one
 * binding (see CadModule) for a real DWG/DXF -> geometry/vector-tile
 * conversion service is the entire integration point for the future CAD
 * pipeline — no controller, schema, or frontend-contract change required,
 * because the boundary is this interface plus Measurement, which the
 * schema already defines.
 */
export interface CadLayerData {
  id: string;
  name: string;
  colorHex: string;
  svgMarkup: string;
  defaultVisible: boolean;
}

export interface CadViewerData {
  baseSvgMarkup: string;
  viewBox: string;
  scaleMetersPerPixel: number;
  layers: CadLayerData[];
}

export abstract class CadDataProvider {
  abstract getViewerData(documentId: string): Promise<CadViewerData>;
}
