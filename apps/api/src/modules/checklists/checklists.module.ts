import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { IdentityModule } from "../identity/identity.module";
import { ChecklistsController } from "./checklists.controller";
import { ChecklistEditorService } from "./checklist-editor.service";
import { ChecklistsService } from "./checklists.service";

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [ChecklistsController],
  providers: [ChecklistsService, ChecklistEditorService],
})
export class ChecklistsModule {}
