import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export const SIGNER_CAPACITIES = ["engineer", "soil_consultant", "inspector", "lab", "other"] as const;

export class SignHoldPointDto {
  @IsString() @MinLength(2) @MaxLength(200) signerName!: string;
  @IsIn(SIGNER_CAPACITIES) signerCapacity!: (typeof SIGNER_CAPACITIES)[number];
  @IsOptional() @IsUUID() photoId?: string;
  @IsOptional() @IsString() documentId?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class BypassHoldPointDto {
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class ReopenHoldPointDto {
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class InstantiateHoldPointsDto {
  @IsUUID() templateId!: string;
}
