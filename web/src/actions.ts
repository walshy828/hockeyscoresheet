import { useMemo, useRef } from 'react';
import type { ClockData, EditData, Game, GameEvent, GoalData, PenaltyData, Side, ShotData, FaceoffData, EventType } from '../../shared/src/types.ts';
import { clockAt, strengthNow, type Derived } from '../../shared/src/derive.ts';
import { periodLength, periodName } from '../../shared/src/rules.ts';
import { addEvent, db, deviceId } from './db.ts';
import { uid } from './ids.ts';
import { pLabel, sideName } from './describe.ts';
import { toast } from './components/ui.tsx';

export interface Actions {
  emit: (type: EventType, data: Record<string, any>, over?: { period?: number; clock?: number }) => Promise<GameEvent>;
  clockNow: () => { period: number; running: boolean; remaining: number };
  toggleClock: () => Promise<void>;
  adjustClock: (deltaSec: number) => Promise<void>;
  setClock: (remaining: number, period?: number, running?: boolean) => Promise<void>;
  nextPeriod: () => Promise<void>;
  goal: (x: Omit<GoalData, 'strength'> & { strength?: GoalData['strength'] }) => Promise<void>;
  shot: (x: ShotData) => Promise<void>;
  faceoff: (x: FaceoffData) => Promise<void>;
  penalty: (x: PenaltyData) => Promise<void>;
  timeout: (team: Side) => Promise<void>;
  note: (text: string, audioId?: string) => Promise<void>;
  shift: (team: Side, player: string, action: 'on' | 'off') => Promise<void>;
  allOff: (team: Side) => Promise<void>;
  /** put a goalie in net (null = pull the goalie / empty net) */
  goalie: (team: Side, player: string | null) => Promise<void>;
  /** several on/off changes at once (a line change); undone together */
  lineChange: (team: Side, off: string[], on: string[], label?: string) => Promise<void>;
  voidEvent: (id: string) => Promise<void>;
  undoLast: () => Promise<void>;
  edit: (target: string, patch: Record<string, any>, period?: number, clock?: number) => Promise<void>;
  byNumber: (side: Side, num?: string) => string | undefined;
  lastTeam: React.RefObject<Side>;
}

