import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { NotificationSummary } from "@buildguard/shared-types";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { JwtPayload } from "../identity/jwt-payload";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("unread") unread?: string): Promise<NotificationSummary[]> {
    return this.notifications.list(user.sub, unread === "true");
  }

  @Post("read-all")
  @HttpCode(204)
  markAllRead(@CurrentUser() user: JwtPayload): Promise<void> {
    return this.notifications.markAllRead(user.sub);
  }

  @Post(":notificationId/read")
  @HttpCode(204)
  markRead(@Param("notificationId") notificationId: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.notifications.markRead(user.sub, notificationId);
  }
}
