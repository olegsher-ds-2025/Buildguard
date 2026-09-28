import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AuditModule } from "../audit/audit.module";
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
import { DefaultTrustScoreProvider } from "./matching/default-trust-score.service";
import { GeoScoringProvider } from "./matching/geo-scoring.interface";
import { DefaultGeoScoringProvider } from "./matching/default-geo-scoring.service";

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [WorkCategoriesController, ContractorProfileController, TendersController, BidsController],
  providers: [
    WorkCategoriesService,
    ContractorProfileService,
    TendersService,
    BidsService,
    // The matching seams (build plan §1): swap these bindings for real geo
    // (PostGIS) and real Trust Score lookups once those exist — nothing
    // else in this module changes.
    { provide: GeoScoringProvider, useClass: DefaultGeoScoringProvider },
    { provide: TrustScoreProvider, useClass: DefaultTrustScoreProvider },
    { provide: MatchingEngine, useClass: DefaultMatchingEngine },
  ],
  exports: [TendersService, BidsService],
})
export class TendersModule {}
