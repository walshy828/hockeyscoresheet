import { useMemo } from 'react';
import { buildInsights, periodReviews, type Area, type Insight, type Tone } from '../../../shared/src/insights.ts';
import { useGame } from '../ctx.ts';
import { sideName } from '../describe.ts';
import { Card, TeamToggle, useFocus } from './parts.tsx';

const ICON: Record<Tone, string> = { good: '✓', bad: '!', watch: '•', exploit: '➜' };

export function InsightList({ items, empty }: { items: Insight[]; empty: string }) {
  if (!items.length) return <div className="muted">{empty}</div>;
  return (
    <ul className="vw-insights">
      {items.map((i) => (
        <li key={i.id} className={`vw-ins ${i.tone}`}>
          <span className="ico" aria-hidden="true">{ICON[i.tone]}</span>
          <div><b>{i.title}</b><div className="muted small">{i.detail}</div></div>
          <span className="area">{i.area}</span>
        </li>
      ))}
    </ul>
  );
}

const AREAS: Area[] = ['Scoring', 'Shots', 'Faceoffs', 'Special teams', 'Discipline', 'Goaltending', 'Ice time'];
const byArea = (a: Insight, b: Insight) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area);

/** The coach's board: what is working, what isn't, and what to go after — with a review of each period. */
export function InsightsSection() {
  const { game, d } = useGame();
  const { focus } = useFocus();
  const all = useMemo(() => buildInsights(d, game, focus), [d, game, focus]);
  const reviews = useMemo(() => periodReviews(d, game, focus), [d, game, focus]);
  const pick = (...t: Tone[]) => all.filter((i) => t.includes(i.tone)).sort(byArea);
  const opp = focus === 'home' ? 'away' : 'home';
  const sample = `${d.shots.length + d.goals.length} shots, ${d.faceoffs.length} faceoffs and ${d.penalties.length} penalties`;

  return (
    <div className="vw-grid">
      <Card title="Period review" sub={`${sideName(game, focus)} against ${sideName(game, opp)}`} right={<TeamToggle />} wide>
        {reviews.length === 0 && <div className="muted">Nothing to review yet — periods appear as the game is played.</div>}
        <div className="vw-reviews">
          {reviews.map((r) => (
            <div key={r.period} className={`vw-review ${r.result}`}>
              <div className="row"><b className="grow">{r.name} period</b><span className="vw-result">{r.result === 'won' ? 'Won' : r.result === 'lost' ? 'Lost' : 'Even'} {r.score[0]}–{r.score[1]}</span></div>
              {r.good.map((g) => <div key={g} className="vw-line good"><span aria-hidden="true">✓</span>{g}</div>)}
              {r.bad.map((g) => <div key={g} className="vw-line bad"><span aria-hidden="true">!</span>{g}</div>)}
              {!r.good.length && !r.bad.length && <div className="muted small">Even all round.</div>}
            </div>
          ))}
        </div>
      </Card>

      <Card title="What's working"><InsightList items={pick('good')} empty="Nothing stands out yet — insights appear as the game builds up some data." /></Card>
      <Card title="Needs work"><InsightList items={pick('bad', 'watch')} empty="Nothing is flagged so far." /></Card>
      <Card title="Go after" sub={`Where ${sideName(game, opp)} is vulnerable`} wide><InsightList items={pick('exploit')} empty="No clear matchups or weaknesses to exploit yet." /></Card>

      <div className="muted small span" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
        Based on {sample} recorded so far. Findings need a minimum sample, so early in the game they will be sparse — and they are only as good as the data being captured.
      </div>
    </div>
  );
}
