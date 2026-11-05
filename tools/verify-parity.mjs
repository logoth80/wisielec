// Parity check for the browser port: `node tools/verify-parity.mjs`
//
// The expectations below are transcribed from logoth80/Hangman itself — the
// palette triples from load_color_theme(), the word counts and length buckets I
// measured by running the upstream load_dictionary() over the same files, the
// history.txt strings from reset_game(), and the score formula from the draw
// loop. js/hangman-core.js is loaded unmodified, so this exercises the exact
// code the browser runs.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = (...parts) => path.join(root, ...parts);
const core = require(at("js", "hangman-core.js"));

let failures = 0;
let checks = 0;
function ok(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log("  ok   " + label);
  } else {
    failures += 1;
    console.log("  FAIL " + label + (detail ? "\n       got: " + detail : ""));
  }
}
function group(name) {
  console.log("\n" + name);
}
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(label, a === e, a + " != " + e);
}

/* 1 ── the dictionaries on disk are the upstream ones, verbatim */
group("1  dictionaries: payload == .txt, filter == load_dictionary()");
for (const [file, key] of [
  ["pruned_polish", "polish"],
  ["pruned_english", "english"],
]) {
  const txt = readFileSync(at("dictionaries", file + ".txt"));
  require(at("dictionaries", file + ".js"));
  const payload = Buffer.from(globalThis.HM_DICT_RAW[key], "utf8");
  ok(file + ".js carries the byte-identical .txt", payload.equals(txt), payload.length + " vs " + txt.length + " bytes");

  const words = core.loadDictionary(payload.toString("utf8"));
  const buckets = new Map();
  for (const word of words) buckets.set(word.length, (buckets.get(word.length) || 0) + 1);
  console.log("  info " + file + ": " + words.length + " playable words, longest " + Math.max(...buckets.keys()));
}

// measured with the upstream Python over these same files
eq("playable Polish words", core.loadDictionary(readFileSync(at("dictionaries", "pruned_polish.txt"), "utf8")).length, 81835);
eq("playable English words", core.loadDictionary(readFileSync(at("dictionaries", "pruned_english.txt"), "utf8")).length, 272371);
const polishWords = core.loadDictionary(readFileSync(at("dictionaries", "pruned_polish.txt"), "utf8"));
const englishWords = core.loadDictionary(readFileSync(at("dictionaries", "pruned_english.txt"), "utf8"));
const bucketOf = (words, length) => words.filter((w) => w.length === length).length;
eq("Polish length buckets 5..9", [5, 6, 7, 8, 9].map((n) => bucketOf(polishWords, n)), [2991, 4767, 6861, 9408, 11640]);
eq("English length buckets 5..9", [5, 6, 7, 8, 9].map((n) => bucketOf(englishWords, n)), [12968, 23029, 34341, 42148, 42932]);
eq("first/last playable Polish words", [polishWords[0], polishWords.at(-1)], ["abakus", "żłóbek"]);
eq("first/last playable English words", [englishWords[0], englishWords.at(-1)], ["aasvogel", "zyzzyvas"]);
eq("language routing (anything not english falls back to polish)", [
  core.dictionaryFileFor("english"),
  core.dictionaryFileFor("polish"),
  core.dictionaryFileFor("deutsch"),
], ["pruned_english", "pruned_polish", "pruned_polish"]);

/* 2 ── load_dictionary() filter semantics */
group("2  filter: ';' split, 5..18 chars, reject ALL-CAPS");
const fixture = [
  "abcd",           // too short
  "ABCDE",          // ALL-CAPS
  "Abcdef",         // mixed case is kept, like Python's not word.isupper()
  "abcdefghij;klm", // parts[0] only
  "  spaced  ",     // line.strip()
  "12345",          // no cased character -> isupper() is False -> kept
  "ąęłńóśźżabcdefg", // diacritics are letters
  "a".repeat(19),   // too long
].join("\n");
eq("kept words", core.loadDictionary(fixture), ["Abcdef", "abcdefghij", "spaced", "12345", "ąęłńóśźżabcdefg"]);

