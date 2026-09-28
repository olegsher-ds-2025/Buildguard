import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AuditModule } from "../audit/audit.module";
import { TrustModule } from "../trust/trust.module";
import { WorkCategoriesController } from "./work-categories.controller";
import { WorkCategoriesService } from "./work-categories.service";
import { ContractorProfileController } from "./contractor-profile.controller";
import { ContractorProfileService } from "./contractor-profile.service";
import { TendersController } from "./tenders.controller";
import { TendersService } from "./tenders.service";
import { BidsController } from "./bids.controller";
import { BidsService } from "./bids.service";
import { MatchingEngine } from "./matching/matching.interface";
import { DefaultMatchingEngine } from "./matching/default-matching.service";
import { TrustScoreProvider } from "./matching/trust-score.interface";
import { ComputedTrustScoreProvider } from "./matching/computed-trust-score.provider";
import { GeoScoringProvider } from "./matching/geo-scoring.interface";
import { DefaultGeoScoringProvider } from "./matching/default-geo-scoring.service";

@Module({
  imports: [IdentityModule, AuditModule, TrustModule],
  controllers: [WorkCategoriesController, ContractorProfileController, TendersController, BidsController],
  providers: [
    WorkCategoriesService,
    ContractorProfileService,
    TendersService,
    BidsService,
    // The geo seam (build plan §1): swap for a real PostGIS-backed lookup
    // once Project/ContractorProfile carry location data. Trust Score is
    // real as of M9 — ComputedTrustScoreProvider delegates to TrustModule.
    { provide: GeoScoringProvider, useClass: DefaultGeoScoringProvider },
    { provide: TrustScoreProvider, useClass: ComputedTrustScoreProvider },
    { provide: MatchingEngine, useClass: DefaultMatchingEngine },
  ],
  exports: [TendersService, BidsService],
})
export class TendersModule {}
