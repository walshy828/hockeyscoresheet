import { createContext, useContext } from 'react';
import type { Game, GameEvent } from '../../shared/src/types.ts';
import type { Derived } from '../../shared/src/derive.ts';
import type { Actions } from './actions.ts';

export interface GameCtx {
  game: Game;
  events: GameEvent[];
  d: Derived;
  canEdit: boolean;
  actions: Actions;
  now: number;
  anchor: 'wall' | 'recv';
  saveGame?: (g: Game) => Promise<void>;
}
export const Ctx = createContext<GameCtx>(null as unknown as GameCtx);
export const useGame = () => useContext(Ctx);
