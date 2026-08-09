import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import type { AuthRealm, LoginResponse, MeResponse } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import type { JwtPayload } from "./jwt-payload";

// Single access token, no refresh-token rotation yet — a deliberate M1
// simplification (see build plan). 12h balances "long enough that a working
// demo doesn't get logged out mid-session" against "still expires."
const ACCESS_TOKEN_TTL = "12h";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string, realm: AuthRealm): Promise<LoginResponse> {
    const expectedUserType = realm === "admin" ? "staff" : "customer";

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { staffProfile: true },
    });

    if (!user || user.userType !== expectedUserType) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordOk = await argon2.verify(user.passwordHash, password);
    if (!passwordOk) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const payload: JwtPayload = {
      sub: user.id,
      userType: user.userType,
      aud: realm,
      ...(user.staffProfile ? { staffRole: user.staffProfile.staffRole } : {}),
    };

    // `aud` is already set on the payload; passing `audience` here too is
    // rejected by jsonwebtoken as a conflicting duplicate option.
    const accessToken = this.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });

    return {
      accessToken,
      user: this.toMeResponse(user, user.staffProfile?.staffRole),
    };
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { staffProfile: true },
    });
    return this.toMeResponse(user, user.staffProfile?.staffRole);
  }

  private toMeResponse(
    user: { id: string; email: string; displayName: string; userType: "customer" | "staff" },
    staffRole?: string,
  ): MeResponse {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      userType: user.userType,
      ...(staffRole ? { staffRole: staffRole as MeResponse["staffRole"] } : {}),
    };
  }
}
