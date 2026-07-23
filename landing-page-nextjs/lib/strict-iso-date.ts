const STRICT_ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2})))?$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isStrictIsoDate(value: string): boolean {
  const match = value.match(STRICT_ISO_DATE_TIME);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText,
    _fraction, zone, _sign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return false;

  if (hourText !== undefined) {
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    if (hour > 23 || minute > 59 || second > 59) return false;

    if (zone !== 'Z') {
      const offsetHour = Number(offsetHourText);
      const offsetMinute = Number(offsetMinuteText);
      if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
        return false;
      }
    }
  }

  return Number.isFinite(new Date(value).getTime());
}
