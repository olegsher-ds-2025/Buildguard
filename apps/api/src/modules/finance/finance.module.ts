import { Module } from "@nestjs/common";
import { FinanceService } from "./finance.service";

@Module({
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
