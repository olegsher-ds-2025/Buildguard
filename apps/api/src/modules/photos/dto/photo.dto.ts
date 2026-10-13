import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_TAGS = ["defect", "inspection", "approval", "before_cover", "after"] as const;

export class CreatePhotoUploadDto {
  @IsIn(PHOTO_CONTENT_TYPES)
  contentType!: string;
}

class MarkupShapeDto {
  @IsIn(["arrow", "circle", "text"])
  type!: "arrow" | "circle" | "text";

  @IsOptional() @IsNumber() @Min(0) @Max(1) x?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) y?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) x1?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) y1?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) x2?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) y2?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) r?: number;
  @IsOptional() @IsString() text?: string;
}

export class ConfirmPhotoUploadDto {
  @IsIn(PHOTO_TAGS)
  tag!: (typeof PHOTO_TAGS)[number];

  // Not @IsUUID: seeded phase ids are deterministic `${projectId}-${n}` strings.
  @IsOptional() @IsString() phaseId?: string;
  @IsOptional() @IsUUID() inspectionId?: string;
  @IsOptional() @IsUUID() checklistItemId?: string;
  @IsOptional() @IsUUID() defectId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkupShapeDto)
  markup?: MarkupShapeDto[];

  @IsOptional() @IsNumber() @Min(-90) @Max(90) gpsLat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) gpsLng?: number;
  @IsOptional() @IsDateString() takenAt?: string;
}
