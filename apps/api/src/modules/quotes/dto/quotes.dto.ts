import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export const QUOTE_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export class CreateQuoteComparisonDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsInt() @Min(1) @Max(15) stageNo?: number;
}

export class CreateQuoteUploadDto {
  @IsString() @MinLength(1) @MaxLength(200) filename!: string;
  @IsIn(QUOTE_CONTENT_TYPES) contentType!: string;
}

export class ConfirmQuoteUploadDto {
  @IsString() @MinLength(1) @MaxLength(200) filename!: string;
  @IsIn(QUOTE_CONTENT_TYPES) contentType!: string;
  @IsOptional() @IsString() @MaxLength(200) supplierName?: string;
}
