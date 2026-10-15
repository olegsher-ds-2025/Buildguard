import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AuditModule } from "../audit/audit.module";
import { LeadsController } from "./leads.controller";
import { AdminLeadsController } from "./admin-leads.controller";
import { LeadsService } from "./leads.service";
import { LeadsRetention } from "./leads.retention";

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [LeadsController, AdminLeadsController],
  providers: [LeadsService, LeadsRetention],
})
export class LeadsModule {}