/* 3 ── find_words(): the length index must match a full-file regex scan */
group("3  find_words() parity vs the upstream scan");
function upstreamFindWords(rawText, has, hasNot, length) {
  // a literal reading of find_words() from hangman.pyw: re.findall(r"\b\w+\b")
  // per line, an unanchored pattern built from the blanks, then the length test.
  // Python's \w is Unicode-aware, so the JS twin uses the Unicode classes.
  const temphas = has.replace(/_/g, ".");
  const disallowed = new Set(hasNot);
  const out = new Set();
  for (const line of rawText.split("\n")) {
    for (const match of line.matchAll(/[\p{L}\p{M}\p{N}\p{Pc}]+/gu)) {
      const word = match[0].toLowerCase();
      if (!new RegExp(temphas).test(word)) continue;
      if (word.length !== length) continue;
      if (Array.from(word).some((ch) => disallowed.has(ch))) continue;
      out.add(word);
    }
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b, "pl"));
}
const polishRaw = readFileSync(at("dictionaries", "pruned_polish.txt"), "utf8");
const englishRaw = readFileSync(at("dictionaries", "pruned_english.txt"), "utf8");
// what the browser shell builds: buckets over every token in the file
const polishIndex = core.indexByLength(core.tokenize(polishRaw));
const englishIndex = core.indexByLength(core.tokenize(englishRaw));

// exact answers measured by running the upstream Python over these same files
const answers = [
  ["pruned_polish", polishRaw, polishIndex, "____", "", 4, ["arte", "dell"]],
  ["pruned_polish", polishRaw, polishIndex, "p_ciąg__y", "xjuz", 9, ["pociągany", "pociągowy"]],
  ["pruned_polish", polishRaw, polishIndex, "w_s_c_", "bf", 6, ["wąsacz"]],
  ["pruned_polish", polishRaw, polishIndex, "sł_wo", "", 5, ["słowo"]],
  ["pruned_polish", polishRaw, polishIndex, "z_____ę", "qwx", 7, []],
  ["pruned_english", englishRaw, englishIndex, "h_l_c_pt_r", "", 10, ["helicopter"]],
  ["pruned_english", englishRaw, englishIndex, "_er_o_", "zqxj", 6, undefined],
];
for (const [file, raw, index, pattern, wrong, length, expected] of answers) {
  const reference = upstreamFindWords(raw, pattern, wrong, length);
  const got = core.findWords(index, pattern, new Set(wrong), length);
  eq(file + " " + JSON.stringify(pattern) + " len " + length, got, reference);
  if (expected) eq(file + " " + JSON.stringify(pattern) + " measured answer", got, expected);
}
{
  // the game path (F10) has to reach the same set as the standalone scan, using
  // the pattern the live board actually shows
  const game = new core.Game({
    words: core.loadDictionary(polishRaw),
    index: polishIndex,
    state: Object.assign(core.defaultState(), {
      language: "polish",
      current_word: "wąsacz",
      guessed_letters: ["w", "ą", "c"],
      correct_letters: ["w", "ą", "c"],
      bad_letters: ["b", "f"],
    }),
  });
  game.guess("b"); // one wrong letter is ruled out, exactly as on the desktop
  const pattern = game.evaluate().displayed;
  eq("F10 pattern comes from the board", [pattern, game.bad.has("b")], ["wą__c_", true]);
  eq(
    "F10 through the game matches the standalone scan",
    game.possibleWords(),
    upstreamFindWords(polishRaw, pattern, Array.from(game.bad).join(""), pattern.length),
  );
}

