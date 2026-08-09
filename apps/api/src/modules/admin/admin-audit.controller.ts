import { Controller, Get, UseGuards } from "@nestjs/common";
import type { AuditEntrySummary } from "@buildguard/shared-types";
import { AdminAuditService } from "./admin-audit.service";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { StaffOnlyGuard } from "../identity/guards/staff-only.guard";

@Controller("admin/audit-log")
@UseGuards(JwtAuthGuard, StaffOnlyGuard)
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  list(): Promise<AuditEntrySummary[]> {
    return this.audit.list();
  }
}
