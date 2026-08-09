import { IsOptional, IsString } from "class-validator";

export class RejectContractorDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
