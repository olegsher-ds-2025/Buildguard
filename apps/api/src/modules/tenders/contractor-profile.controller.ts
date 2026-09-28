import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import type { ContractorProfileSelfSummary } from "@buildguard/shared-types";
import { ContractorProfileService } from "./contractor-profile.service";
import { UpdateContractorProfileDto } from "./dto/update-contractor-profile.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

/** Not project-scoped — a contractor's categories/availability are platform-wide, feeding the matching engine on every tender. */
@Controller("contractor-profile")
@UseGuards(JwtAuthGuard)
export class ContractorProfileController {
  constructor(private readonly contractorProfile: ContractorProfileService) {}

  @Get("me")
  getMine(@CurrentUser() user: JwtPayload): Promise<ContractorProfileSelfSummary> {
    return this.contractorProfile.getMine(user.sub);
  }

  @Patch("me")
  updateMine(
    @Body() dto: UpdateContractorProfileDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ContractorProfileSelfSummary> {
    return this.contractorProfile.updateMine(user.sub, dto);
  }
}
