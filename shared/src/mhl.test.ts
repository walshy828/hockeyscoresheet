import { describe, expect, it } from 'vitest';
import { compareStats, parseDirectory, parseLeagues, parseTeamPage } from './mhl.ts';

const TEAM = `<title>My Hockey Live – Medfield Warriors 2026-27</title>
<article class="team full">
        <h1>Medfield Warriors 2026-27</h1>
<table class="player_stats" id="players-table"><thead><tr><th>No.</th></tr></thead><tbody>
<tr><td class="jersey">4</td><td class="name"><a href="/miaa/players/1-a">Alexis  Guindon </a></td><td class="extra">SR</td><td>D</td><td class="extra"></td><td></td><td></td><td class="extra"></td><td></td></tr>
<tr><td class="jersey">15</td><td class="name"><a href="/miaa/players/2-b">Maggie O&#39;Hara </a></td><td class="extra">JR</td><td>F</td><td class="extra">10</td><td>5</td><td>3</td><td class="extra">8</td><td>4</td></tr>
</tbody></table>`;

describe('parseTeamPage', () => {
  const t = parseTeamPage(TEAM, '4404-medfield');
  it('reads name and season', () => expect(t).toMatchObject({ name: 'Medfield Warriors', season: '2026-27', ref: '4404-medfield' }));
  it('reads roster rows, blank stats as undefined', () => {
    expect(t.players[0]).toMatchObject({ number: '4', name: 'Alexis Guindon', year: 'SR', pos: 'D', gp: undefined });
    expect(t.players[1]).toMatchObject({ number: '15', name: "Maggie O'Hara", gp: 10, g: 5, a: 3, pts: 8, pim: 4 });
  });
});

describe('directory parsing', () => {
  it('reads teams with gender', () => {
    const html = `<li><strong><a href="/miaa/teams/4054-algonquin-hudson">Algonquin/Hudson Titans</a></strong> – Girls</li>`;
    expect(parseDirectory(html)).toEqual([{ ref: '4054-algonquin-hudson', name: 'Algonquin/Hudson Titans', gender: 'Girls' }]);
  });
  it('dedupes leagues', () => {
    const l = `<a href="/miaa/teams?league=758-central-west-a&amp;season=2025-26"><span class='icon-clipboard'></span> Girls Central-West A</a>`;
    expect(parseLeagues(`<a href="/miaa/teams?league=9-x"><span class='icon-clipboard'></span> Boys X</a>`)).toEqual([{ id: '9-x', name: 'Boys X' }]);
    expect(parseLeagues(l + l)).toEqual([{ id: '758-central-west-a', name: 'Girls Central-West A' }]);
  });
});

describe('compareStats', () => {
  const online = parseTeamPage(TEAM, 'x').players;
  it('flags stat differences, name mismatches and one-sided players', () => {
    const rows = compareStats([
      { number: '15', name: 'Maggie OHara', gp: 10, g: 4, a: 3, pim: 4 },
      { number: '9', name: 'Only Here', gp: 1, g: 0, a: 0, pim: 0 },
    ], online);
    expect(rows.map((r) => [r.number, r.kind])).toEqual([['4', 'onlyOnline'], ['9', 'onlyApp'], ['15', 'diff']]);
    expect(rows[2].diffs).toEqual(['g']);
    expect(rows[2].nameOnline).toBeUndefined();
  });
});
