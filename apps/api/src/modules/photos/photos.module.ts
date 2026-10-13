import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { StorageModule } from "../storage/storage.module";
import { PhotosController } from "./photos.controller";
import { PhotosService } from "./photos.service";

@Module({
  imports: [IdentityModule, StorageModule],
  controllers: [PhotosController],
  providers: [PhotosService],
})
export class PhotosModule {}