/* 4 ── themes: the 13 palettes of load_color_theme(), verbatim */
group("4  colour themes");
// copied line by line out of load_color_theme(t) in hangman.pyw
const UPSTREAM = {
  1: { hangman: [0, 104, 132], loss: [250, 157, 0], letter: [0, 104, 132], bg: [255, 208, 141] },
  2: { hangman: [12, 13, 13], loss: [254, 66, 63], letter: [2, 163, 136], bg: [220, 225, 225] },
  3: { hangman: [162, 110, 234], loss: [70, 183, 253], letter: [93, 112, 234], bg: [247, 175, 255] },
  4: { hangman: [104, 0, 33], loss: [147, 149, 152], letter: [0, 0, 0], bg: [255, 250, 236] },
  5: { hangman: [255, 250, 236], loss: [147, 149, 152], letter: [104, 0, 33], bg: [0, 0, 0] },
  6: { hangman: [200, 200, 200], loss: [247, 149, 152], letter: [220, 220, 220], bg: [0, 50, 65] },
  7: { hangman: [250, 240, 180], loss: [147, 255, 130], letter: [200, 220, 255], bg: [48, 83, 75] },
  8: { hangman: [254, 179, 38], loss: [232, 77, 138], letter: [100, 197, 235], bg: [127, 88, 175] },
  9: { hangman: [80, 163, 164], loss: [249, 83, 53], letter: [252, 175, 56], bg: [103, 74, 64] },
  10: { hangman: [58, 63, 88], loss: [249, 172, 103], letter: [238, 106, 89], bg: [236, 230, 205] },
  11: { hangman: [79, 63, 132], loss: [255, 102, 42], letter: [255, 162, 42], bg: [130, 172, 38] },
  12: { hangman: [202, 221, 100], loss: [250, 135, 113], letter: [128, 67, 114], bg: [247, 242, 218] },
  13: { hangman: [43, 106, 108], loss: [184, 13, 72], letter: [242, 151, 36], bg: [64, 64, 64] },
};
eq("all 13 palettes match the Python source", Object.keys(core.THEMES).map(Number).map((id) => ({
  id,
  hangman: core.THEMES[id].hangman,
  loss: core.THEMES[id].loss,
  letter: core.THEMES[id].letter,
  bg: core.THEMES[id].bg,
})), Object.keys(UPSTREAM).map(Number).map((id) => Object.assign({ id }, UPSTREAM[id])));
eq("unknown theme id falls back to palette 1", [core.colorTheme(99).id, core.colorTheme(0).id], [1, 1]);
eq("F3 cycle wraps 13 -> 1", [1, 2, 12, 13, 14].map(core.nextThemeId), [2, 3, 13, 1, 1]);
eq("RED is unchanged by the palette", core.FIXED.RED, [255, 0, 0]);

/* 5 ── the game: scoring, the ten-stage limit, reset_game(), history lines */
group("5  game rules");
function harness(options) {
  const saved = [];
  const sounds = [];
  const logs = [];
  const game = new core.Game({
    words: options.words,
    state: options.state,
    persist: (state) => saved.push(JSON.parse(JSON.stringify(state))),
    sound: (kind) => sounds.push(kind),
    log: (line) => logs.push(line),
    random: options.random || (() => 0),
  });
  return { game, saved, sounds, logs };
}

// a complete win on the default word: nine distinct letters, nine points
{
  const h = harness({ words: ["helicopter"], state: core.defaultState() });
  for (const letter of "helicopter") h.game.guess(letter);
  const shot = h.game.snapshot();
  eq("guessing every letter of helicopter", shot.guessed, ["c", "e", "h", "i", "l", "o", "p", "r", "t"]);
  eq("one point per correct letter", shot.score, 9);
  eq("no wrong guesses", shot.wrongGuesses, 0);
  eq("game flagged won", [shot.win, shot.loss, shot.gameOver], [true, false, true]);
  eq("high score tracks the running score", shot.highscore, 9);
  eq('win preview is "score - wrong + 45 - 2*len(word)"', shot.finalScore, 9 + 45 - 20);
  eq("beeps follow the desktop calls", h.sounds, Array(9).fill("correct"));
  h.game.restart();
  const after = h.game.snapshot();
  eq("restart banks the win bonus", [after.score, after.highscore], [34, 34]);
  eq("history.txt line for a won word", h.logs, ["helicopter"]);
  eq("new word is picked", after.word.join(""), "helicopter");
  eq("board is cleared", [after.guessed.length, after.wrongGuesses], [0, 0]);
}

// a loss: ten misses draw the whole figure and end the game
{
  const h = harness({ words: ["helicopter"], state: core.defaultState() });
  for (const letter of "abdfgkmnqu") h.game.guess(letter);
  const shot = h.game.snapshot();
  eq("ten misses are counted", shot.wrongGuesses, 10);
  eq("the gallows is fully drawn at stage 10", shot.wrongGuesses === core.MAX_WRONG_GUESSES, true);
  eq("loss ends the game and shows the score", [shot.loss, shot.showScore, shot.score], [true, true, 0]);
  h.game.guess("h");
  eq("input after game over is ignored", h.game.snapshot().guessed.length, 10);
  h.game.restart();
  eq("history.txt line for a lost game", h.logs, ["died at helicopter with 0 points"]);
  eq("a lost game leaves the score at zero", h.game.snapshot().score, 0);
}

