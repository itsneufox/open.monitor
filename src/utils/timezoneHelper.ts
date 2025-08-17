export class TimezoneHelper {
  static parseGMTOffset(gmtString: string): number | null {
    const match = gmtString.match(/GMT([+-]?\d{1,2})/i);
    if (!match || !match[1]) return null;
    return parseInt(match[1], 10);
  }

  static validateGMT(gmtString: string): boolean {
    const offset = this.parseGMTOffset(gmtString);
    return offset !== null && offset >= -12 && offset <= 14;
  }

  static validateDayResetHour(hour: number): boolean {
    return hour >= 0 && hour <= 23;
  }

  static getServerTime(timezone: string): Date {
    const offset = this.parseGMTOffset(timezone);
    if (offset === null) return new Date();

    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + offset * 3600000);
  }

  static getCurrentDayPeriodStart(
    timezone: string,
    dayResetHour: number
  ): Date {
    const serverTime = this.getServerTime(timezone);
    const dayStart = new Date(serverTime);
    dayStart.setHours(dayResetHour, 0, 0, 0);

    if (serverTime.getHours() < dayResetHour) {
      dayStart.setDate(dayStart.getDate() - 1);
    }

    return dayStart;
  }

  static isNewDayPeriod(
    lastDayStart: number,
    timezone: string,
    dayResetHour: number
  ): boolean {
    const currentDayStart = this.getCurrentDayPeriodStart(
      timezone,
      dayResetHour
    );
    return currentDayStart.getTime() > lastDayStart;
  }

  static formatDayResetTime(hour: number): string {
    const timeStr = hour.toString().padStart(2, '0') + ':00';
    if (hour === 0) return '12:00 AM (Midnight)';
    if (hour === 12) return '12:00 PM (Noon)';
    if (hour < 12) return `${timeStr} AM`;
    return `${(hour - 12).toString().padStart(2, '0')}:00 PM`;
  }

  static getDayPeriodDescription(
    timezone: string,
    dayResetHour: number
  ): string {
    const resetTime = this.formatDayResetTime(dayResetHour);
    return `Day resets at ${resetTime} (${timezone})`;
  }
}
