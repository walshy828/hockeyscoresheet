import { useMemo, useState } from 'react';
import type { GameEvent, PenaltyCategory, Side, Strength } from '../../../shared/src/types.ts';
import { fmtClock, fmtToi, activePenalties, strengthNow } from '../../../shared/src/derive.ts';
import { defaultCategory, penaltyCategories, penaltyTypes, periodName } from '../../../shared/src/rules.ts';
import { STRENGTH_INFO } from '../../../shared/src/rink.ts';
import { useGame } from '../ctx.ts';
import { ClockDisplay, useClock } from '../components/Clock.tsx';
import { Rink, type Marker } from '../components/Rink.tsx';
import { ActionSheet, type ActionInit } from '../components/ActionSheet.tsx';
import { GoalieSheet, goalieLabel } from '../components/GoalieSheet.tsx';
import { VoiceButton } from '../components/Voice.tsx';
import { PlayerChip, Sheet, sortPlayers, toast } from '../components/ui.tsx';
import { describe, pLabel, sideName } from '../describe.ts';
import { setScoreLayout } from '../layout.ts';
import { useLocalSetting } from '../theme.ts';
import { EditSheet } from './Log.tsx';
import { MoreSheet, useMarkers } from './Score.tsx';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const STRENGTHS: Strength[] = ['EV', 'PP', 'SH', 'EN', 'PS'];

interface Nav { goTab: (t: 'lines' | 'box' | 'shots' | 'log') => void; onShare: () => void; onGames: () => void; onEdit: () => void }
type Flow = { kind: 'shot' | 'penalty'; team: Side; result?: 'save' | 'miss' | 'block' | 'goal'; x?: number; y?: number };

