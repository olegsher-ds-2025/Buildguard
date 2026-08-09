import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { IdentityModule } from "../identity/identity.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [StorageModule, IdentityModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
