import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AuditModule } from "../audit/audit.module";
import { AdminContractorsController } from "./admin-contractors.controller";
import { AdminContractorsService } from "./admin-contractors.service";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";
import { AdminProjectsController } from "./admin-projects.controller";
import { AdminProjectsService } from "./admin-projects.service";
import { AdminAuditController } from "./admin-audit.controller";
import { AdminAuditService } from "./admin-audit.service";
import { AdminTendersController } from "./admin-tenders.controller";
import { AdminTendersService } from "./admin-tenders.service";
import { AdminContractsController } from "./admin-contracts.controller";
import { AdminContractsService } from "./admin-contracts.service";

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [
    AdminContractorsController,
    AdminUsersController,
    AdminProjectsController,
    AdminAuditController,
    AdminTendersController,
    AdminContractsController,
  ],
  providers: [
    AdminContractorsService,
    AdminUsersService,
    AdminProjectsService,
    AdminAuditService,
    AdminTendersService,
    AdminContractsService,
  ],
})
export class AdminModule {}
