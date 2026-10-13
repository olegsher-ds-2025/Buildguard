import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class RecordResultDto {
  @IsUUID()
  checklistItemId!: string;

  @IsIn(["ok", "fail", "na"])
  outcome!: "ok" | "fail" | "na";

  @IsOptional()
  @IsNumber()
  numericValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  severity?: number;
}
