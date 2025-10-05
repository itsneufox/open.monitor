/**
 * Timezone utility functions for chart generation
 */

// Common timezones with their IANA identifiers
export const COMMON_TIMEZONES = [
  { name: 'UTC', value: 'UTC' },
  { name: 'Eastern Time (US)', value: 'America/New_York' },
  { name: 'Central Time (US)', value: 'America/Chicago' },
  { name: 'Mountain Time (US)', value: 'America/Denver' },
  { name: 'Pacific Time (US)', value: 'America/Los_Angeles' },
  { name: 'London (GMT/BST)', value: 'Europe/London' },
  { name: 'Paris (CET/CEST)', value: 'Europe/Paris' },
  { name: 'Berlin (CET/CEST)', value: 'Europe/Berlin' },
  { name: 'Moscow (MSK)', value: 'Europe/Moscow' },
  { name: 'Tokyo (JST)', value: 'Asia/Tokyo' },
  { name: 'Sydney (AEST/AEDT)', value: 'Australia/Sydney' },
  { name: 'São Paulo (BRT)', value: 'America/Sao_Paulo' },
  { name: 'Mexico City (CST/CDT)', value: 'America/Mexico_City' },
  { name: 'Toronto (EST/EDT)', value: 'America/Toronto' },
  { name: 'Vancouver (PST/PDT)', value: 'America/Vancouver' },
  { name: 'Amsterdam (CET/CEST)', value: 'Europe/Amsterdam' },
  { name: 'Madrid (CET/CEST)', value: 'Europe/Madrid' },
  { name: 'Rome (CET/CEST)', value: 'Europe/Rome' },
  { name: 'Stockholm (CET/CEST)', value: 'Europe/Stockholm' },
  { name: 'Warsaw (CET/CEST)', value: 'Europe/Warsaw' },
  { name: 'Istanbul (TRT)', value: 'Europe/Istanbul' },
  { name: 'Dubai (GST)', value: 'Asia/Dubai' },
  { name: 'Mumbai (IST)', value: 'Asia/Kolkata' },
  { name: 'Singapore (SGT)', value: 'Asia/Singapore' },
  { name: 'Hong Kong (HKT)', value: 'Asia/Hong_Kong' },
  { name: 'Seoul (KST)', value: 'Asia/Seoul' },
  { name: 'Melbourne (AEST/AEDT)', value: 'Australia/Melbourne' },
  { name: 'Perth (AWST)', value: 'Australia/Perth' },
  { name: 'Auckland (NZST/NZDT)', value: 'Pacific/Auckland' },
] as const;

/**
 * Validates if a timezone identifier is valid
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    // Try to create a date with the timezone
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the current time in a specific timezone
 */
export function getCurrentTimeInTimezone(timezone: string): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
}

/**
 * Gets midnight in a specific timezone for a given date
 */
export function getMidnightInTimezone(
  timezone: string,
  date: Date = new Date()
): Date {
  // Get the date in the target timezone
  const year = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
  }).format(date);
  const month = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    month: '2-digit',
  }).format(date);
  const day = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    day: '2-digit',
  }).format(date);

  // Create midnight in that timezone
  const midnightString = `${year}-${month}-${day}T00:00:00`;

  // Parse as if it's in the target timezone
  const midnight = new Date(midnightString);

  // Adjust for timezone offset
  const offset = getTimezoneOffset(timezone, midnight);
  return new Date(midnight.getTime() - offset);
}

/**
 * Gets the timezone offset in milliseconds for a given timezone and date
 */
export function getTimezoneOffset(
  timezone: string,
  date: Date = new Date()
): number {
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return local.getTime() - utc.getTime();
}

/**
 * Converts a UTC timestamp to a timezone-specific midnight timestamp
 */
export function convertToTimezoneMidnight(
  utcTimestamp: number,
  timezone: string
): number {
  const date = new Date(utcTimestamp);
  return getMidnightInTimezone(timezone, date).getTime();
}

/**
 * Gets the next midnight in a specific timezone
 */
export function getNextMidnightInTimezone(timezone: string): Date {
  const now = new Date();
  const todayMidnight = getMidnightInTimezone(timezone, now);

  // If we're past today's midnight, get tomorrow's midnight
  if (now.getTime() >= todayMidnight.getTime()) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getMidnightInTimezone(timezone, tomorrow);
  }

  return todayMidnight;
}

/**
 * Calculates milliseconds until the next midnight in a specific timezone
 */
export function msUntilNextMidnightInTimezone(timezone: string): number {
  const nextMidnight = getNextMidnightInTimezone(timezone);
  return nextMidnight.getTime() - Date.now();
}

/**
 * Formats a timezone for display
 */
export function formatTimezone(timezone: string): string {
  try {
    const now = new Date();
    const offset = getTimezoneOffset(timezone, now);
    const offsetHours = Math.floor(Math.abs(offset) / (1000 * 60 * 60));
    const offsetMinutes = Math.floor(
      (Math.abs(offset) % (1000 * 60 * 60)) / (1000 * 60)
    );
    const sign = offset >= 0 ? '+' : '-';

    const timeString = now.toLocaleString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    return `${timezone} (UTC${sign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}) - ${timeString}`;
  } catch {
    return timezone;
  }
}
