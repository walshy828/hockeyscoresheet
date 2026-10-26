import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Games } from './screens/Games.tsx';
import { GameForm } from './screens/GameForm.tsx';
import { LocalGame } from './screens/Game.tsx';
import { Viewer } from './screens/Viewer.tsx';
import { TeamEdit, Teams } from './screens/Teams.tsx';
import { Settings } from './screens/Settings.tsx';
import { Join } from './screens/Join.tsx';
import { Toasts } from './components/ui.tsx';

export default function App() {
  const { pathname } = useLocation();
  const main = pathname === '/' || pathname.startsWith('/teams') || pathname === '/settings' || pathname === '/join';
  return (
    <>
      <div className={main ? 'app hasnav' : undefined} style={main ? undefined : { display: 'contents' }}>
        <Routes>
          <Route path="/" element={<Games />} />
          <Route path="/join" element={<Join />} />
          <Route path="/game/new" element={<GameForm />} />
          <Route path="/game/:id" element={<LocalGame />} />
          <Route path="/game/:id/edit" element={<GameForm />} />
          <Route path="/v/:token" element={<Viewer />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:id" element={<TeamEdit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Games />} />
        </Routes>
        {main && (
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}><span className="ico">🏒</span>Games</NavLink>
            <NavLink to="/teams" className={({ isActive }) => (isActive ? 'active' : '')}><span className="ico">👥</span>Teams</NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}><span className="ico">⚙️</span>Settings</NavLink>
          </nav>
        )}
      </div>
      <Toasts />
    </>
  );
}
