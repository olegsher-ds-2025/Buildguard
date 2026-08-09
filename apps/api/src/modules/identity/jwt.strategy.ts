import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { JwtPayload } from "./jwt-payload";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  // Whatever this returns becomes request.user. We deliberately return the
  // raw payload rather than re-fetching the user here — guards only need
  // sub/userType/aud/staffRole, and endpoints that need the full row look it
  // up themselves via PrismaService using payload.sub.
  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
