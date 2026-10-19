import { CronExpressionParser } from 'cron-parser';

export class TimezoneScheduler {
  /**
   * Validates whether a given timezone string is a valid IANA timezone.
   */
  static isValidTimezone(timezone: string): boolean {
    if (!timezone || typeof timezone !== 'string') return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validates a 5-field cron expression.
   */
  static isValidCronExpression(cronExpression: string, timezone: string = 'UTC'): boolean {
    if (!cronExpression || typeof cronExpression !== 'string') return false;
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    try {
      CronExpressionParser.parse(cronExpression.trim(), {
        tz: this.isValidTimezone(timezone) ? timezone : 'UTC',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Computes the next occurrence timestamp (ISO string) for a given cron expression and timezone.
   * Accurately handles DST spring-forward (gap) and fall-back (overlap) transitions.
   */
  static getNextRun(
    cronExpression: string,
    timezone: string = 'UTC',
    currentDate?: Date | string
  ): string {
    const tz = this.isValidTimezone(timezone) ? timezone : 'UTC';
    const refDate = currentDate ? new Date(currentDate) : new Date();

    if (isNaN(refDate.getTime())) {
      throw new Error(`Invalid reference date: ${currentDate}`);
    }

    try {
      const interval = CronExpressionParser.parse(cronExpression.trim(), {
        currentDate: refDate,
        tz,
      });
      const nextDate = interval.next().toDate();
      return nextDate.toISOString();
    } catch (err: any) {
      throw new Error(`Failed to calculate next run for cron '${cronExpression}' in tz '${timezone}': ${err.message}`);
    }
  }

  /**
   * Computes the next N occurrences for preview and schedule planning.
   */
  static getNextRuns(
    cronExpression: string,
    timezone: string = 'UTC',
    count: number = 5,
    currentDate?: Date | string
  ): string[] {
    const tz = this.isValidTimezone(timezone) ? timezone : 'UTC';
    const refDate = currentDate ? new Date(currentDate) : new Date();

    const interval = CronExpressionParser.parse(cronExpression.trim(), {
      currentDate: refDate,
      tz,
    });

    const runs: string[] = [];
    for (let i = 0; i < count; i++) {
      runs.push(interval.next().toDate().toISOString());
    }
    return runs;
  }
}
