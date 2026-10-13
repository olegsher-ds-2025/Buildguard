import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { IdentityModule } from "../identity/identity.module";
import { HoldPointsController } from "./hold-points.controller";
import { HoldPointsService } from "./hold-points.service";

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [HoldPointsController],
  providers: [HoldPointsService],
  exports: [HoldPointsService],
})
export class HoldPointsModule {}
