/**
 * Seam for the "schedule adherence" component (20%, design doc §6.3):
 * actual deviation from contractual schedule, per verified milestones.
 * Milestone in this schema is tied to a Phase, not a specific
 * Contract/contractor, so there's no way to compute "this contractor's
 * actual vs. planned completion" yet — see the Trust Score section header
 * in schema.prisma. Swapping this binding (see TrustModule) for a real
 * implementation, once Contracts track actual completion dates, is the
 * entire integration point; TrustScoreService never needs to change.
 */
export abstract class ScheduleAdherenceProvider {
  abstract scoreFor(contractorProfileId: string): Promise<number>;
}
