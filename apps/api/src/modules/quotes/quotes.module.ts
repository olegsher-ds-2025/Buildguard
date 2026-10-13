import Anthropic from "@anthropic-ai/sdk";
import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { IdentityModule } from "../identity/identity.module";
import { StorageModule } from "../storage/storage.module";
import { ClaudeQuoteAnalysisProvider } from "./claude-quote-analysis.provider";
import { MockQuoteAnalysisProvider, QuoteAnalysisProvider } from "./quote-analysis.provider";
import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";

// Reading quotes is a structured-extraction job, so the default is a mid-tier model; override per environment.
const DEFAULT_MODEL = "claude-sonnet-5-5";

@Module({
  imports: [IdentityModule, AuditModule, StorageModule],
  controllers: [QuotesController],
  providers: [
    QuotesService,
    // The seam: QUOTE_ANALYSIS_PROVIDER=claude reads quotes with Claude (needs ANTHROPIC_API_KEY or an `ant` login);
    // otherwise a deterministic mock stands in, so everything else works without a key.
    {
      provide: QuoteAnalysisProvider,
      useFactory: (): QuoteAnalysisProvider =>
        process.env.QUOTE_ANALYSIS_PROVIDER === "claude"
          ? new ClaudeQuoteAnalysisProvider(
              new Anthropic(),
              process.env.QUOTE_EXTRACTION_MODEL ?? DEFAULT_MODEL,
              process.env.QUOTE_COMPARISON_MODEL ?? DEFAULT_MODEL,
            )
          : new MockQuoteAnalysisProvider(),
    },
  ],
})
export class QuotesModule {}
