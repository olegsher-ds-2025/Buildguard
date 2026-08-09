import { IsDateString, IsOptional, IsString } from "class-validator";

export class ApproveFindingDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
