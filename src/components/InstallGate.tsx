import { useEffect, useState } from "react";
import { HomeIcon } from "./icons";
import {
  hasInstallPrompt,
  installPlatform,
  showInstallPrompt,
  subscribeInstallPrompt,
} from "../lib/pwa-install";

export function InstallGate() {
  const platform = installPlatform();
  const [canPrompt, setCanPrompt] = useState(hasInstallPrompt);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [promptFailed, setPromptFailed] = useState(false);

  useEffect(() => subscribeInstallPrompt(() => setCanPrompt(hasInstallPrompt())), []);
  useEffect(() => {
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  async function install() {
    setBusy(true);
    try {
      const outcome = await showInstallPrompt();
      if (outcome === "accepted") setInstalled(true);
    } catch {
      setPromptFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="install-gate">
      <section className="install-card">
        <span className="install-icon" aria-hidden="true"><HomeIcon size={42} /></span>
        <h1>{installed ? "WordEcho 已安装" : "先安装 WordEcho"}</h1>
        <p>安装后再开始学习，词库、连胜和积分会留在同一个应用空间里，不需要手动备份。</p>
        {installed ? (
          <p className="install-steps">请回到桌面，从 WordEcho 图标打开。</p>
        ) : platform === "android" ? (
          canPrompt && !promptFailed ? (
            <button className="btn" type="button" disabled={busy} onClick={() => void install()}>
              {busy ? "正在打开安装…" : "安装 WordEcho"}
            </button>
          ) : (
            <p className="install-steps">点浏览器右上角菜单，选择「安装应用」或「添加到主屏幕」，然后从桌面图标打开。</p>
          )
        ) : (
          <p className="install-steps">点浏览器的「分享」按钮，选择「添加到主屏幕」，然后从桌面上的 WordEcho 图标打开。</p>
        )}
        <p className="install-note">已有的连胜、积分和贴纸记录会在首次启动时自动带过去，无需先导出再导入。</p>
      </section>
    </main>
  );
}
