import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";

class HeadcountEntryDto {
  @IsString() @MaxLength(200) name!: string;
  @IsInt() @Min(0) @Max(10000) workers!: number;
}

export class SaveDailyLogDto {
  @IsOptional() @IsInt() @Min(0) @Max(99) weatherCode?: number | null;
  @IsOptional() @IsNumber() @Min(-50) @Max(70) temperatureC?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeadcountEntryDto)
  headcount?: HeadcountEntryDto[];

  @IsOptional() @IsString() @MaxLength(10000) workDone?: string;
  @IsOptional() @IsBoolean() safetyOk?: boolean | null;
  @IsOptional() @IsString() @MaxLength(5000) safetyNotes?: string | null;
}

export class CreateDailyLogDto extends SaveDailyLogDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "logDate must be YYYY-MM-DD" })
  logDate!: string;
}
