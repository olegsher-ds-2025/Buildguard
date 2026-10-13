import { IsString, IsUUID } from "class-validator";

export class CreateInspectionDto {
  // Not @IsUUID: seeded phase ids are deterministic `${projectId}-${n}` strings.
  @IsString()
  phaseId!: string;

  @IsUUID()
  templateId!: string;
}
