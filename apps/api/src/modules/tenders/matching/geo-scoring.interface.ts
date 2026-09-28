/**
 * Seam for the `geo_proximity_decay(distance)` term of the match-score
 * formula (design doc §6.2). Neither Project nor ContractorProfile carry a
 * lat/long today and there is no PostGIS extension configured — real
 * geo-distance scoring requires that schema + infra change, which is out of
 * scope for this module (build plan §1). Swapping this binding (see
 * TendersModule) for a real implementation is the entire integration point;
 * DefaultMatchingEngine never needs to change.
 */
export abstract class GeoScoringProvider {
  abstract scoreFor(contractorProfileId: string, projectId: string): Promise<number>;
}
