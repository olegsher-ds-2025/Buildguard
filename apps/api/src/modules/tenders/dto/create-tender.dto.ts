import { IsDateString, IsNumberString, IsOptional, IsString } from "class-validator";

export class CreateTenderDto {
  @IsString()
  workCategoryId!: string;

  @IsString()
  title!: string;

  @IsString()
  scopeDescription!: string;

  @IsNumberString()
  budgetMinMinor!: string;

  @IsNumberString()
  budgetMaxMinor!: string;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;
}
