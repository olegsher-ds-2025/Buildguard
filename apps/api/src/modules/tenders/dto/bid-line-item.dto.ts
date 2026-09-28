import { IsNumber, IsNumberString, IsString } from "class-validator";

export class BidLineItemDto {
  @IsString()
  description!: string;

  @IsNumber()
  quantity!: number;

  @IsNumberString()
  unitAmountMinor!: string;

  @IsString()
  currency!: string;
}
