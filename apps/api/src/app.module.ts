import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { AiVisionModule } from "./modules/ai-vision/ai-vision.module";
import { AdminModule } from "./modules/admin/admin.module";
import { TendersModule } from "./modules/tenders/tenders.module";
import { ContractsModule } from "./modules/contracts/contracts.module";
import { TrustModule } from "./modules/trust/trust.module";
import { RagModule } from "./modules/rag/rag.module";
import { CadModule } from "./modules/cad/cad.module";
import { ChecklistsModule } from "./modules/checklists/checklists.module";
import { DefectsModule } from "./modules/defects/defects.module";
import { PhotosModule } from "./modules/photos/photos.module";
import { DailyLogsModule } from "./modules/daily-logs/daily-logs.module";
import { Form4Module } from "./modules/form4/form4.module";
import { QuotesModule } from "./modules/quotes/quotes.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { LabTestsModule } from "./modules/lab-tests/lab-tests.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { HoldPointsModule } from "./modules/hold-points/hold-points.module";
import { IdempotencyModule } from "./modules/idempotency/idempotency.module";
import { InspectionsModule } from "./modules/inspections/inspections.module";

/**
 * Root module. Domain modules (identity, projects, finance, documents,
 * ai-vision, notifications, audit — see the phase-1 module map in the
 * build plan) register here as they land; each one only exports what it
 * explicitly chooses to, per the modular-monolith principle.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    IdentityModule,
    ProjectsModule,
    DocumentsModule,
    AiVisionModule,
    AdminModule,
    TendersModule,
    ContractsModule,
    TrustModule,
    RagModule,
    CadModule,
    ChecklistsModule,
    DefectsModule,
    HoldPointsModule,
    LabTestsModule,
    DailyLogsModule,
    Form4Module,
    ReportsModule,
    QuotesModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
    InspectionsModule,
    PhotosModule,
    IdempotencyModule,
  ],
})
export class AppModule {}
