import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import type { LoginResponse, MeResponse } from "@buildguard/shared-types";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { JwtPayload } from "./jwt-payload";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("customer/login")
  loginCustomer(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.auth.login(dto.email, dto.password, "monitor");
  }

  @Post("staff/login")
  loginStaff(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.auth.login(dto.email, dto.password, "admin");
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload): Promise<MeResponse> {
    return this.auth.me(user.sub);
  }
}
