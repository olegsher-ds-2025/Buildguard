import { Injectable } from "@nestjs/common";
import { ExecutionQualityProvider } from "./execution-quality.interface";

/** Constant placeholder — see execution-quality.interface.ts. */
const EXECUTION_QUALITY_PLACEHOLDER = 0.6;

@Injectable()
export class DefaultExecutionQualityProvider extends ExecutionQualityProvider {
  async scoreFor(_contractorProfileId: string): Promise<number> {
    return EXECUTION_QUALITY_PLACEHOLDER;
  }
}