export function useActions(game: Game, events: GameEvent[], d: Derived): Actions {
  const evRef = useRef(events); evRef.current = events;
  const dRef = useRef(d); dRef.current = d;
  const gRef = useRef(game); gRef.current = game;
  const lastTeam = useRef<Side>('home');

  return useMemo<Actions>(() => {
    const clockNow = () => {
      const g = gRef.current;
      const c = clockAt(evRef.current.filter((e) => e.type === 'clock'), Date.now());
      return { period: c.period, running: c.running, remaining: Number.isFinite(c.remaining) ? c.remaining : periodLength(1, g.rules) };
    };
    const emit: Actions['emit'] = async (type, data, over) => {
      const c = clockNow();
      const e: GameEvent = {
        id: uid(), gameId: gRef.current.id, deviceId: await deviceId(), type,
        period: over?.period ?? c.period, clock: over?.clock ?? Math.ceil(c.remaining), wall: Date.now(), data,
      };
      await addEvent(e);
      return e;
    };
    const clockEvt = async (remaining: number, period: number, running: boolean) => {
      const len = periodLength(period, gRef.current.rules);
      const r = Math.max(0, Math.min(len, Math.round(remaining * 10) / 10));
      const data: ClockData = { running: running && r > 0, remaining: r, period };
      await emit('clock', data, { period, clock: Math.ceil(r) });
    };
    const withUndo = (label: string, e: GameEvent) => toast(label, { label: 'Undo', fn: () => void voidEvent(e.id) });
    const voidEvent = async (id: string) => { await emit('void', { target: id }); };
    const nm = (s: Side) => sideName(gRef.current, s);

    const a: Actions = {
      emit, clockNow, lastTeam,
      toggleClock: async () => {
        const c = clockNow();
        if (!c.running && c.remaining <= 0) return;
        await clockEvt(c.remaining, c.period, !c.running);
        if (gRef.current.status === 'scheduled') await db.games.update(gRef.current.id, { status: 'live', updated: Date.now(), dirty: 1 });
      },
      adjustClock: async (delta) => { const c = clockNow(); await clockEvt(c.remaining + delta, c.period, c.running); },
      setClock: async (remaining, period, running) => { const c = clockNow(); await clockEvt(remaining, period ?? c.period, running ?? false); },
      nextPeriod: async () => {
        const c = clockNow();
        const n = c.period + 1;
        await clockEvt(periodLength(n, gRef.current.rules), n, false);
        toast(`${periodName(n, gRef.current.rules)} ready`);
      },
      goal: async (x) => {
        const strength = x.strength ?? strengthNow(dRef.current, x.team);
        lastTeam.current = x.team;
        const e = await emit('goal', { ...x, strength, assists: x.assists.filter(Boolean) });
        withUndo(`GOAL ${nm(x.team)} ${x.scorer ? pLabel(gRef.current, x.scorer, true) : ''} (${strength})`, e);
      },
      shot: async (x) => {
        lastTeam.current = x.team;
        const e = await emit('shot', x);
        withUndo(`${x.result === 'save' ? 'Shot' : x.result === 'miss' ? 'Miss' : 'Block'} ${nm(x.team)} ${x.player ? pLabel(gRef.current, x.player, true) : ''}`, e);
      },
      faceoff: async (x) => {
        lastTeam.current = x.team;
        const e = await emit('faceoff', x);
        withUndo(`Faceoff won ${nm(x.team)}`, e);
      },
      penalty: async (x) => {
        lastTeam.current = x.team;
        const e = await emit('penalty', x);
        withUndo(`${nm(x.team)} ${x.label} ${x.minutes}min`, e);
      },
      timeout: async (team) => { const e = await emit('timeout', { team }); withUndo(`Timeout ${nm(team)}`, e); },
      note: async (text, audioId) => { const e = await emit('note', { text, audioId }); withUndo('Note saved', e); },
      shift: async (team, player, action) => { await emit('shift', { team, player, action }); },
      allOff: async (team) => { await a.lineChange(team, [...dRef.current.onIce[team]], [], 'All off'); },
      goalie: async (team, player) => {
        const e = await emit('goalie', { team, player });
        withUndo(player ? `${nm(team)} goalie ${pLabel(gRef.current, player, true)}` : `${nm(team)} goalie pulled`, e);
      },
      lineChange: async (team, off, on, label) => {
        const grp = uid();
        const made: GameEvent[] = [];
        for (const p of off) made.push(await emit('shift', { team, player: p, action: 'off', grp }));
        for (const p of on) made.push(await emit('shift', { team, player: p, action: 'on', grp }));
        if (label && made.length) toast(`${nm(team)} ${label}`, { label: 'Undo', fn: () => void Promise.all(made.map((e) => voidEvent(e.id))) });
      },
      voidEvent,
      undoLast: async () => {
        const cand = dRef.current.events.filter((e) => e.type !== 'clock').sort((x, y) => y.wall - x.wall)[0];
        if (!cand) { toast('Nothing to undo'); return; }
        const grp = cand.data.grp;
        for (const e of grp ? dRef.current.events.filter((x) => x.data.grp === grp) : [cand]) await voidEvent(e.id);
        toast(`Undid: ${cand.type}`);
      },
      edit: async (target, patch, period, clock) => {
        const data: EditData = { target, patch };
        if (period !== undefined) data.period = period;
        if (clock !== undefined) data.clock = clock;
        await emit('edit', data);
      },
      byNumber: (side, num) => (num ? gRef.current[side].players.find((p) => p.number === String(Number(num)) || p.number === num)?.id : undefined),
    };
    return a;
  }, []);
}
