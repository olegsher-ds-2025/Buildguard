import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import type { DisputeSummary, RaiseDisputeRequest } from "@buildguard/shared-types";
import { DisputesService } from "./disputes.service";
import { RaiseDisputeDto } from "./dto/raise-dispute.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

/** Not project-scoped — a contractor disputes a review about themselves regardless of which project it's on; ownership is checked in the service. */
@Controller("reviews/:reviewId/disputes")
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  raise(
    @Param("reviewId") reviewId: string,
    @Body() dto: RaiseDisputeDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DisputeSummary> {
    return this.disputes.raise(reviewId, dto as RaiseDisputeRequest, user.sub);
  }
}
