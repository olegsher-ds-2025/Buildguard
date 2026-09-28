import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { CreateReviewRequest, ReviewSummary } from "@buildguard/shared-types";
import { ReviewsService } from "./reviews.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { ProjectRoleGuard } from "../identity/guards/project-role.guard";
import { Roles } from "../identity/decorators/roles.decorator";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("projects/:projectId/reviews")
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Param("projectId") projectId: string): Promise<ReviewSummary[]> {
    return this.reviews.listForProject(projectId);
  }

  @Post()
  @Roles("owner", "project_manager")
  create(
    @Param("projectId") projectId: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ReviewSummary> {
    return this.reviews.create(projectId, dto as CreateReviewRequest, user.sub);
  }
}
