import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { IdentityModule } from "../identity/identity.module";
import { DefectsController } from "./defects.controller";
import { DefectsService } from "./defects.service";

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [DefectsController],
  providers: [DefectsService],
})
export class DefectsModule {}
