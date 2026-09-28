import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { ChatMessageSummary, SendChatMessageResponse } from "@buildguard/shared-types";
import { ChatService } from "./chat.service";
import { SendChatMessageDto } from "./dto/send-chat-message.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/chat/messages")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  list(@Param("projectId") projectId: string): Promise<ChatMessageSummary[]> {
    return this.chat.listMessages(projectId);
  }

  @Post()
  send(
    @Param("projectId") projectId: string,
    @Body() dto: SendChatMessageDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SendChatMessageResponse> {
    return this.chat.send(projectId, dto.content, user.sub);
  }
}
