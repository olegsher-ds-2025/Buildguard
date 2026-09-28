import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { CadController } from "./cad.controller";
import { CadService } from "./cad.service";
import { CadDataProvider } from "./cad.interface";
import { MockCadDataService } from "./mock-cad-data.service";

@Module({
  imports: [IdentityModule],
  controllers: [CadController],
  providers: [
    CadService,
    // The seam: swap this one binding for a real DWG/DXF conversion client
    // when phase 3's CAD viewer ships. Nothing else in this module, or in
    // any controller/frontend consuming CadViewerDataResponse, changes.
    { provide: CadDataProvider, useClass: MockCadDataService },
  ],
})
export class CadModule {}