// restarting mid-game zeroes the score, as upstream
{
  const h = harness({ words: ["helicopter"], state: core.defaultState() });
  h.game.guess("h");
  h.game.guess("z");
  h.game.restart();
  eq("mid-game restart logs the abort", h.logs, ["--------restarted on helicopter"]);
  eq("mid-game restart zeroes the score", h.game.snapshot().score, 0);
}

// input guards, straight from the KEYDOWN condition
{
  const h = harness({ words: ["krawiec"], state: core.defaultState() });
  eq("repeat guesses rejected", h.game.guess("k").accepted && !h.game.guess("k").accepted, true);
  eq("digits rejected", h.game.guess("7").accepted, false);
  eq("multi-char keys rejected", h.game.guess("ss").accepted, false);
  eq("Polish letters are accepted in any language", h.game.guess("ż").accepted, true);
  eq("upper case input is folded", h.game.guess("R").accepted, true);
  eq("guesses are counted per letter", h.game.snapshot().guessed, ["k", "r", "ż"]);
}

// the state is written after every key, like write_saved in the event loop
{
  const h = harness({
    words: ["ogrodzenie"],
    state: Object.assign(core.defaultState(), { current_word: "ogrodzenie" }),
  });
  h.game.guess("o");
  eq("state written on the first key", h.saved.at(-1).guessed_letters, ["o"]);
  h.game.guess("y");
  const after = h.saved.at(-1);
  eq("state written again on the next key", [after.guessed_letters, after.bad_letters, after.wrong_guesses, after.score], [["o", "y"], ["y"], 1, 1]);
  eq("a write carries the whole game, not just the letter", [after.current_word, after.language, after.theme], ["ogrodzenie", "english", 1]);
  const writes = h.saved.length;
  h.game.guess("y"); // already tried, so it is ignored and nothing is written
  eq("a rejected key changes nothing", [h.saved.length, h.saved.at(-1)], [writes, after]);
}

/* 6 ── saved.txt round-trip */
group("6  saved.txt compatibility");
const state = {
  highscore: 44,
  theme: 7,
  language: "polish",
  wrong_guesses: 3,
  score: 12,
  guessed_letters: ["a", "ż", "ó"],
  correct_letters: ["ó"],
  bad_letters: ["a", "ż"],
  current_word: "żaglownia",
};
eq("written exactly in the desktop format", core.formatSaved(state), [
  "highscore=44",
  "theme=7",
  "language='polish'",
  "wrong_guesses=3",
  "score=12",
  "guessed_letters={'a', 'ó', 'ż'}",
  "correct_letters={'ó'}",
  "current_word='żaglownia'",
  "bad_letters={'a', 'ż'}",
  "",
].join("\n"));
// bad_letters is derived at load time the same way the live game derives it
eq("reads back identically", core.formatSaved(core.parseSaved(core.formatSaved(state))), core.formatSaved(state));
eq("empty sets parse as empty", core.parseSaved("guessed_letters=set()\ncurrent_word='abcde'").guessed_letters, []);
eq("braces, brackets and quotes all parse", core.parseSaved('language="english"\nguessed_letters=[\'a\', "b"]\nhighscore=9').guessed_letters, ["a", "b"]);
eq("defaults match the file the desktop program creates", Object.keys(core.defaultState()), [
  "highscore", "theme", "language", "wrong_guesses", "score", "guessed_letters", "correct_letters", "bad_letters", "current_word",
]);
eq("a fresh game opens on helicopter", core.defaultState().current_word, "helicopter");

/* 7 ── Polish collation for the "tried letters" line */
group("7  sorting uses Polish rules (locale.strxfrm, pl_PL)");
eq("diacritics sort inside their base letter", core.sortLetters(["ż", "ź", "z", "ł", "l", "ą", "a"]), ["a", "ą", "l", "ł", "z", "ź", "ż"]);
eq("the full Polish alphabet order", core.sortLetters(Array.from(core.ALPHABET)).join(""), "aąbcćdeęfghijklłmnńoópqrsśtuvwxyzźż");

