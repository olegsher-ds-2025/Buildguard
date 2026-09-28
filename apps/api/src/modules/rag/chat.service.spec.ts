import { ChatService } from "./chat.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RagService } from "./rag.interface";

describe("ChatService", () => {
  function makeService() {
    const conversation = { id: "conv-1", projectId: "proj-1" };
    const prisma = {
      conversation: {
        upsert: jest.fn().mockResolvedValue(conversation),
        findUnique: jest.fn().mockResolvedValue(conversation),
      },
      message: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({
              id: `msg-${Math.random()}`,
              role: data.role,
              content: data.content,
              citations: data.citations ?? [],
              createdAt: new Date("2026-09-01T00:00:00Z"),
            }),
          ),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    const rag = {
      answer: jest.fn().mockResolvedValue({ content: "The budget is on track.", citations: [] }),
    } as unknown as RagService;
    return { service: new ChatService(prisma, rag), prisma, rag };
  }

  it("send() creates a user message, gets a RAG answer, and persists both", async () => {
    const { service, prisma, rag } = makeService();
    const result = await service.send("proj-1", "how's the budget?", "user-1");

    expect(prisma.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "proj-1" } }),
    );
    expect(rag.answer).toHaveBeenCalledWith({ projectId: "proj-1", question: "how's the budget?" });
    expect(result.userMessage.role).toBe("user");
    expect(result.userMessage.content).toBe("how's the budget?");
    expect(result.assistantMessage.role).toBe("assistant");
    expect(result.assistantMessage.content).toBe("The budget is on track.");
  });

  it("listMessages() returns an empty list when no conversation exists yet", async () => {
    const { service, prisma } = makeService();
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await service.listMessages("proj-1");
    expect(result).toEqual([]);
  });
});
