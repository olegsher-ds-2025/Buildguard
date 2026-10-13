import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { HoldPointsModule } from "../hold-points/hold-points.module";
import { IdentityModule } from "../identity/identity.module";
import { Form4Controller } from "./form4.controller";
import { Form4Service } from "./form4.service";

@Module({
  imports: [IdentityModule, AuditModule, HoldPointsModule],
  controllers: [Form4Controller],
  providers: [Form4Service],
  exports: [Form4Service],
})
export class Form4Module {}
