import { Injectable } from "@nestjs/common";
import type { ChatMessageSummary, SendChatMessageResponse } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { RagService } from "./rag.interface";

type MessageRow = {
  id: string;
  role: string;
  content: string;
  citations: unknown;
  createdAt: Date;
};

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagService,
  ) {}

  async listMessages(projectId: string): Promise<ChatMessageSummary[]> {
    const conversation = await this.prisma.conversation.findUnique({ where: { projectId } });
    if (!conversation) return [];

    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });
    return messages.map((m) => this.toSummary(m));
  }

  async send(projectId: string, content: string, userId: string): Promise<SendChatMessageResponse> {
    const conversation = await this.prisma.conversation.upsert({
      where: { projectId },
      update: {},
      create: { projectId, createdByUserId: userId },
    });

    const userMessage = await this.prisma.message.create({
      data: { conversationId: conversation.id, authorUserId: userId, role: "user", content },
    });

    const answer = await this.rag.answer({ projectId, question: content });

    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: answer.content,
        citations: answer.citations as unknown as object[],
      },
    });

    return {
      userMessage: this.toSummary(userMessage),
      assistantMessage: this.toSummary(assistantMessage),
    };
  }

  private toSummary(message: MessageRow): ChatMessageSummary {
    return {
      id: message.id,
      role: message.role as ChatMessageSummary["role"],
      content: message.content,
      citations: (message.citations ?? []) as ChatMessageSummary["citations"],
      createdAt: message.createdAt.toISOString(),
    };
  }
}
