import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class AssignDefectDto {
  @IsUUID()
  assigneeUserId!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class DefectActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
