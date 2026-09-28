import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AuditModule } from "../audit/audit.module";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";
import { DisputesController } from "./disputes.controller";
import { DisputesService } from "./disputes.service";
import { TrustScoreController } from "./trust-score.controller";
import { TrustScoreService } from "./trust-score.service";
import { ScheduleAdherenceProvider } from "./scoring/schedule-adherence.interface";
import { DefaultScheduleAdherenceProvider } from "./scoring/default-schedule-adherence.service";
import { ExecutionQualityProvider } from "./scoring/execution-quality.interface";
import { DefaultExecutionQualityProvider } from "./scoring/default-execution-quality.service";
import { FinancialTransparencyProvider } from "./scoring/financial-transparency.interface";
import { DefaultFinancialTransparencyProvider } from "./scoring/default-financial-transparency.service";

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [ReviewsController, TrustScoreController, DisputesController],
  providers: [
    ReviewsService,
    DisputesService,
    TrustScoreService,
    // The stubbed-component seams (build plan / schema.prisma Trust Score
    // header): swap these bindings once Defect/Invoice track which
    // contractor did the work — nothing else in this module changes.
    { provide: ScheduleAdherenceProvider, useClass: DefaultScheduleAdherenceProvider },
    { provide: ExecutionQualityProvider, useClass: DefaultExecutionQualityProvider },
    { provide: FinancialTransparencyProvider, useClass: DefaultFinancialTransparencyProvider },
  ],
  exports: [TrustScoreService, DisputesService],
})
export class TrustModule {}
