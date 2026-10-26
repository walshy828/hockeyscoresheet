import type { PenaltyType, Rules } from './types.ts';

export const PRESETS: Record<string, Rules> = {
  highschool: { preset: 'highschool', periods: 3, periodMinutes: 15, otMinutes: 5, otEnabled: true, shootout: false, runningClock: false, minorMinutes: 2, majorMinutes: 5, timeouts: 1, skatersOnIce: 5 },
  youth: { preset: 'youth', periods: 3, periodMinutes: 12, otMinutes: 5, otEnabled: true, shootout: false, runningClock: true, minorMinutes: 2, majorMinutes: 5, timeouts: 1, skatersOnIce: 5 },
  junior: { preset: 'junior', periods: 3, periodMinutes: 20, otMinutes: 5, otEnabled: true, shootout: true, runningClock: false, minorMinutes: 2, majorMinutes: 5, timeouts: 1, skatersOnIce: 5 },
  nhl: { preset: 'nhl', periods: 3, periodMinutes: 20, otMinutes: 5, otEnabled: true, shootout: true, runningClock: false, minorMinutes: 2, majorMinutes: 5, timeouts: 1, skatersOnIce: 5 },
};

export const PRESET_LABELS: Record<string, string> = {
  highschool: 'High School',
  youth: 'Youth',
  junior: 'Junior / Adult',
  nhl: 'NHL-style',
};

export const DEFAULT_PRESET = 'highschool';

export function periodName(n: number, rules: Rules): string {
  if (n <= rules.periods) return ['1st', '2nd', '3rd', '4th', '5th'][n - 1] ?? `P${n}`;
  return n === rules.periods + 1 ? 'OT' : `${n - rules.periods}OT`;
}

export function periodLength(n: number, rules: Rules): number {
  return (n <= rules.periods ? rules.periodMinutes : rules.otMinutes) * 60;
}

/** Seconds of game time elapsed at (period, remaining). Used for ice time & penalty clocks. */
export function elapsed(period: number, remaining: number, rules: Rules): number {
  let t = 0;
  for (let p = 1; p < period; p++) t += periodLength(p, rules);
  return t + (periodLength(period, rules) - remaining);
}

export function penaltyTypes(rules: Rules): PenaltyType[] {
  const mi = rules.minorMinutes;
  const ma = rules.majorMinutes;
  return [
    { code: 'TRIP', label: 'Tripping', minutes: mi },
    { code: 'HOOK', label: 'Hooking', minutes: mi },
    { code: 'SLASH', label: 'Slashing', minutes: mi },
    { code: 'HSTK', label: 'High-sticking', minutes: mi },
    { code: 'INTF', label: 'Interference', minutes: mi },
    { code: 'HOLD', label: 'Holding', minutes: mi },
    { code: 'ROUGH', label: 'Roughing', minutes: mi },
    { code: 'ELBOW', label: 'Elbowing', minutes: mi },
    { code: 'CROSS', label: 'Cross-checking', minutes: mi },
    { code: 'BOARD', label: 'Boarding', minutes: ma },
    { code: 'CHARG', label: 'Charging', minutes: ma },
    { code: 'FIGHT', label: 'Fighting', minutes: ma },
    { code: 'CTB', label: 'Contact to head', minutes: ma },
    { code: 'DOG', label: 'Delay of game', minutes: mi },
    { code: 'TMM', label: 'Too many men', minutes: mi },
    { code: 'UNSP', label: 'Unsportsmanlike', minutes: mi },
    { code: 'MISC', label: 'Misconduct', minutes: 10 },
    { code: 'GMISC', label: 'Game misconduct', minutes: 10 },
  ];
}
