import { Controller, Get, UseGuards } from "@nestjs/common";
import type { AdminContractSummary } from "@buildguard/shared-types";
import { AdminContractsService } from "./admin-contracts.service";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { StaffOnlyGuard } from "../identity/guards/staff-only.guard";

@Controller("admin/contracts")
@UseGuards(JwtAuthGuard, StaffOnlyGuard)
export class AdminContractsController {
  constructor(private readonly contracts: AdminContractsService) {}

  @Get()
  list(): Promise<AdminContractSummary[]> {
    return this.contracts.list();
  }
}
