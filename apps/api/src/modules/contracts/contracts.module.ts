import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AuditModule } from "../audit/audit.module";
import { ContractsController } from "./contracts.controller";
import { TenderAwardController } from "./tender-award.controller";
import { ContractsService } from "./contracts.service";

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [ContractsController, TenderAwardController],
  providers: [ContractsService],
})
export class ContractsModule {}
