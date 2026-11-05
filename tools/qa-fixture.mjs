// tools/qa-fixture.mjs — throwaway pages for screenshot QA, not part of the game.
//
// Each page is index.html with a save seeded into localStorage before the game
// scripts load, so a headless browser can be pointed straight at a board in a
// given situation:
//
//   node tools/qa-fixture.mjs mid lost win kbd   ->  _qa_mid.html _qa_lost.html …
//
// A name ending in -touch is the same board with a coarse primary pointer, which is
// the only way to reach the phone message path from a desktop browser.
//
// The states below are built from real dictionary entries, and their scores are
// what the port's own rules produce (score + 45 - 2*len(word) on a win).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const word = "azotujący"; // a 9-letter entry in pruned_polish.txt
const distinct = Array.from(new Set(word));

// three letters found, three missed: a part-drawn gallows and a half-open word
const mid = {
  highscore: 44,
  theme: 1,
  language: "polish",
  wrong_guesses: 3,
  score: 3,
  guessed_letters: ["a", "e", "k", "r", "t", "z"],
  correct_letters: ["a", "t", "z"],
  bad_letters: ["e", "k", "r"],
  current_word: word,
};

const STATES = {
  mid,
  // the same board, asked for the on-screen keyboard: used letters are greyed out
  kbd: { ...mid, prefs: { keyboard: "on", sound: false } },
  // ten misses: the whole figure, the loss line and the score read-out
  lost: {
    highscore: 44,
    theme: 1,
    language: "polish",
    wrong_guesses: 10,
    score: 0,
    guessed_letters: ["e", "k", "r", "s", "m", "w", "h", "q", "v", "x"],
    correct_letters: [],
    bad_letters: ["e", "k", "r", "s", "m", "w", "h", "q", "v", "x"],
    current_word: word,
  },
  // every letter of the word: the win line and its bonus
  win: {
    highscore: 44,
    theme: 1,
    language: "polish",
    wrong_guesses: 0,
    score: distinct.length,
    guessed_letters: distinct,
    correct_letters: distinct,
    bad_letters: [],
    current_word: word,
  },
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : ["mid", "lost", "win"];
const html = readFileSync(path.join(root, "index.html"), "utf8");
const marker = '    <script src="js/hangman-core.js"></script>';
if (!html.includes(marker)) {
  console.error("could not find the script block to seed");
  process.exit(1);
}

// A name ending in "-touch" is the same board on a device whose primary pointer is
// coarse. Headless desktop Chrome/Edge always reports "fine" whatever the window
// size, so the stub is what lets the phone message path — no "Space to continue",
// no "(F1)" — be screenshotted at all. Queries other than the one the game asks
// about are passed through to the real matchMedia.
const TOUCH_STUB = [
  "    <script>",
  "      // seeded by tools/qa-fixture.mjs: pretend the primary pointer is coarse",
  "      (function () {",
  "        const real = window.matchMedia.bind(window);",
  "        window.matchMedia = function (query) {",
  '          if (query === "(pointer: coarse)") {',
  "            return { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {} };",
  "          }",
  "          return real(query);",
  "        };",
  "      })();",
  "    </script>",
].join("\n");

for (const name of names) {
  const base = name.replace(/-touch$/, "");
  const state = STATES[base];
  if (!state) {
    console.error("no such fixture: " + base + " (known: " + Object.keys(STATES).join(", ") + ")");
    continue;
  }
  const { prefs, ...saved } = state;
  // every fixture states the keyboard preference, so a shared browser profile can
  // never leak one shot's setting into another: "auto" means the desktop shots
  // have no keyboard and the phone shots get one
  const wantPrefs = prefs || { keyboard: "auto", sound: false };
  const seed =
    (name === base ? [] : [TOUCH_STUB + "\n"])
      .concat([
        "    <script>",
        "      // seeded by tools/qa-fixture.mjs for headless screenshots",
        '      localStorage.setItem("hangman.saved.v1", ' + JSON.stringify(JSON.stringify(saved)) + ");",
        '      localStorage.setItem("hangman.prefs.v1", ' + JSON.stringify(JSON.stringify(wantPrefs)) + ");",
        "    </script>",
        marker,
      ])
      .join("\n") + "\n";
  const out = path.join(root, "_qa_" + name + ".html");
  writeFileSync(out, html.replace(marker, seed), "utf8");
  console.log(
    "wrote " + path.relative(root, out) + " (theme " + state.theme + ", " + base +
      (name === base ? "" : ", coarse pointer") + ")",
  );
}
