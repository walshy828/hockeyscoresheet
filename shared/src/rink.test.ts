import { describe, expect, it } from 'vitest';
import { defenderAt, rinkEnds } from './rink.ts';

describe('rinkEnds', () => {
  it('puts home on the left by default, with the same layout every period', () => {
    expect(rinkEnds({})).toMatchObject({ leftTeam: 'home', rightTeam: 'away', leftLabel: 'HOME', rightLabel: 'AWAY' });
  });
  it('can put home on the right', () => {
    expect(rinkEnds({ homeOnLeft: false })).toMatchObject({ leftTeam: 'away', rightTeam: 'home', rightLabel: 'HOME' });
  });
});

describe('defenderAt', () => {
  it('maps a tap to the team defending that end', () => {
    expect(defenderAt({}, 30)).toBe('home');
    expect(defenderAt({}, 170)).toBe('away');
    expect(defenderAt({ homeOnLeft: false }, 30)).toBe('away');
  });
});
