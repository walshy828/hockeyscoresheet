import type { Side } from './types.ts';

export type VoiceCommand =
  | { kind: 'goal'; team: Side; scorer?: string; assists: string[] }
  | { kind: 'shot'; team: Side; player?: string; result: 'save' | 'miss' | 'block' }
  | { kind: 'penalty'; team: Side; player?: string; code?: string; minutes?: number }
  | { kind: 'faceoff'; team: Side; player?: string }
  | { kind: 'timeout'; team: Side }
  | { kind: 'clock'; action: 'start' | 'stop' | 'set'; remaining?: number }
  | { kind: 'note'; text: string };

const NUM_WORDS: Record<string, string> = {
  zero: '0', oh: '0', one: '1', two: '2', to: '2', too: '2', three: '3', four: '4', for: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
  twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90',
};

const PENALTIES: Array<[RegExp, string, number?]> = [
  [/trip/, 'TRIP'], [/hook/, 'HOOK'], [/slash/, 'SLASH'], [/high\s*stick/, 'HSTK'], [/interfer/, 'INTF'], [/hold/, 'HOLD'],
  [/rough/, 'ROUGH'], [/elbow/, 'ELBOW'], [/cross/, 'CROSS'], [/board/, 'BOARD'], [/charg/, 'CHARG'], [/fight/, 'FIGHT'],
  [/delay/, 'DOG'], [/too many/, 'TMM'], [/unsportsman/, 'UNSP'], [/game misconduct/, 'GMISC'], [/misconduct/, 'MISC'],
];

/** Normalise speech text: lowercase, spoken numbers => digits ("twenty two" -> "22"). */
export function normalize(text: string): string {
  const toks = text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/#/g, ' ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const n = NUM_WORDS[t];
    if (n !== undefined && !['to', 'too', 'for', 'oh'].includes(t)) {
      // tens + unit: "twenty two" => 22
      const nx = NUM_WORDS[toks[i + 1] ?? ''];
      if (n.length === 2 && n.endsWith('0') && nx && nx.length === 1 && !['to', 'too', 'for', 'oh'].includes(toks[i + 1])) {
        out.push(String(Number(n) + Number(nx)));
        i++;
      } else out.push(n);
    } else if (['to', 'too', 'for'].includes(t)) out.push(t); // ambiguous homophones handled contextually below
    else out.push(t);
  }
  return out.join(' ');
}

function team(s: string): Side | undefined {
  if (/\b(home|us|ours)\b/.test(s)) return 'home';
  if (/\b(away|visitor|visitors|them|guest|guests|opponent)\b/.test(s)) return 'away';
  return undefined;
}

/** Numbers following a keyword, in order. Homophones to/too/for count as 2/2/4 only after the first digit-less pass. */
function nums(s: string): string[] {
  return (s.match(/\b\d{1,2}\b/g) ?? []);
}

export function parseVoice(raw: string, defaultTeam: Side = 'home'): VoiceCommand | null {
  let s = normalize(raw);
  // contextual homophones after keywords e.g. "penalty home 2" is rare; map standalone homophones to digits after "assist"/"goal"/"shot"/"number"
  s = s.replace(/\b(assists?|goal|shot|number|penalty|faceoff|face off)\s+(home|away)?\s*(to|too)\b/g, (_m, k, t) => `${k} ${t ?? ''} 2`.replace(/\s+/g, ' '));
  s = s.replace(/\bfor\b(?=\s*$|\s+assist)/g, '4');

  const t = team(s);
  const side = t ?? defaultTeam;

  let m: RegExpMatchArray | null;
  if ((m = s.match(/\b(start|resume|run)\b.*\bclock\b|\bclock\b.*\b(start|go|run)\b/))) return { kind: 'clock', action: 'start' };
  if (/\b(stop|pause)\b.*\bclock\b|\bclock\b.*\bstop\b|\bwhistle\b/.test(s)) return { kind: 'clock', action: 'stop' };
  if ((m = s.match(/\b(?:set\s+)?clock\s+(?:to\s+)?(\d{1,2})\s*(?::|\s)\s*(\d{1,2})\b/))) {
    return { kind: 'clock', action: 'set', remaining: Number(m[1]) * 60 + Number(m[2]) };
  }
  if (/\btime\s?out\b/.test(s)) return { kind: 'timeout', team: side };

  if (/\bgoal\b|\bscore[sd]?\b/.test(s)) {
    const [before, after = ''] = s.split(/\bassists?\b/);
    const scorerN = nums(before.replace(/\b(home|away)\b/g, ''))[0];
    return { kind: 'goal', team: side, scorer: scorerN, assists: nums(after).slice(0, 2) };
  }
  if (/\bpenalty\b|\bpenalt(y|ies)\b|\bminor\b|\bmajor\b/.test(s)) {
    const minutes = /\bmajor\b/.test(s) ? 5 : /\bdouble\b/.test(s) ? 4 : (s.match(/\b(\d{1,2})\s*min/)?.[1] ? Number(s.match(/\b(\d{1,2})\s*min/)![1]) : /\bminor\b/.test(s) ? 2 : undefined);
    const code = PENALTIES.find(([re]) => re.test(s))?.[1];
    const player = nums(s.replace(/\b\d{1,2}\s*min\w*/g, ''))[0];
    return { kind: 'penalty', team: side, player, code, minutes };
  }
  if (/\bface\s?off\b|\bfaceoff\b/.test(s)) {
    return { kind: 'faceoff', team: side, player: nums(s)[0] };
  }
  if (/\b(shot|shoots|save|saved|miss|missed|blocked|block)\b/.test(s)) {
    const result = /\bmiss/.test(s) ? 'miss' : /\bblock/.test(s) ? 'block' : 'save';
    return { kind: 'shot', team: side, player: nums(s)[0], result };
  }
  if ((m = raw.match(/^\s*(?:note|remember|comment)[:,]?\s+(.+)$/i))) return { kind: 'note', text: m[1] };
  return null;
}
