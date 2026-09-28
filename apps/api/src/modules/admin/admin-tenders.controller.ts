import { Controller, Get, UseGuards } from "@nestjs/common";
import type { AdminTenderSummary } from "@buildguard/shared-types";
import { AdminTendersService } from "./admin-tenders.service";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { StaffOnlyGuard } from "../identity/guards/staff-only.guard";

@Controller("admin/tenders")
@UseGuards(JwtAuthGuard, StaffOnlyGuard)
export class AdminTendersController {
  constructor(private readonly tenders: AdminTendersService) {}

  @Get()
  list(): Promise<AdminTenderSummary[]> {
    return this.tenders.list();
  }
}
