import type { AuthRealm, StaffRole, UserType } from "@buildguard/shared-types";

/** Shape of our JWT payload. `aud` is the realm — this is what StaffOnlyGuard checks. */
export interface JwtPayload {
  sub: string;
  userType: UserType;
  aud: AuthRealm;
  staffRole?: StaffRole;
}
