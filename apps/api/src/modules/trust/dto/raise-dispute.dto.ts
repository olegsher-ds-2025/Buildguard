import { IsString } from "class-validator";

export class RaiseDisputeDto {
  @IsString()
  reason!: string;
}
