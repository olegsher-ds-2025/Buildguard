import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class SaveForm4ItemDto {
  @IsBoolean() satisfied!: boolean;
  // Not @IsUUID: seeded document ids are deterministic strings.
  @IsOptional() @IsString() documentId?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
