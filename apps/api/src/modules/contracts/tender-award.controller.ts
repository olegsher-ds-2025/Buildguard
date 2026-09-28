import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import type { ContractSummary, SelectWinnerRequest } from "@buildguard/shared-types";
import { ContractsService } from "./contracts.service";
import { SelectWinningBidDto } from "./dto/select-winning-bid.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { Roles } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

/** Lives in the contracts module (not tenders) since selecting a winner is the point a Contract is created. */
@Controller("projects/:projectId/tenders/:tenderId")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class TenderAwardController {
  constructor(private readonly contracts: ContractsService) {}

  @Post("select-winner")
  @Roles("owner", "project_manager")
  selectWinner(
    @Param("projectId") projectId: string,
    @Param("tenderId") tenderId: string,
    @Body() dto: SelectWinningBidDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ContractSummary> {
    return this.contracts.selectWinner(projectId, tenderId, (dto as SelectWinnerRequest).bidId, user.sub);
  }
}
