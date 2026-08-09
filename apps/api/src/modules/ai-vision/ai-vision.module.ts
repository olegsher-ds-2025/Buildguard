import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { IdentityModule } from "../identity/identity.module";
import { AuditModule } from "../audit/audit.module";
import { AiVisionService } from "./ai-vision.interface";
import { MockAiVisionService } from "./mock-ai-vision.service";
import { SiteCapturesController } from "./site-captures.controller";
import { SiteCapturesService } from "./site-captures.service";
import { FindingsController } from "./findings.controller";
import { FindingsService } from "./findings.service";

@Module({
  imports: [StorageModule, IdentityModule, AuditModule],
  controllers: [SiteCapturesController, FindingsController],
  providers: [
    // The seam: swap this one binding for a real out-of-process AI client
    // when phase 3's Vision Inspector ships. Nothing else in this module,
    // or in any controller/frontend consuming FindingSummary, changes.
    { provide: AiVisionService, useClass: MockAiVisionService },
    SiteCapturesService,
    FindingsService,
  ],
})
export class AiVisionModule {}
