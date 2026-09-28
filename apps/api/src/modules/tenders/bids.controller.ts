import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { BidSummary, SubmitBidRequest } from "@buildguard/shared-types";
import { BidsService } from "./bids.service";
import { SubmitBidDto } from "./dto/submit-bid.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { Roles } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/tenders/:tenderId/bids")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class BidsController {
  constructor(private readonly bids: BidsService) {}

  /** Owner/PM-only comparison table — contractors never see competitors' bids. */
  @Get()
  @Roles("owner", "project_manager")
  listForComparison(
    @Param("projectId") projectId: string,
    @Param("tenderId") tenderId: string,
  ): Promise<BidSummary[]> {
    return this.bids.listForComparison(projectId, tenderId);
  }

  @Post()
  @Roles("contractor")
  submit(
    @Param("projectId") projectId: string,
    @Param("tenderId") tenderId: string,
    @Body() dto: SubmitBidDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BidSummary> {
    return this.bids.submit(projectId, tenderId, dto as SubmitBidRequest, user.sub);
  }

  @Post(":bidId/withdraw")
  @Roles("contractor")
  withdraw(
    @Param("projectId") projectId: string,
    @Param("tenderId") tenderId: string,
    @Param("bidId") bidId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<BidSummary> {
    return this.bids.withdraw(projectId, tenderId, bidId, user.sub);
  }
}
