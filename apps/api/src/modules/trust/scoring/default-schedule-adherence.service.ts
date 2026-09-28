import { Injectable } from "@nestjs/common";
import { ScheduleAdherenceProvider } from "./schedule-adherence.interface";

/**
 * Constant placeholder — see schedule-adherence.interface.ts. 0.6 is a
 * neutral-leaning-positive midpoint so this stubbed term neither rewards
 * nor tanks a contractor's score until real completion-date tracking
 * exists (README "Known simplifications").
 */
const SCHEDULE_ADHERENCE_PLACEHOLDER = 0.6;

@Injectable()
export class DefaultScheduleAdherenceProvider extends ScheduleAdherenceProvider {
  async scoreFor(_contractorProfileId: string): Promise<number> {
    return SCHEDULE_ADHERENCE_PLACEHOLDER;
  }
}
