import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { IdentityModule } from "../identity/identity.module";
import { DailyLogsController } from "./daily-logs.controller";
import { DailyLogsService } from "./daily-logs.service";
import { NoWeatherProvider, OpenMeteoWeatherProvider, WeatherProvider } from "./weather.provider";

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [DailyLogsController],
  providers: [
    DailyLogsService,
    // The seam: WEATHER_PROVIDER=open-meteo turns on the automatic lookup; otherwise weather is entered by hand.
    { provide: WeatherProvider, useClass: process.env.WEATHER_PROVIDER === "open-meteo" ? OpenMeteoWeatherProvider : NoWeatherProvider },
  ],
  exports: [DailyLogsService],
})
export class DailyLogsModule {}