/** Landscape scoring screen: home controls left, away right, feed in the middle; shot/penalty flows overlay it. */
export function LandscapeScore(nav: Nav) {
  const { game, d, actions } = useGame();
  const c = useClock();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [sheet, setSheet] = useState<ActionInit | null>(null);
  const [goalie, setGoalie] = useState<Side | null>(null);
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const [editing, setEditing] = useState<GameEvent | null>(null);
  const [view, setView] = useState<'feed' | 'rink'>('feed');
  const [type, setType] = useState('all');
  const [teamF, setTeamF] = useState<'all' | Side>('all');

  const open = (i: ActionInit) => (i.kind === 'shot' || i.kind === 'penalty' || i.kind === 'goal')
    ? setFlow({ kind: i.kind === 'penalty' ? 'penalty' : 'shot', team: i.team, result: i.kind === 'goal' ? 'goal' : undefined, x: i.x, y: i.y })
    : setSheet(i);
  const pens = activePenalties(d);
  const sog = (s: Side) => d.byPeriod.sog[s].reduce((a, b) => a + b, 0);

  const feed = useMemo(() => d.events
    .filter((e) => e.type !== 'shift' && e.type !== 'clock')
    .filter((e) => type === 'all' || e.type === type)
    .filter((e) => teamF === 'all' || e.data.team === teamF)
    .sort((a, b) => b.wall - a.wall), [d, type, teamF]);

  const col = (s: Side) => (
    <div className={`ls-col ${s}`}>
      <button className="ls-btn shot" onClick={() => setFlow({ kind: 'shot', team: s })}>SHOT</button>
      <button className="ls-btn goal" onClick={() => setFlow({ kind: 'shot', team: s, result: 'goal' })}>GOAL</button>
      <button className="ls-btn pen" onClick={() => setFlow({ kind: 'penalty', team: s })}>PENALTY</button>
      <button className="ls-btn" onClick={() => setGoalie(s)}>GOALIE<small>{goalieLabel(game, d.goalie[s])}</small></button>
      <button className="ls-btn" onClick={() => void actions.timeout(s)}>TIMEOUT<small>{d.timeouts[s]} used</small></button>
      {s === 'home'
        ? <button className="ls-btn foff" onClick={() => setSheet({ kind: 'faceoff', team: 'home' })}>FACEOFF</button>
        : <button className={`ls-btn clk ${c.running ? 'stop' : 'go'}`} onClick={() => void actions.toggleClock()}>{c.running ? 'STOP CLOCK' : 'START CLOCK'}</button>}
    </div>
  );

  return (
    <div className="ls">
      <header className="ls-top">
        <button className="ls-menu" aria-label="Menu" onClick={() => setMenu(true)}>☰</button>
        <div className="ls-team home"><b style={{ color: game.home.color }}>{sideName(game, 'home')}</b><small>SOG {sog('home')}</small></div>
        <div className="ls-score home">{d.score.home}</div>
        <ClockDisplay compact />
        <div className="ls-score away">{d.score.away}</div>
        <div className="ls-team away"><b style={{ color: game.away.color }}>{sideName(game, 'away')}</b><small>SOG {sog('away')}</small></div>
      </header>
      {pens.length > 0 && <div className="pens ls-pens">{pens.map((p) => <span key={p.ev.id} className={`pen ${p.d.team}`}>{p.d.player ? '#' + (game[p.d.team].players.find((x) => x.id === p.d.player)?.number ?? '?') : sideName(game, p.d.team).slice(0, 4)} {p.d.minutes}′ {fmtToi(p.remaining)}</span>)}</div>}
      <div className="ls-main">
        {col('home')}
        <section className="ls-mid">
          <div className="seg">
            {([['all', 'All'], ['goal', 'Goal'], ['shot', 'Shot'], ['penalty', 'Penalty'], ['faceoff', 'Faceoff']] as const).map(([k, l]) => <button key={k} className={type === k ? 'on' : ''} onClick={() => { setType(k); setView('feed'); }}>{l}</button>)}
          </div>
          <div className="seg">
            {([['all', 'All teams'], ['home', sideName(game, 'home')], ['away', sideName(game, 'away')]] as const).map(([k, l]) => <button key={k} className={`${k !== 'all' ? k : ''} ${teamF === k ? 'on' : ''}`} onClick={() => setTeamF(k as 'all' | Side)}>{l}</button>)}
          </div>
          {view === 'feed' ? (
            <div className="ls-feed">
              <div className="ls-ph">{periodName(c.period, game.rules).toUpperCase()} <span>{sideName(game, 'home')} {d.score.home} – {d.score.away} {sideName(game, 'away')}</span></div>
              {feed.length === 0 && <div className="muted" style={{ padding: 12 }}>Nothing recorded yet.</div>}
              {feed.map((e) => { const x = describe(game, e); return (
                <button key={e.id} className="ls-row" onClick={() => setEditing(e)}>
                  <b>{periodName(e.period, game.rules)} {fmtClock(e.clock)}</b>{x.team ? <i className={`dot ${x.team}`} /> : <i className="dot" />}
                  <span>{x.title}{x.sub && <small>{x.sub}</small>}</span>
                </button>); })}
            </div>
          ) : <MapView />}
          <div className="ls-tools">
            <button className="btn sm" onClick={() => void actions.undoLast()}>↶ Undo</button>
            <button className="btn sm" onClick={() => setView(view === 'feed' ? 'rink' : 'feed')}>{view === 'feed' ? '🗺 Map' : '📋 Feed'}</button>
            <VoiceButton onOpenAction={open} />
            <button className="btn sm" onClick={() => nav.goTab('lines')}>👥 Lines</button>
            <button className="btn sm" onClick={() => nav.goTab('box')}>📊 Stats</button>
            <button className="btn sm" onClick={() => setMore(true)}>More…</button>
          </div>
        </section>
        {col('away')}
      </div>

      {flow && (flow.kind === 'shot' ? <ShotFlow key="s" init={flow} onClose={() => setFlow(null)} /> : <PenaltyFlow key="p" init={flow} onClose={() => setFlow(null)} />)}
      {sheet && <ActionSheet key={sheet.kind} init={sheet} onClose={() => setSheet(null)} />}
      {goalie && <GoalieSheet side={goalie} onClose={() => setGoalie(null)} />}
      {editing && <EditSheet e={editing} onClose={() => setEditing(null)} />}
      {more && <MoreSheet onClose={() => setMore(false)} />}
      {menu && (
        <Sheet title="Menu" onClose={() => setMenu(false)}>
          <div className="col">
            <div className="row"><button className="btn grow" onClick={() => nav.goTab('shots')}>🎯 Shots</button><button className="btn grow" onClick={() => nav.goTab('box')}>📊 Stats</button><button className="btn grow" onClick={() => nav.goTab('log')}>🧾 Log</button></div>
            <button className="btn" onClick={() => { setMenu(false); nav.onShare(); }}>Share / export / email</button>
            <button className="btn" onClick={nav.onEdit}>Edit game details &amp; rules</button>
            <button className="btn" onClick={nav.onGames}>All games</button>
            <button className="btn" onClick={() => { setScoreLayout('classic'); toast('Classic scoring layout'); }}>Switch to classic layout</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function MapView() {
  const base = useMarkers();
  const { game } = useGame();
  const [flip] = useLocalSetting(`flip:${game.id}`, false);
  const c = useClock();
  const homeRight = (c.period % 2 === 1) !== flip;
  return <div className="ls-feed" style={{ display: 'grid', placeItems: 'center' }}><Rink vertical={false} markers={base as Marker[]} maxVh={55} leftTeam={homeRight ? 'away' : 'home'} /></div>;
}

/** header shared by both flows: Cancel · team toggle · Done */
function FlowHead({ team, setTeam, onClose, onDone, canDone, label }: { team: Side; setTeam: (s: Side) => void; onClose: () => void; onDone: () => void; canDone: boolean; label: string }) {
  const { game } = useGame();
  return (
    <div className="lf-head">
      <button className="btn danger" onClick={onClose}>Cancel</button>
      <div className="seg lf-team" role="radiogroup" aria-label="Team">
        {(['home', 'away'] as Side[]).map((s) => <button key={s} className={`${s} ${team === s ? 'on' : ''}`} onClick={() => setTeam(s)}>{sideName(game, s)}</button>)}
      </div>
      <button className="btn primary" disabled={!canDone} onClick={onDone}>{label}</button>
    </div>
  );
}

type Slot = 'shooter' | 'a1' | 'a2' | 'blocker';

function ShotFlow({ init, onClose }: { init: Flow; onClose: () => void }) {
  const { game, d, actions } = useGame();
  const c = useClock();
  const [flip] = useLocalSetting(`flip:${game.id}`, false);
  const [team, setTeam] = useState(init.team);
  const [result, setResult] = useState<'save' | 'miss' | 'block' | 'goal'>(init.result ?? 'save');
  const [loc, setLoc] = useState<{ x: number; y: number } | null>(init.x !== undefined ? { x: init.x, y: init.y! } : null);
  const [who, setWho] = useState<Partial<Record<Slot, string>>>({});
  const [active, setActive] = useState<Slot>('shooter');
  const [strength, setStrength] = useState<Strength | null>(null);
  const [goalieOpen, setGoalieOpen] = useState(false);
  const auto = strengthNow(d, team);
  const str = strength ?? auto;
  const homeRight = (c.period % 2 === 1) !== flip;
  const leftTeam: Side = homeRight ? 'away' : 'home';
  const slots: Slot[] = result === 'goal' ? ['shooter', 'a1', 'a2'] : result === 'block' ? ['shooter', 'blocker'] : ['shooter'];
  const cur: Slot = slots.includes(active) ? active : 'shooter';
  const side = cur === 'blocker' ? other(team) : team;
  const roster = sortPlayers(game[side].players.filter((p) => !p.scratched)).sort((a, b) => Number(d.onIce[side].has(b.id)) - Number(d.onIce[side].has(a.id)));
  const label: Record<Slot, string> = { shooter: result === 'goal' ? 'Scorer' : 'Shooter', a1: 'Assist', a2: 'Assist', blocker: 'Blocker' };
  const num = (id?: string) => (id ? pLabel(game, id, true) : '?');

  const pick = (id?: string) => {
    const next = { ...who };
    for (const k of Object.keys(next) as Slot[]) if (next[k] === id && k !== cur) delete next[k]; // a player holds one slot
    if (id === undefined || next[cur] === id) delete next[cur]; else next[cur] = id;
    setWho(next);
    if (id !== undefined && next[cur]) setActive(slots[slots.indexOf(cur) + 1] ?? cur); // advance to the next slot
  };
  const changeTeam = (s: Side) => { if (s !== team) { setTeam(s); setWho({}); setActive('shooter'); setStrength(null); } };
  const changeResult = (r: typeof result) => { setResult(r); if (r !== 'goal') setWho((w) => ({ ...w, a1: undefined, a2: undefined })); if (r !== 'block') setWho((w) => ({ ...w, blocker: undefined })); };

  const done = async () => {
    const at = loc ?? {};
    if (result === 'goal') await actions.goal({ team, scorer: who.shooter, assists: [who.a1, who.a2].filter(Boolean) as string[], strength: str, ...at });
    else await actions.shot({ team, player: who.shooter, result, blocker: result === 'block' ? who.blocker : undefined, strength: str, ...at });
    onClose();
  };
  const opp = other(team);

  return (
    <div className="lf" role="dialog" aria-modal="true" aria-label="Shot details">
      <FlowHead team={team} setTeam={changeTeam} onClose={onClose} onDone={() => void done()} canDone label={result === 'goal' ? '🚨 Goal' : 'Done'} />
      <div className="lf-body">
        <div className="lf-rink">
          <Rink vertical={false} maxVh={62} pending={loc} leftTeam={leftTeam} leftLabel={sideName(game, leftTeam)} rightLabel={sideName(game, other(leftTeam))} onTap={(x, y) => setLoc({ x, y })} />
          <div className="muted small">{loc ? <>Location set · <button className="btn sm ghost" onClick={() => setLoc(null)}>clear</button></> : 'Tap the ice where it happened (optional)'}</div>
        </div>
        <div className="lf-who">
          <div className="lf-slots">
            {slots.map((s) => <button key={s} className={`lf-slot ${cur === s ? 'on' : ''}`} onClick={() => setActive(s)}><small>{label[s]}</small><b>{num(who[s])}</b></button>)}
          </div>
          <div className="chips">
            <button className={`chip ${who[cur] === undefined ? 'on' : ''}`} onClick={() => pick(undefined)}><span>?</span><small>unknown</small></button>
            {roster.map((p) => <PlayerChip key={p.id} p={p} ice={d.onIce[side].has(p.id)} on={who[cur] === p.id} onTap={() => pick(p.id)} />)}
          </div>
        </div>
      </div>
      <div className="lf-foot">
        <div className="lf-def">Defending goalie: <b>{goalieLabel(game, d.goalie[opp])}</b> <button className="btn sm ghost" onClick={() => setGoalieOpen(true)}>change</button></div>
        <div className="seg">
          {STRENGTHS.map((s) => <button key={s} className={str === s ? 'on' : ''} title={STRENGTH_INFO[s]} onClick={() => setStrength(s)}>{s === 'EV' ? 'Even' : s === 'PP' ? 'Power play' : s === 'SH' ? 'Short-handed' : s === 'EN' ? 'Empty net' : 'Pen. shot'}{s === auto && strength === null && auto !== 'EV' ? ' •' : ''}</button>)}
        </div>
        <div className="seg lf-res">
          {([['save', 'On net'], ['miss', 'Missed'], ['block', 'Blocked'], ['goal', 'GOAL']] as const).map(([k, l]) => <button key={k} className={`${k} ${result === k ? 'on' : ''}`} onClick={() => changeResult(k)}>{l}</button>)}
        </div>
      </div>
      {goalieOpen && <GoalieSheet side={opp} onClose={() => setGoalieOpen(false)} />}
    </div>
  );
}

function PenaltyFlow({ init, onClose }: { init: Flow; onClose: () => void }) {
  const { game, d, actions } = useGame();
  const [team, setTeam] = useState(init.team);
  const [player, setPlayer] = useState<string | undefined>();
  const [type, setType] = useState<ReturnType<typeof penaltyTypes>[number] | null>(null);
  const [cat, setCat] = useState<PenaltyCategory>('minor');
  const [noPP, setNoPP] = useState<boolean | null>(null);
  const cats = penaltyCategories(game.rules);
  const ci = cats.find((x) => x.id === cat)!;
  const noPower = noPP === null ? !ci.shorts : noPP;
  const roster = sortPlayers(game[team].players.filter((p) => !p.scratched)).sort((a, b) => Number(d.onIce[team].has(b.id)) - Number(d.onIce[team].has(a.id)));
  const pickType = (t: NonNullable<typeof type>) => { setType(t); setCat(defaultCategory(t, game.rules)); setNoPP(null); };
  const done = async () => {
    await actions.penalty({ team, player, code: type!.code, label: type!.label, minutes: ci.minutes, category: cat, ...(noPower ? { noPP: true } : {}) });
    onClose();
  };
  return (
    <div className="lf" role="dialog" aria-modal="true" aria-label="Penalty details">
      <FlowHead team={team} setTeam={(s) => { if (s !== team) { setTeam(s); setPlayer(undefined); } }} onClose={onClose} onDone={() => void done()} canDone={!!type} label="Done" />
      <div className="lf-body">
        <div className="lf-who">
          <div className="muted small">Penalized player</div>
          <div className="chips">
            <button className={`chip ${player === undefined ? 'on' : ''}`} onClick={() => setPlayer(undefined)}><span>?</span><small>unknown</small></button>
            {roster.map((p) => <PlayerChip key={p.id} p={p} ice={d.onIce[team].has(p.id)} on={player === p.id} onTap={() => setPlayer(p.id)} />)}
          </div>
        </div>
        <div className="lf-who">
          <div className="muted small">Infraction</div>
          <div className="chips">
            {penaltyTypes(game.rules).map((t) => <button key={t.code} className={`btn sm ${type?.code === t.code ? 'primary' : ''}`} onClick={() => pickType(t)}>{t.label}</button>)}
          </div>
        </div>
      </div>
      <div className="lf-foot">
        <div className="seg">
          {cats.map((x) => <button key={x.id} className={cat === x.id ? 'on' : ''} onClick={() => { setCat(x.id); setNoPP(null); }}>{x.label} · {x.minutes}:00</button>)}
        </div>
        <div className="seg">
          <button className={!noPower ? 'on' : ''} onClick={() => setNoPP(false)}>Team plays short (power play for {sideName(game, other(team))})</button>
          <button className={noPower ? 'on' : ''} onClick={() => setNoPP(true)}>No power play (player serves alone)</button>
        </div>
      </div>
    </div>
  );
}
