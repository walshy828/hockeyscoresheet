import type { PenaltyCategory, PenaltyType, Rules } from './types.ts';

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

export interface PenaltyCategoryInfo { id: PenaltyCategory; label: string; minutes: number; /** leaves the team short-handed */ shorts: boolean }

export function penaltyCategories(rules: Rules): PenaltyCategoryInfo[] {
  return [
    { id: 'minor', label: 'Minor', minutes: rules.minorMinutes, shorts: true },
    { id: 'double', label: 'Double minor', minutes: rules.minorMinutes * 2, shorts: true },
    { id: 'major', label: 'Major', minutes: rules.majorMinutes, shorts: true },
    { id: 'misconduct', label: 'Misconduct', minutes: 10, shorts: false },
    { id: 'game', label: 'Game misc.', minutes: 10, shorts: false },
  ];
}

/** Default category for a penalty type's minutes/code. */
export function defaultCategory(t: PenaltyType, rules: Rules): PenaltyCategory {
  if (t.code === 'GMISC') return 'game';
  if (t.code === 'MISC') return 'misconduct';
  return t.minutes >= rules.majorMinutes ? 'major' : 'minor';
}
