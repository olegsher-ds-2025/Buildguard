import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateConcretePourDto {
  @IsString() @MinLength(1) @MaxLength(200) element!: string;
  @IsString() @MinLength(1) @MaxLength(50) concreteGrade!: string;
  @IsOptional() @IsNumber() @Min(1) @Max(200) requiredMpa28?: number;
  @IsOptional() @IsString() @MaxLength(200) deliveryNote?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) slumpCm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) spanMeters?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) cantileverMeters?: number;
  @IsDateString() castAt!: string;
  // Not @IsUUID: seeded phase ids are deterministic `${projectId}-${n}` strings.
  @IsOptional() @IsString() phaseId?: string;
}

export class RecordConcreteResultDto {
  @IsIn([7, 28]) ageDays!: 7 | 28;
  @IsNumber() @Min(0) @Max(200) strengthMpa!: number;
  @IsOptional() @IsDateString() testedAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class StartTimedTestDto {
  @IsIn(["pressure", "flood"]) kind!: "pressure" | "flood";
  @IsString() @MinLength(1) @MaxLength(200) location!: string;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsInt() @Min(1) @Max(240) durationHours?: number;
  @IsOptional() @IsNumber() startReading?: number;
  @IsOptional() @IsString() phaseId?: string;
  @IsOptional() @IsUUID() startPhotoId?: string;
}

export class CompleteTimedTestDto {
  @IsIn(["passed", "failed"]) outcome!: "passed" | "failed";
  @IsOptional() @IsNumber() endReading?: number;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @IsUUID() endPhotoId?: string;
}

