import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { IdentityModule } from "../identity/identity.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ConcreteService } from "./concrete.service";
import { LabTestsController } from "./lab-tests.controller";
import { LabTestsMonitorService } from "./lab-tests-monitor.service";
import { TimedTestsService } from "./timed-tests.service";

@Module({
  imports: [IdentityModule, AuditModule, NotificationsModule],
  controllers: [LabTestsController],
  providers: [ConcreteService, TimedTestsService, LabTestsMonitorService],
  exports: [LabTestsMonitorService],
})
export class LabTestsModule {}
