import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { CreateQuoteUploadResponse, QuoteComparisonSummary } from "@buildguard/shared-types";
import { QuotesService } from "./quotes.service";
import { ConfirmQuoteUploadDto, CreateQuoteComparisonDto, CreateQuoteUploadDto } from "./dto/quotes.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { Roles } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

// Quotes are commercial terms, so this is for the people who negotiate them: owner and project manager.
@Controller("projects/:projectId/quote-comparisons")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Roles("owner", "project_manager")
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  list(@Param("projectId") projectId: string): Promise<QuoteComparisonSummary[]> {
    return this.quotes.list(projectId);
  }

  @Get(":comparisonId")
  get(@Param("projectId") projectId: string, @Param("comparisonId") comparisonId: string): Promise<QuoteComparisonSummary> {
    return this.quotes.get(projectId, comparisonId);
  }

  @Post()
  create(@Param("projectId") projectId: string, @Body() dto: CreateQuoteComparisonDto, @CurrentUser() user: JwtPayload): Promise<QuoteComparisonSummary> {
    return this.quotes.create(projectId, dto, user.sub);
  }

  @Post(":comparisonId/quotes/upload")
  createUpload(
    @Param("projectId") projectId: string,
    @Param("comparisonId") comparisonId: string,
    @Body() dto: CreateQuoteUploadDto,
  ): Promise<CreateQuoteUploadResponse> {
    return this.quotes.createUpload(projectId, comparisonId, dto);
  }

  @Post(":comparisonId/quotes/:quoteId/confirm")
  confirmUpload(
    @Param("projectId") projectId: string,
    @Param("comparisonId") comparisonId: string,
    @Param("quoteId") quoteId: string,
    @Body() dto: ConfirmQuoteUploadDto,
  ): Promise<QuoteComparisonSummary> {
    return this.quotes.confirmUpload(projectId, comparisonId, quoteId, dto);
  }

  @Post(":comparisonId/analyze")
  analyze(@Param("projectId") projectId: string, @Param("comparisonId") comparisonId: string, @CurrentUser() user: JwtPayload): Promise<QuoteComparisonSummary> {
    return this.quotes.analyze(projectId, comparisonId, user.sub);
  }
}
