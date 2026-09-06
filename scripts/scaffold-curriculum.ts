/**
 * Scaffold empty wordlist templates for New Magic + Graded Readers.
 * Skips files that already contain real word lines (not only comments).
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const listDir = join(root, "src/data/wordlists");

const NEW_MAGIC_UNITS: Record<string, string[]> = {
  "1a": [
    "Nice to meet you",
    "My new friends",
    "Happy birthday",
    "Colours around us",
    "In the classroom",
    "An animal story",
  ],
  "1b": [
    "I can sing",
    "Fruit day",
    "My schoolbag",
    "Where is the hamster",
    "The countryside",
    "The Alien family",
  ],
  "2a": [
    "A day out",
    "Let's go!",
    "Our school",
    "Our new flat",
    "School picnic",
    "The Honest Woodcutter",
  ],
  "2b": [
    "The four seasons",
    "Our week",
    "Yummy food!",
    "An interview with Mr Gordon",
    "Nice people around us",
    "Pets can be good friends",
  ],
  "3a": [
    "I like English",
    "Let's go shopping",
    "Let's go to the park",
    "My calendar",
    "Cooking at home",
    "Dress Casual Day",
  ],
  "3b": [
    "At the fun park",
    "Beach fun",
    "Nice people at school",
    "How can you help?",
    "The Emperor and the Nightingale",
    "A bad day",
  ],
  "4a": [
    "Our new neighbours",
    "One you admire",
    "Visit Hong Kong",
    "A day at a children's palace",
    "Let's have fun!",
    "Christmas party",
  ],
  "4b": [
    "New Year fun",
    "School play",
    "Chinese food",
    "Food fair",
    "Health tips",
    "Welcome to Rainbow City",
  ],
  "5a": [
    "What do you do?",
    "E-age",
    "What's in our food?",
    "We can cook",
    "A fun place to go",
    "That's our Earth",
  ],
  "5b": [
    "Games-past and present",
    "Time flies",
    "Different weather conditions",
    "Wonderful nature",
    "Summer fun!",
    "Different festivals",
  ],
};

const LEVELS = ["1a", "1b", "2a", "2b", "3a", "3b", "4a", "4b", "5a", "5b", "6a", "6b"];

function stubHeader(title: string, extra: string[] = []) {
  return [
    `# ${title} · fill from textbook / vocabulary handbook (no public complete list)`,
    `# Format: English word\\tUnit N`,
    `# Example:`,
    `# hello\\tUnit 1`,
    ...extra,
    "",
  ];
}

async function hasWordLines(path: string) {
  try {
    const text = await readFile(path, "utf8");
    return text.split(/\r?\n/).some((l) => {
      const t = l.trim();
      return t && !t.startsWith("#");
    });
  } catch {
    return false;
  }
}

for (const level of LEVELS) {
  const path = join(listDir, `new-magic-${level}.txt`);
  if (await hasWordLines(path)) {
    console.log("skip (has words)", path);
    continue;
  }
  const label = level.toUpperCase();
  const units =
    NEW_MAGIC_UNITS[level] ?? Array.from({ length: 6 }, (_, i) => `Unit ${i + 1} (fill title from book)`);
  const unitLines = units.map((u, i) =>
    u.startsWith("Unit ") ? `# ${u}` : `# Unit ${i + 1} · ${u}`,
  );
  const lines = [...stubHeader(`New Magic / 启思英语 ${label}`, unitLines), ""];
  await writeFile(path, lines.join("\n"));
}

const graded = [
  ["prep", "Preparatory"],
  ...Array.from({ length: 12 }, (_, i) => [`l${i + 1}`, `Level ${i + 1}`] as const),
];

for (const [slug, title] of graded) {
  const path = join(listDir, `graded-readers-${slug}.txt`);
  if (await hasWordLines(path)) {
    console.log("skip (has words)", path);
    continue;
  }
  const lines = [
    ...stubHeader(`新魔法英语分级读物 ${title}`, [
      `# Aggregate words for this level (from reading handbook / ebook), not per storybook.`,
    ]),
    `# word\\tBook 1`,
    "",
  ];
  await writeFile(path, lines.join("\n"));
}

console.log("scaffolded New Magic 1A–6B + Graded Readers prep/L1–L12");
