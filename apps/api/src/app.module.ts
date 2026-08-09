import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { IdentityModule } from "./modules/identity/identity.module";

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
  ],
})
export class AppModule {}
