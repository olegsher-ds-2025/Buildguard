import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";

const SPAM_DAYS = 7;
const CONTACT_MONTHS = 12;
const UNCONVERTED_REGISTER_MONTHS = 24;

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const monthsAgo = (now: Date, months: number) => {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
};

/** Periods pending legal review; converted registrations are customers now and are kept. */
@Injectable()
export class LeadsRetention {
  private readonly logger = new Logger(LeadsRetention.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purge(now = new Date()): Promise<number> {
    const { count } = await this.prisma.lead.deleteMany({
      where: {
        OR: [
          // updatedAt, not createdAt: the clock starts when staff mark it as spam.
          { status: "spam", updatedAt: { lt: daysAgo(now, SPAM_DAYS) } },
          { kind: "contact", createdAt: { lt: monthsAgo(now, CONTACT_MONTHS) } },
          { kind: "register", status: { not: "converted" }, createdAt: { lt: monthsAgo(now, UNCONVERTED_REGISTER_MONTHS) } },
        ],
      },
    });
    if (count > 0) this.logger.log(`Purged ${count} leads past retention`);
    return count;
  }
}
