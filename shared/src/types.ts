import type { Lines } from './lines.ts';
export type Side = 'home' | 'away';
export type Position = 'C' | 'LW' | 'RW' | 'D' | 'G' | 'F';
export type Strength = 'EV' | 'PP' | 'SH' | 'EN' | 'PS';

export interface Player {
  id: string;
  number: string; // string so "00" and "7" differ
  name: string;
  pos: Position;
  captain?: 'C' | 'A';
  scratched?: boolean;
}

export interface Roster {
  teamId?: string;
  name: string;
  color: string;
  players: Player[];
}

export interface PenaltyType {
  code: string;
  label: string;
  minutes: number;
}

export interface Rules {
  preset: string;
  periods: number;
  periodMinutes: number;
  otMinutes: number;
  otEnabled: boolean;
  shootout: boolean;
  runningClock: boolean; // informational: stop time vs running clock
  minorMinutes: number;
  majorMinutes: number;
  timeouts: number;
  skatersOnIce: number; // 5 (+G)
}

/** Team library entry (reusable between games). */
export interface Team {
  id: string;
  name: string;
  color: string;
  players: Player[];
  updated: number;
  deleted?: boolean;
}

export interface Game {
  id: string;
  viewToken: string;
  date: string; // ISO date + time (local) e.g. 2026-10-26T19:00
  venue: string;
  level: string;
  officials: string;
  scorekeeper: string;
  rules: Rules;
  home: Roster;
  away: Roster;
  /** the side being scored for; drives offense/defense on the rink. Defaults to home. */
  myTeam?: Side;
  /** saved forward/defense/PP/PK line combinations per side */
  lines?: Lines;
  status: 'scheduled' | 'live' | 'final';
  notes: string;
  created: number;
  updated: number;
  deleted?: boolean;
}

export type EventType =
  | 'clock'
  | 'goal'
  | 'shot'
  | 'faceoff'
  | 'penalty'
  | 'shift'
  | 'goalie'
  | 'timeout'
  | 'note'
  | 'void'
  | 'edit';

export interface GameEvent {
  id: string; // uuid, client-generated => idempotent sync
  gameId: string;
  deviceId: string;
  type: EventType;
  period: number;
  clock: number; // seconds remaining in period when it happened
  wall: number; // ms, scorer device clock
  recv?: number; // ms, server receive time (viewer only)
  data: Record<string, any>;
}

/* Typed payloads (documentation / helpers) */
export interface ClockData { running: boolean; remaining: number; period: number }
export interface GoalData { team: Side; scorer?: string; assists: string[]; strength: Strength; x?: number; y?: number }
/** `blocker` is the defending player who blocked it; `strength` is the shooting team's strength when taken. */
export interface ShotData { team: Side; player?: string; result: 'save' | 'miss' | 'block'; blocker?: string; strength?: Strength; x?: number; y?: number }
/** `team` is the winning side; `player`/`loser` are the winner's and loser's player ids (either may be unknown). `dot` is a FACEOFF_DOTS id. */
export interface FaceoffData { team: Side; player?: string; loser?: string; dot?: string; x?: number; y?: number }
export type PenaltyCategory = 'minor' | 'double' | 'major' | 'misconduct' | 'game';
/** `noPP` = the team is not left short-handed (misconducts); absent means it does. */
export interface PenaltyData { team: Side; player?: string; code: string; label: string; minutes: number; servedBy?: string; category?: PenaltyCategory; noPP?: boolean }
export interface ShiftData { team: Side; player: string; action: 'on' | 'off' }
export interface TimeoutData { team: Side }
export interface NoteData { text: string; audioId?: string }
export interface VoidData { target: string }
export interface EditData { target: string; patch: Record<string, any>; period?: number; clock?: number }
/** Goalie in net changed. `player: null` = net empty (goalie pulled). */
export interface GoalieData { team: Side; player: string | null }
