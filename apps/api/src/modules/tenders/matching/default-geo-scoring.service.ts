import { Injectable } from "@nestjs/common";
import { GeoScoringProvider } from "./geo-scoring.interface";

/**
 * Constant placeholder — see geo-scoring.interface.ts. Deliberately not a
 * fake distance calculation: 0.5 is a neutral midpoint so geo neither
 * dominates nor zeroes out the composite score until real location data +
 * PostGIS are added (README "Known simplifications").
 */
const GEO_SCORE_PLACEHOLDER = 0.5;

@Injectable()
export class DefaultGeoScoringProvider extends GeoScoringProvider {
  async scoreFor(_contractorProfileId: string, _projectId: string): Promise<number> {
    return GEO_SCORE_PLACEHOLDER;
  }
}
