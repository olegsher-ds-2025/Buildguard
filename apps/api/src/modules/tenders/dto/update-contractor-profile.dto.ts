import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateContractorProfileDto {
  @IsOptional()
  @IsBoolean()
  currentlyAvailable?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];
}
