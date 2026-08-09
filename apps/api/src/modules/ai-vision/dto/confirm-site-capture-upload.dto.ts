import { IsOptional, IsString } from "class-validator";

export class ConfirmSiteCaptureUploadDto {
  @IsOptional()
  @IsString()
  phaseId?: string;
}
