import { useEffect } from "react";
import { NavLink, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { BookIcon, HomeIcon, PlusIcon } from "./components/icons";
import { getPrefs } from "./db/schema";
import { setSoundEnabled } from "./lib/sfx";
import { loadVoices, setVoicePreference } from "./lib/speech";
import { BankPage } from "./pages/BankPage";
import { ImportPage } from "./pages/ImportPage";
import { LearnPage } from "./pages/LearnPage";
import { LessonPage } from "./pages/LessonPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WordPage } from "./pages/WordPage";

function Shell() {
  return (
    <>
      <Outlet />
      <nav className="tabbar">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          <HomeIcon />
          学习
        </NavLink>
        <NavLink to="/bank" className={({ isActive }) => (isActive ? "active" : "")}>
          <BookIcon />
          词库
        </NavLink>
        <NavLink to="/import" className={({ isActive }) => (isActive ? "active" : "")}>
          <PlusIcon />
          录入
        </NavLink>
      </nav>
    </>
  );
}

export function App() {
  useEffect(() => {
    void loadVoices();
    void getPrefs().then((p) => {
      setVoicePreference(p.ttsVoice ?? null);
      setSoundEnabled(p.soundOn ?? true);
    });
  }, []);

  return (
    <div className="app">
      <Routes>
        <Route path="/lesson/:sessionId" element={<LessonPage />} />
        <Route element={<Shell />}>
          <Route path="/" element={<LearnPage />} />
          <Route path="/bank" element={<BankPage />} />
          <Route path="/bank/:id" element={<WordPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </div>
  );
}
