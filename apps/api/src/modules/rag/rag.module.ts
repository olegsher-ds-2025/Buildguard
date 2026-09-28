import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { FinanceModule } from "../finance/finance.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { RagService } from "./rag.interface";
import { MockRagService } from "./mock-rag.service";

@Module({
  imports: [IdentityModule, FinanceModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    // The seam: swap this one binding for a real hybrid-retrieval + LLM
    // client when phase 3's RAG Assistant ships. Nothing else in this
    // module, or in any controller/frontend consuming ChatMessageSummary,
    // changes.
    { provide: RagService, useClass: MockRagService },
  ],
})
export class RagModule {}
