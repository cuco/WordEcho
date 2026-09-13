import { useEffect } from "react";
import { liveQuery } from "dexie";
import { NavLink, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { BookIcon, HomeIcon, PlusIcon, GiftIcon } from "./components/icons";
import { InstallGate } from "./components/InstallGate";
import { syncInstallBridgeFromDb } from "./db/install-bridge";
import { db, getPrefs } from "./db/schema";
import { needsInstallGate } from "./lib/pwa-install";
import { setSoundEnabled } from "./lib/sfx";
import { loadVoices, setVoicePreference } from "./lib/speech";
import { BankPage } from "./pages/BankPage";
import { ImportPage } from "./pages/ImportPage";
import { LearnPage } from "./pages/LearnPage";
import { LessonPage } from "./pages/LessonPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WordPage } from "./pages/WordPage";
import { RewardsPage } from "./pages/RewardsPage";

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
        <NavLink to="/rewards" className={({ isActive }) => (isActive ? "active" : "")}>
          <GiftIcon />
          奖励
        </NavLink>
      </nav>
    </>
  );
}

export function App() {
  const installRequired = needsInstallGate();

  useEffect(() => {
    if (installRequired) return;
    void loadVoices();
    void getPrefs().then((p) => {
      setVoicePreference(p.ttsVoice ?? null);
      setSoundEnabled(p.soundOn ?? true);
    });
  }, [installRequired]);

  useEffect(() => {
    if (!installRequired) return;
    // Keep the small, install-only bridge current. liveQuery runs again only
    // after a committed IndexedDB change, so rolled-back XP is never mirrored.
    const subscription = liveQuery(() => Promise.all([
      db.prefs.toArray(),
      db.redemptions.toArray(),
    ])).subscribe({ next: () => { void syncInstallBridgeFromDb().catch(() => undefined); } });
    return () => subscription.unsubscribe();
  }, [installRequired]);

  if (installRequired) return <div className="app"><InstallGate /></div>;

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
          <Route path="/rewards" element={<RewardsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </div>
  );
}
