import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AuditModule } from "../audit/audit.module";
import { TrustModule } from "../trust/trust.module";
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
import { AdminDisputesController } from "./admin-disputes.controller";

@Module({
  imports: [IdentityModule, AuditModule, TrustModule],
  controllers: [
    AdminContractorsController,
    AdminUsersController,
    AdminProjectsController,
    AdminAuditController,
    AdminTendersController,
    AdminContractsController,
    AdminDisputesController,
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
