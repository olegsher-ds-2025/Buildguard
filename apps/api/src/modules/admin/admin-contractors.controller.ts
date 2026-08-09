import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { ContractorSummary } from "@buildguard/shared-types";
import { AdminContractorsService } from "./admin-contractors.service";
import { RejectContractorDto } from "./dto/reject-contractor.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { StaffOnlyGuard } from "../identity/guards/staff-only.guard";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("admin/contractors")
@UseGuards(JwtAuthGuard, StaffOnlyGuard)
export class AdminContractorsController {
  constructor(private readonly contractors: AdminContractorsService) {}

  @Get()
  list(): Promise<ContractorSummary[]> {
    return this.contractors.list();
  }

  @Post(":contractorId/verify")
  verify(
    @Param("contractorId") contractorId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ContractorSummary> {
    return this.contractors.verify(contractorId, user.sub);
  }

  @Post(":contractorId/reject")
  reject(
    @Param("contractorId") contractorId: string,
    @Body() dto: RejectContractorDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ContractorSummary> {
    return this.contractors.reject(contractorId, dto, user.sub);
  }
}
