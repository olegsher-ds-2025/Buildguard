/**
 * Seam for the "execution quality" component (25%, design doc §6.3):
 * confirmed defects (Vision + inspector), rework rate. Defect in this
 * schema is tied to a Project, not to which contractor's work caused it —
 * a project can have several contractors across different tenders, so
 * there is no attributable-per-contractor defect data yet. Swapping this
 * binding (see TrustModule) for a real implementation, once Defect tracks
 * responsible contractor, is the entire integration point.
 */
export abstract class ExecutionQualityProvider {
  abstract scoreFor(contractorProfileId: string): Promise<number>;
}
