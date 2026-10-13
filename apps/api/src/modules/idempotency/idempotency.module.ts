import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { IdempotencyCleanup } from "./idempotency.cleanup";
import { IdempotencyInterceptor } from "./idempotency.interceptor";

@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }, IdempotencyCleanup],
})
export class IdempotencyModule {}
