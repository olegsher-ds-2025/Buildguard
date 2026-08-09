import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { AiVisionModule } from "./modules/ai-vision/ai-vision.module";
import { AdminModule } from "./modules/admin/admin.module";

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
  ],
})
export class AppModule {}