/* 8 ── the page actually references what exists */
group("8  page wiring");
const html = readFileSync(at("index.html"), "utf8");
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const sources = new Map();
const wanted = new Set();
for (const file of ["hangman-app.js", "hangman-view.js"]) {
  const source = readFileSync(at("js", file), "utf8");
  sources.set(file, source);
  for (const m of source.matchAll(/(?<![.$\w])get\("([^"]+)"\)/g)) wanted.add(m[1]);
}
for (let i = 1; i <= core.MAX_WRONG_GUESSES; i += 1) wanted.add("stage-" + i);
const missing = [...wanted].filter((id) => !ids.has(id));
ok("every element the scripts ask for is in index.html", missing.length === 0, "missing: " + missing.join(", "));
const gallows = [...html.matchAll(/<(line|circle)\s+([^>]+?)\s*\/>/g)].map((m) => m[1] + " " + m[2].replace(/"/g, ""));
ok("all ten drawing stages are present", gallows.length === 10, "found " + gallows.length);
eq("gallows coordinates are the ones from draw_hangman()", gallows, [
  "line x1=10 y1=370 x2=190 y2=370",
  "line x1=100 y1=60 x2=100 y2=370",
  "line x1=200 y1=60 x2=100 y2=60",
  "line x1=200 y1=60 x2=200 y2=110",
  "circle cx=200 cy=135 r=25",
  "line x1=200 y1=160 x2=200 y2=230",
  "line x1=200 y1=170 x2=170 y2=230",
  "line x1=200 y1=170 x2=230 y2=230",
  "line x1=200 y1=230 x2=170 y2=310",
  "line x1=200 y1=230 x2=230 y2=310",
]);
eq("no ES modules, so index.html opens from the filesystem", /<script[^>]+type="module"/.test(html), false);
ok("every script is a plain classic script", (html.match(/<script src=/g) || []).length === 3);

/* 9 ── the interface rules this port is asked to keep */
group("9  the word owns the page: it fills the space it is given, and so does nothing else");
const viewSource = sources.get("hangman-view.js");
const appSource = sources.get("hangman-app.js");
const css = readFileSync(at("styles.css"), "utf8");
ok(
  "the keyboard marks a played letter in one state only",
  !/classList\.(add|remove|toggle)\("(hit|miss)"/.test(viewSource) &&
    /classList\.toggle\("used"/.test(viewSource),
);
ok(
  "one greyed style for used keys, whether the letter was in the word or not",
  !/\.key\.(hit|miss)\s*[,{]/.test(css) && /\.key\.used\s*\{/.test(css),
);
ok(
  "the word is scaled to the space the page has, for the word on the board",
  /function fitWord\(count\)/.test(viewSource) &&
    /byWidth[\s\S]*?byHeight[\s\S]*?Math\.min\(MAX_PITCH/.test(viewSource),
);
ok(
  "the size comes from the word being played, not from the dictionary's longest",
  /fitWord\(letters\.length\)/.test(viewSource) &&
    !/longestWord|setMaxWordLength/.test(viewSource + appSource),
);
// The pictogram chips are controls in fixed boxes, not readable text, so their glyph
// sizes are not part of "nothing may outsize the word": the phone block sizes those
// boxes 46 px on purpose, and the note pictogram needs a large font to read at the
// same visual size as the keyboard one. Everything that is text is still measured.
const textCss = css.replace(/[^{}]*\.chip\.icon[\w-]*[^{}]*\{[^}]*\}/g, "");
const fixedText = [...textCss.matchAll(/font-size:\s*([^;]+);/g)]
  .map((match) => match[1])
  // the word's size is a custom property written by the script, so it is not fixed CSS
  .filter((value) => !value.includes("--"))
  .flatMap((value) => [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => parseFloat(m[1])));
ok(
  "every readable text on the page stays smaller than the word (no fixed size above 24px outside the pictogram chips)",
  Math.max(0, ...fixedText) <= 24,
  "found " + Math.max(0, ...fixedText) + "px",
);
ok(
  "a desktop keyboard, when asked for, is sized for a hand — large letters at a normal weight",
  /@media \(min-width: 901px\)[\s\S]*?\.key\s*\{[^}]*height:\s*clamp\(5[0-9]px\s*,\s*8dvh\s*,\s*6[0-9]px[^}]*font-size:\s*24px[^}]*font-weight:\s*400/.test(css),
);
ok(
  "the drawing takes the room the page has rather than being made smaller for the keyboard",
  /@media \(min-width: 901px\)[\s\S]*?\.board\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/.test(css) &&
    /@media \(min-width: 901px\)[\s\S]*?\.gallows\s*\{[^}]*height:\s*100%/.test(css) &&
    !/body\[data-kbd="on"\]\s*\.gallows/.test(css),
);
ok(
  "the letters you tried are sized against the word they belong to, and set below it",
  /\.tried\s*\{[^}]*font-size:\s*max\(1[0-9]px,\s*calc\(var\(--letter-size\)\s*\*\s*0\.[5-8]\)\)/.test(css) &&
    /\.tried\s*\{[^}]*margin-top:\s*clamp\(1[0-9]px/.test(css) &&
    /const styles = area \|\| host;[\s\S]*styles\.style\.setProperty\("--letter-size"/.test(viewSource) &&
    !/host\.style\.setProperty\("--letter-size"/.test(viewSource),
);
ok(
  "the sound chip carries the same on-state as the keyboard chip",
  /function setSoundOn\(on\)[\s\S]*?classList\.toggle\("on"/.test(appSource) &&
    /setSoundOn\(prefs\.sound\)/.test(appSource) &&
    !/classList\.toggle\("off"/.test(appSource),
);
ok(
  "the note pictogram is set larger than the other icons on a phone, so it reads alike",
  /\.chip\.icon-note\s*\{[^}]*font-size:\s*(2[5-9]|3[0-9])px/.test(css),
);
ok(
  "the letter size is measured against the widest glyph, so the slots keep their spacing",
  /measureText/.test(viewSource) && !/1\.22/.test(viewSource),
);
ok(
  "the word is drawn at a normal weight, not a heavy one",
  /\.cell \.glyph\s*\{[^}]*font-weight:\s*400/.test(css),
);
ok(
  "a placed letter replaces its _: the bar of a solved slot is gone",
  /\.cell\.solved::after\s*\{\s*opacity:\s*0/.test(css),
);
ok(
  "every control and the score sit in the top bar, the F2 button first; no footer, no hint text",
  /<header class="hud">[\s\S]*?class="controls"[\s\S]*?id="btn-language"[\s\S]*?id="btn-theme"[\s\S]*?class="status"[\s\S]*?<\/header>/.test(html) &&
    !/<footer/.test(html) &&
    !/class="hint"/.test(html),
);
ok(
  "the on-screen keyboard takes over the list of used letters when it is shown",
  /body\[data-kbd="on"\] \.tried/.test(css) && /body\[data-kbd="auto"\] \.tried/.test(css),
);
ok(
  "no restart control anywhere: no F5, no Esc, no new-game button",
  !/key === "F5"/.test(appSource) && !/key === "Escape"/.test(appSource) && !/id="btn-new"/.test(html),
);
ok(
  "a letter that was in the word gets the high short beep, a miss the low long one",
  /BEEPS = \{ correct: \[800, 70\], wrong: \[300, 100\] \}/.test(viewSource),
);
ok(
  "on touch the end-of-word message keeps no Space or F1 hint",
  /matchMedia\("\(pointer: coarse\)"\)/.test(viewSource) &&
    /touch \? "Great!"/.test(viewSource) &&
    /touch \? "\." : "\. \(F1\)"/.test(viewSource),
);
ok(
  "a phone gets press-sized controls and a Continue button meant to be tapped",
  /\.chip\.icon\s*\{[^}]*min-height:\s*4[6-9]px[^}]*font-size:\s*2[0-9]px/.test(css) &&
    /\.chip-continue\s*\{[^}]*min-height:\s*5[0-9]px/.test(css),
);
ok(
  "the word finder has no button at all: F10 opens it, and the Keys panel is where that is written",
  !/btn-find/.test(html) && !/btn-find/.test(appSource) &&
    /if \(key === "F10"\) \{[\s\S]{0,80}possibleWords\(\);/.test(appSource) &&
    /<th>F10<\/th>/.test(html),
);

console.log(
  "\n" + (failures ? "FAILED " + failures + " of " + checks + " checks" : "all good: " + checks + " checks passed"),
);
process.exit(failures ? 1 : 0);
