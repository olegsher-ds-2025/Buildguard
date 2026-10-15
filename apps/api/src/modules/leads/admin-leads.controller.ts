import { Body, Controller, Get, Param, Patch, Query, StreamableFile, UseGuards } from "@nestjs/common";
import type { LeadSummary } from "@buildguard/shared-types";
import { LeadsService } from "./leads.service";
import { ListLeadsQueryDto, UpdateLeadDto } from "./dto/lead.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { StaffOnlyGuard } from "../identity/guards/staff-only.guard";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("admin")
@UseGuards(JwtAuthGuard, StaffOnlyGuard)
export class AdminLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get("leads")
  list(@Query() query: ListLeadsQueryDto): Promise<LeadSummary[]> {
    return this.leads.list(query);
  }

  @Get("leads.csv")
  async csv(@Query() query: ListLeadsQueryDto): Promise<StreamableFile> {
    return new StreamableFile(await this.leads.csv(query), {
      type: "text/csv; charset=utf-8",
      disposition: 'attachment; filename="leads.csv"',
    });
  }

  @Patch("leads/:id")
  update(@Param("id") id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: JwtPayload): Promise<LeadSummary> {
    return this.leads.update(id, dto, user.sub);
  }
}
