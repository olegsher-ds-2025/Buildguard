import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateSiteCaptureUploadDto {
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsOptional()
  @IsString()
  phaseId?: string;
}
