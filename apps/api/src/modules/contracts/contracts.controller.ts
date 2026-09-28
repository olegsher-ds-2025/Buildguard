import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { ContractPaymentMilestoneSummary, ContractSummary } from "@buildguard/shared-types";
import { ContractsService } from "./contracts.service";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { Roles } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/contracts")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get(":contractId")
  getContract(
    @Param("projectId") projectId: string,
    @Param("contractId") contractId: string,
  ): Promise<ContractSummary> {
    return this.contracts.getContract(projectId, contractId);
  }

  @Get(":contractId/payment-milestones")
  listPaymentMilestones(
    @Param("projectId") projectId: string,
    @Param("contractId") contractId: string,
  ): Promise<ContractPaymentMilestoneSummary[]> {
    return this.contracts.listPaymentMilestones(projectId, contractId);
  }

  /** Signing is an owner-level commitment — narrower than the PM role that can create/award tenders. */
  @Post(":contractId/sign")
  @Roles("owner")
  sign(
    @Param("projectId") projectId: string,
    @Param("contractId") contractId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ContractSummary> {
    return this.contracts.sign(projectId, contractId, user.sub);
  }
}
