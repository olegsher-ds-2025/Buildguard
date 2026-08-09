import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@buildguard/shared-types";

@Controller("health")
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: "ok",
      service: "buildguard-api",
      time: new Date().toISOString(),
    };
  }
}
