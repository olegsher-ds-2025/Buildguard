import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsNumber, ValidateNested } from "class-validator";

class PointDto {
  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}

export class CreateMeasurementDto {
  @IsIn(["length", "area"])
  kind!: "length" | "area";

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => PointDto)
  points!: PointDto[];
}
