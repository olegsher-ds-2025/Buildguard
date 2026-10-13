import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import type {
  ChecklistHoldPointSummary,
  ChecklistItemSummary,
  ChecklistTemplateDetail,
  ChecklistTemplateSummary,
} from "@buildguard/shared-types";
import { ChecklistsService } from "./checklists.service";
import { ChecklistEditorService } from "./checklist-editor.service";
import { CreateItemDto, HoldPointDto, MoveItemDto, UpdateItemDto, UpdateTemplateDto } from "./dto/edit-checklist.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("checklist-templates")
@UseGuards(JwtAuthGuard)
export class ChecklistsController {
  constructor(
    private readonly checklists: ChecklistsService,
    private readonly editor: ChecklistEditorService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtPayload): Promise<ChecklistTemplateSummary[]> {
    return this.checklists.list(user.sub);
  }

  @Get(":templateId")
  get(@Param("templateId") templateId: string, @CurrentUser() user: JwtPayload): Promise<ChecklistTemplateDetail> {
    return this.checklists.get(templateId, user.sub);
  }

  @Post(":templateId/clone")
  clone(@Param("templateId") templateId: string, @CurrentUser() user: JwtPayload): Promise<ChecklistTemplateDetail> {
    return this.checklists.clone(templateId, user.sub);
  }

  @Patch(":templateId")
  @HttpCode(204)
  updateTemplate(@Param("templateId") templateId: string, @Body() dto: UpdateTemplateDto, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.editor.updateTemplate(templateId, dto, user.sub);
  }

  @Delete(":templateId")
  @HttpCode(204)
  deleteTemplate(@Param("templateId") templateId: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.editor.deleteTemplate(templateId, user.sub);
  }

  @Post(":templateId/items")
  createItem(@Param("templateId") templateId: string, @Body() dto: CreateItemDto, @CurrentUser() user: JwtPayload): Promise<ChecklistItemSummary> {
    return this.editor.createItem(templateId, dto, user.sub);
  }

  @Patch(":templateId/items/:itemId")
  updateItem(
    @Param("templateId") templateId: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateItemDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ChecklistItemSummary> {
    return this.editor.updateItem(templateId, itemId, dto, user.sub);
  }

  @Delete(":templateId/items/:itemId")
  @HttpCode(204)
  deleteItem(@Param("templateId") templateId: string, @Param("itemId") itemId: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.editor.deleteItem(templateId, itemId, user.sub);
  }

  @Post(":templateId/items/:itemId/move")
  @HttpCode(204)
  moveItem(
    @Param("templateId") templateId: string,
    @Param("itemId") itemId: string,
    @Body() dto: MoveItemDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.editor.moveItem(templateId, itemId, dto.direction, user.sub);
  }

  @Post(":templateId/hold-points")
  createHoldPoint(@Param("templateId") templateId: string, @Body() dto: HoldPointDto, @CurrentUser() user: JwtPayload): Promise<ChecklistHoldPointSummary> {
    return this.editor.createHoldPoint(templateId, dto, user.sub);
  }

  @Put(":templateId/hold-points/:holdPointId")
  updateHoldPoint(
    @Param("templateId") templateId: string,
    @Param("holdPointId") holdPointId: string,
    @Body() dto: HoldPointDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ChecklistHoldPointSummary> {
    return this.editor.updateHoldPoint(templateId, holdPointId, dto, user.sub);
  }

  @Delete(":templateId/hold-points/:holdPointId")
  @HttpCode(204)
  deleteHoldPoint(@Param("templateId") templateId: string, @Param("holdPointId") holdPointId: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.editor.deleteHoldPoint(templateId, holdPointId, user.sub);
  }
}
