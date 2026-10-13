import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { HoldPointsModule } from "../hold-points/hold-points.module";
import { IdentityModule } from "../identity/identity.module";
import { InspectionsController } from "./inspections.controller";
import { InspectionsService } from "./inspections.service";

@Module({
  imports: [IdentityModule, AuditModule, HoldPointsModule],
  controllers: [InspectionsController],
  providers: [InspectionsService],
})
export class InspectionsModule {}
