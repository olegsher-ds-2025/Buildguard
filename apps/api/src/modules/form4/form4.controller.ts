import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import type { Form4Readiness } from "@buildguard/shared-types";
import { Form4Service } from "./form4.service";
import { SaveForm4ItemDto } from "./dto/form4.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { NON_CONTRACTOR_ROLES, Roles, WRITE_ROLES } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/form4")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class Form4Controller {
  constructor(private readonly form4: Form4Service) {}

  @Get()
  @Roles(...NON_CONTRACTOR_ROLES)
  get(@Param("projectId") projectId: string): Promise<Form4Readiness> {
    return this.form4.get(projectId);
  }

  @Put(":key")
  @Roles(...WRITE_ROLES)
  save(
    @Param("projectId") projectId: string,
    @Param("key") key: string,
    @Body() dto: SaveForm4ItemDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<Form4Readiness> {
    return this.form4.save(projectId, key, dto, user.sub);
  }
}
