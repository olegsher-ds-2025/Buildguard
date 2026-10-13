import { Module } from "@nestjs/common";
import { DailyLogsModule } from "../daily-logs/daily-logs.module";
import { Form4Module } from "../form4/form4.module";
import { HoldPointsModule } from "../hold-points/hold-points.module";
import { IdentityModule } from "../identity/identity.module";
import { StorageModule } from "../storage/storage.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [IdentityModule, StorageModule, DailyLogsModule, Form4Module, HoldPointsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
