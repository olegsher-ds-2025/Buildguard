import { Injectable, Logger } from "@nestjs/common";

export interface Weather {
  weatherCode: number;
  temperatureC: number;
}

/** The seam for the automatic weather lookup; swap the binding to change source. */
export abstract class WeatherProvider {
  /** Null when no weather is available (no coordinates, provider off, or lookup failed). */
  abstract getWeather(latitude: number, longitude: number, date: string): Promise<Weather | null>;
}

@Injectable()
export class NoWeatherProvider extends WeatherProvider {
  async getWeather(): Promise<Weather | null> {
    return null;
  }
}

/** Open-Meteo (no API key). Enabled with WEATHER_PROVIDER=open-meteo. */
@Injectable()
export class OpenMeteoWeatherProvider extends WeatherProvider {
  private readonly logger = new Logger(OpenMeteoWeatherProvider.name);

  async getWeather(latitude: number, longitude: number, date: string): Promise<Weather | null> {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&daily=weather_code,temperature_2m_max&timezone=Asia%2FJerusalem&start_date=${date}&end_date=${date}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { daily?: { weather_code?: number[]; temperature_2m_max?: number[] } };
      const code = body.daily?.weather_code?.[0];
      const temp = body.daily?.temperature_2m_max?.[0];
      return code === undefined || temp === undefined ? null : { weatherCode: code, temperatureC: temp };
    } catch (err) {
      this.logger.warn(`weather lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
