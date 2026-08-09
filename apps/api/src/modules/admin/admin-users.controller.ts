import { Controller, Get, UseGuards } from "@nestjs/common";
import type { ClientSummary, UserDirectoryEntry } from "@buildguard/shared-types";
import { AdminUsersService } from "./admin-users.service";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { StaffOnlyGuard } from "../identity/guards/staff-only.guard";

@Controller("admin")
@UseGuards(JwtAuthGuard, StaffOnlyGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get("users")
  listUsers(): Promise<UserDirectoryEntry[]> {
    return this.users.listUsers();
  }

  @Get("clients")
  listClients(): Promise<ClientSummary[]> {
    return this.users.listClients();
  }
}
