import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { IdentityModule } from "../identity/identity.module";
import { AuditModule } from "../audit/audit.module";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";

@Module({
  // IdentityModule is imported for ProjectRoleGuard: Nest resolves a guard
  // passed by class reference (@UseGuards(ProjectRoleGuard)) through this
  // module's own DI scope, so the provider must be reachable here even
  // though the controllers never inject it directly.
  imports: [FinanceModule, IdentityModule, AuditModule],
  controllers: [ProjectsController, TeamController],
  providers: [ProjectsService, TeamService],
})
export class ProjectsModule {}
