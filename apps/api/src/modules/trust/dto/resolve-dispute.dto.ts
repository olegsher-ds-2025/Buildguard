import { IsBoolean, IsOptional, IsString } from "class-validator";

export class ResolveDisputeDto {
  @IsBoolean()
  upheld!: boolean;

  @IsOptional()
  @IsString()
  resolutionNote?: string;
}
