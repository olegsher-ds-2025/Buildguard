import { Injectable } from "@nestjs/common";
import { FinancialTransparencyProvider } from "./financial-transparency.interface";

/** Constant placeholder — see financial-transparency.interface.ts. */
const FINANCIAL_TRANSPARENCY_PLACEHOLDER = 0.6;

@Injectable()
export class DefaultFinancialTransparencyProvider extends FinancialTransparencyProvider {
  async scoreFor(_contractorProfileId: string): Promise<number> {
    return FINANCIAL_TRANSPARENCY_PLACEHOLDER;
  }
}
