import { useEffect, useRef, useState } from "react";
import { getPrefs, savePrefs } from "../db/schema";
import { PencilIcon } from "./icons";

export const NAME_MAX = 12;

export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

export function NameChip() {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getPrefs().then((p) => setName(p.name ?? ""));
  }, []);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function open() {
    setDraft(name);
    setEditing(true);
  }

  async function commit() {
    if (!editing) return;
    setEditing(false);
    const next = cleanName(draft);
    if (next === name) return;
    setName(next);
    // Re-read so a concurrent prefs write (streak, xp) isn't clobbered.
    const prefs = await getPrefs();
    await savePrefs({ ...prefs, name: next });
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="name-input"
        value={draft}
        maxLength={NAME_MAX}
        placeholder="写名字"
        aria-label="名字"
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      className={name ? "name-chip" : "name-chip empty"}
      aria-label={name ? `名字：${name}，点一下改名` : "点这里写名字"}
      onClick={open}
    >
      <span className="name-text">{name || "点这里写名字"}</span>
      <PencilIcon size={16} />
    </button>
  );
}
