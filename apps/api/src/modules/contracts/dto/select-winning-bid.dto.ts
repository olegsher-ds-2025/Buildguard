import { IsString } from "class-validator";

export class SelectWinningBidDto {
  @IsString()
  bidId!: string;
}
