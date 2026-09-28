import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { AdminDisputeSummary, DisputeSummary, ResolveDisputeRequest } from "@buildguard/shared-types";
import { DisputesService } from "../trust/disputes.service";
import { ResolveDisputeDto } from "../trust/dto/resolve-dispute.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { StaffOnlyGuard } from "../identity/guards/staff-only.guard";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

/** No separate AdminDisputesService: resolving a dispute is real business logic (rejects/reinstates the review) that already lives in DisputesService — reused directly, the same way ProjectsModule reuses FinanceService rather than wrapping it. */
@Controller("admin/disputes")
@UseGuards(JwtAuthGuard, StaffOnlyGuard)
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  listOpen(): Promise<AdminDisputeSummary[]> {
    return this.disputes.listOpenForAdmin();
  }

  @Post(":disputeId/resolve")
  resolve(
    @Param("disputeId") disputeId: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DisputeSummary> {
    return this.disputes.resolve(disputeId, dto as ResolveDisputeRequest, user.sub);
  }
}
