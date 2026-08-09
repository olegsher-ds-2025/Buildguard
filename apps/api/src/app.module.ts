import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";

/**
 * Root module. Domain modules (identity, projects, finance, documents,
 * ai-vision, notifications, audit — see the phase-1 module map in the
 * design plan) register here as they land in M1+; each one only exports
 * what it explicitly chooses to, per the modular-monolith principle.
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
