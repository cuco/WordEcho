import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SpeakButton } from "../components/AudioButtons";
import { ChevronDownIcon } from "../components/icons";
import { NAME_MAX, cleanName } from "../components/NameChip";
import { exportBackup, importBackup } from "../db/repo";
import { getPrefs, savePrefs } from "../db/schema";
import { playCorrect, setSoundEnabled } from "../lib/sfx";
import { isUsableVoice, loadVoices, setVoicePreference } from "../lib/speech";
import type { UserPrefs } from "../lib/types";

const RATE_PRESETS = [
  { value: 0.75, label: "慢" },
  { value: 0.85, label: "适中" },
  { value: 1, label: "快" },
];

/** 语速下拉的选项；孩子只需认「慢 / 适中 / 快」，但备份里带来的自定义值也要留着。 */
function rateOptions(rate: number) {
  if (RATE_PRESETS.some((p) => p.value === rate)) return RATE_PRESETS;
  return [...RATE_PRESETS, { value: rate, label: `${rate}×` }].sort((a, b) => a.value - b.value);
}

export function SettingsPage() {
  const nav = useNavigate();
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [includeKey, setIncludeKey] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    void getPrefs().then(setPrefs);
    void loadVoices().then((vs) =>
      setVoices(vs.filter((v) => v.lang.replace("_", "-").startsWith("en") && isUsableVoice(v))),
    );
  }, []);

  if (!prefs) return null;

  async function save(next: UserPrefs) {
    setPrefs(next);
    setVoicePreference(next.ttsVoice ?? null);
    await savePrefs(next);
  }

  async function doExport() {
    const data = await exportBackup(includeKey);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "wordecho-backup.json";
    a.click();
  }

  async function doImport(file: File) {
    const data = JSON.parse(await file.text());
    await importBackup(data);
    alert("已导入备份");
  }

  return (
    <main className="main">
      <button className="btn ghost small" onClick={() => nav(-1)}>
        返回
      </button>
      <h1>设置</h1>
      <label>名字</label>
      <input
        placeholder="最多 12 个字"
        maxLength={NAME_MAX}
        value={prefs.name ?? ""}
        onChange={(e) => void save({ ...prefs, name: e.target.value })}
        onBlur={(e) => void save({ ...prefs, name: cleanName(e.target.value) })}
      />
      <label>每日题量（8–30）</label>
      <input
        type="number"
        min={8}
        max={30}
        value={prefs.dailyLimit}
        onChange={(e) => void save({ ...prefs, dailyLimit: Number(e.target.value) })}
      />
      <div className="speech-row">
        <div className="sp-field sp-accent">
          <label htmlFor="tts-lang">发音</label>
          <span className="sel">
            <select
              id="tts-lang"
              value={prefs.ttsLang}
              onChange={(e) => void save({ ...prefs, ttsLang: e.target.value as UserPrefs["ttsLang"] })}
            >
              <option value="en-US">美音</option>
              <option value="en-GB">英音</option>
            </select>
            <ChevronDownIcon />
          </span>
        </div>
        <div className="sp-field sp-voice">
          <label htmlFor="tts-voice">朗读嗓音</label>
          <span className="sel">
            <select
              id="tts-voice"
              value={prefs.ttsVoice ?? ""}
              onChange={(e) => void save({ ...prefs, ttsVoice: e.target.value || null })}
            >
              <option value="">自动挑最好的</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}（{v.lang}）
                </option>
              ))}
            </select>
            <ChevronDownIcon />
          </span>
        </div>
        <div className="sp-field sp-rate">
          <label htmlFor="tts-rate">语速</label>
          <span className="sel">
            <select
              id="tts-rate"
              value={String(prefs.ttsRate)}
              onChange={(e) => void save({ ...prefs, ttsRate: Number(e.target.value) })}
            >
              {rateOptions(prefs.ttsRate).map((o) => (
                <option key={o.value} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon />
          </span>
        </div>
        <div className="sp-field sp-try">
          <label htmlFor="tts-try">试听</label>
          <SpeakButton id="tts-try" text="This is an apple." lang={prefs.ttsLang} rate={prefs.ttsRate} size="sm" />
        </div>
      </div>
      <p className="muted speech-hint">
        iPad 上到「设置 → 辅助功能 → 朗读内容 → 嗓音 → 英语」下载 Enhanced/Premium 嗓音，这里就能选到，比默认的好听很多。
      </p>
      <label>
        <input
          type="checkbox"
          checked={prefs.soundOn ?? true}
          onChange={(e) => {
            setSoundEnabled(e.target.checked);
            void save({ ...prefs, soundOn: e.target.checked });
            if (e.target.checked) playCorrect(1);
          }}
        />{" "}
        答题音效
      </label>
      <label>
        <input
          type="checkbox"
          checked={prefs.autoSpeak ?? true}
          onChange={(e) => void save({ ...prefs, autoSpeak: e.target.checked })}
        />{" "}
        答完题自动念一遍单词
      </label>
      <h2>AI（仅未命中离线词典时）</h2>
      <input
        placeholder="Base URL，如 https://api.openai.com/v1"
        value={prefs.aiBaseUrl ?? ""}
        onChange={(e) => void save({ ...prefs, aiBaseUrl: e.target.value })}
      />
      <input
        placeholder="API Key"
        value={prefs.aiApiKey ?? ""}
        onChange={(e) => void save({ ...prefs, aiApiKey: e.target.value })}
      />
      <input
        placeholder="模型名"
        value={prefs.aiModel ?? ""}
        onChange={(e) => void save({ ...prefs, aiModel: e.target.value })}
      />
      <h2>备份</h2>
      <label>
        <input type="checkbox" checked={includeKey} onChange={(e) => setIncludeKey(e.target.checked)} />{" "}
        导出时包含 API Key
      </label>
      <button className="btn" onClick={() => void doExport()}>
        导出 JSON
      </button>
      <p>导入备份</p>
      <input
        type="file"
        accept="application/json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doImport(f);
        }}
      />
    </main>
  );
}
