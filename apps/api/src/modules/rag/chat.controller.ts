import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { ChatMessageSummary, SendChatMessageResponse } from "@buildguard/shared-types";
import { ChatService } from "./chat.service";
import { SendChatMessageDto } from "./dto/send-chat-message.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { NON_CONTRACTOR_ROLES, Roles } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/chat/messages")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @Roles(...NON_CONTRACTOR_ROLES)
  list(@Param("projectId") projectId: string): Promise<ChatMessageSummary[]> {
    return this.chat.listMessages(projectId);
  }

  @Post()
  @Roles(...NON_CONTRACTOR_ROLES)
  send(
    @Param("projectId") projectId: string,
    @Body() dto: SendChatMessageDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SendChatMessageResponse> {
    return this.chat.send(projectId, dto.content, user.sub);
  }
}
