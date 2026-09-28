import { Type } from "class-transformer";
import { IsArray, IsDateString, IsNumberString, IsOptional, IsString, ValidateNested } from "class-validator";
import { BidLineItemDto } from "./bid-line-item.dto";

export class SubmitBidDto {
  @IsNumberString()
  totalAmountMinor!: string;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsDateString()
  proposedStartDate?: string;

  @IsOptional()
  @IsDateString()
  proposedEndDate?: string;

  @IsString()
  paymentTermsDescription!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BidLineItemDto)
  lineItems?: BidLineItemDto[];
}
