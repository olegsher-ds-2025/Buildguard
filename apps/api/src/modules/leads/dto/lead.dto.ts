import { Transform, Type } from "class-transformer";
import {
  Equals,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  LEAD_ROLE_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_TOPIC_LABELS,
  type LeadKind,
  type LeadStatus,
} from "@buildguard/shared-types";
import { IL_MOBILE_E164, IL_PHONE_E164, normalizeIsraeliPhone } from "../phone";

// No-JS form posts send every field, so an untouched optional input arrives as "".
const Trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() || undefined : value));
const Email = () =>
  Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() || undefined : value));
const Phone = () =>
  Transform(({ value }) =>
    typeof value === "string" ? (normalizeIsraeliPhone(value) ?? (value.trim() || undefined)) : value,
  );
// JSON sends a boolean; the no-JS form sends the string "true" or omits the field.
const Checkbox = () => Transform(({ value }) => value === true || value === "true");
const Int = () =>
  Transform(({ value }) => (typeof value === "string" ? (value.trim() ? Number(value) : undefined) : value));
const Host = () =>
  Transform(({ value }) => {
    if (typeof value !== "string" || !value) return undefined;
    try {
      return new URL(value).host || undefined;
    } catch {
      return undefined;
    }
  });

const LEAD_STATUSES = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];

class UtmDto {
  @IsOptional() @IsString() @MaxLength(120) source?: string;
  @IsOptional() @IsString() @MaxLength(120) medium?: string;
  @IsOptional() @IsString() @MaxLength(120) campaign?: string;
  @IsOptional() @IsString() @MaxLength(120) term?: string;
  @IsOptional() @IsString() @MaxLength(120) content?: string;
}

class LeadDto {
  @Trim() @IsNotEmpty() @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @Checkbox() @Equals(true) privacyConsent!: boolean;
  @Host() @IsOptional() @IsString() @MaxLength(255) referrer?: string;
  @IsOptional() @ValidateNested() @Type(() => UtmDto) utm?: UtmDto;
}

export class RegisterLeadDto extends LeadDto {
  @Phone() @IsNotEmpty() @Matches(IL_MOBILE_E164) phone!: string;
  @Email() @IsNotEmpty() @IsEmail() @MaxLength(254) email!: string;
  @Trim() @IsNotEmpty() @IsIn(Object.keys(LEAD_ROLE_LABELS)) role!: string;
  @Int() @IsOptional() @IsInt() @Min(0) @Max(1000) projectCount?: number;
  @Trim() @IsOptional() @IsIn(Object.keys(LEAD_STAGE_LABELS)) projectStage?: string;
  @Trim() @IsOptional() @IsString() @MaxLength(150) region?: string;
  @Trim() @IsOptional() @IsString() @MaxLength(150) company?: string;
  @Trim() @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @Checkbox() marketingOptIn?: boolean;
}

export class ContactLeadDto extends LeadDto {
  // Either one is enough; when both are missing, both report "required".
  @Phone()
  @ValidateIf((o: ContactLeadDto) => o.phone !== undefined || o.email === undefined)
  @IsNotEmpty()
  @Matches(IL_PHONE_E164)
  phone?: string;

  @Email()
  @ValidateIf((o: ContactLeadDto) => o.email !== undefined || o.phone === undefined)
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @Trim() @IsOptional() @IsIn(Object.keys(LEAD_TOPIC_LABELS)) topic?: string;
  @Trim() @IsNotEmpty() @IsString() @MinLength(10) @MaxLength(2000) message!: string;
}

export class ListLeadsQueryDto {
  @IsOptional() @IsIn(["register", "contact"]) kind?: LeadKind;
  @IsOptional() @IsIn(LEAD_STATUSES) status?: LeadStatus;
}

export class UpdateLeadDto {
  @IsOptional() @IsIn(LEAD_STATUSES) status?: LeadStatus;
  @IsOptional() @IsString() @MaxLength(2000) staffNotes?: string;
}
