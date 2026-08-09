import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { IdentityModule } from "../identity/identity.module";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({
  // IdentityModule is imported for ProjectRoleGuard: Nest resolves a guard
  // passed by class reference (@UseGuards(ProjectRoleGuard)) through this
  // module's own DI scope, so the provider must be reachable here even
  // though ProjectsController never injects it directly.
  imports: [FinanceModule, IdentityModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
