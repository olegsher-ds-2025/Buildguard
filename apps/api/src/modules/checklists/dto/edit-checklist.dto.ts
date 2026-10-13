import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

const PHASE_KINDS = ["before", "during", "after", "general"] as const;
const ITEM_TYPES = ["visual", "measurement", "lab_test", "document", "written_approval"] as const;

export class ThresholdDto {
  @IsIn(["≥", "≤", "<", ">"])
  op!: "≥" | "≤" | "<" | ">";

  @IsNumber()
  value!: number;

  @IsOptional()
  @IsNumber()
  upperValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  raw?: string;
}

export class UpdateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
}

export class CreateItemDto {
  @IsString() @MinLength(1) @MaxLength(2000) text!: string;
  @IsOptional() @IsString() @MaxLength(200) subStage?: string;
  @IsOptional() @IsString() @MaxLength(200) section?: string;
  @IsIn(PHASE_KINDS) phaseKind!: (typeof PHASE_KINDS)[number];
  @IsIn(ITEM_TYPES) itemType!: (typeof ITEM_TYPES)[number];
  @IsOptional() @IsString() @MaxLength(100) standardRef?: string;
  @IsOptional() @IsBoolean() mandatory?: boolean;
  @IsOptional() @IsBoolean() requiresBeforeCoverPhoto?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ThresholdDto)
  thresholds?: ThresholdDto[];

  @IsOptional() @IsBoolean() thresholdsReviewed?: boolean;

  // Insert after this item; appended at the end when omitted.
  @IsOptional() @IsUUID() afterItemId?: string;
}

export class UpdateItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(2000) text?: string;
  @IsOptional() @IsString() @MaxLength(200) subStage?: string;
  @IsOptional() @IsString() @MaxLength(200) section?: string;
  @IsOptional() @IsIn(PHASE_KINDS) phaseKind?: (typeof PHASE_KINDS)[number];
  @IsOptional() @IsIn(ITEM_TYPES) itemType?: (typeof ITEM_TYPES)[number];
  @IsOptional() @IsString() @MaxLength(100) standardRef?: string;
  @IsOptional() @IsBoolean() mandatory?: boolean;
  @IsOptional() @IsBoolean() requiresBeforeCoverPhoto?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ThresholdDto)
  thresholds?: ThresholdDto[];

  @IsOptional() @IsBoolean() thresholdsReviewed?: boolean;
}

export class MoveItemDto {
  @IsIn(["up", "down"])
  direction!: "up" | "down";
}

export class HoldPointDto {
  @IsString() @MinLength(1) @MaxLength(2000) text!: string;
  @IsOptional() @IsString() @MaxLength(200) subStage?: string;
}
