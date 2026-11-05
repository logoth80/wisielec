/* hangman-core.js — rules engine for the browser port of logoth80/Hangman.
 *
 * Every constant, formula and state transition below is a translation of the
 * desktop program (hangman.pyw), kept deliberately literal:
 *
 *   ALPHABET              <- the letter filter in the KEYDOWN branch
 *   MAX_WRONG_GUESSES =10 <- max_wrong_guesses, also the 10-stage gallows draw
 *   THEMES                <- load_color_theme(t), all 13 palettes verbatim
 *   loadDictionary()      <- load_dictionary(): split(";", take [0], drop
 *                            ALL-CAPS words, keep 5..18 characters
 *   findWords()           <- find_words(): "_" -> ".", drop words containing a
 *                            wrong letter, require the same length
 *   winPreview()          <- "Your score: {score - wrong + 45 - 2 * len(word)}"
 *   restart()             <- reset_game(), including its three branches and the
 *                            history.txt lines
 *   state keys            <- saved.txt: highscore, theme, language,
 *                            wrong_guesses, score, guessed_letters,
 *                            correct_letters, current_word, bad_letters
 *
 * No DOM, no timers, no fetch: the browser shell (js/hangman-app.js) supplies
 * persistence, sound and rendering, which also lets tools/verify-parity.mjs
 * drive this exact file from Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HM = Object.assign({}, root.HM, { core: api });
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // pygame: `letter in "aąbcćdeęfghijklłmnńoópqrsśtuvwxyzżź"` — the accepted
  // alphabet is identical in both languages, diacritics included.
  const ALPHABET = "aąbcćdeęfghijklłmnńoópqrsśtuvwxyzżź";
  const POLISH_EXTRA = "ąćęłńóśźż";
  const MAX_WRONG_GUESSES = 10;

  // pygame's fixed palette constants; only RED is used in the UI (score that
  // equals the high score).
  const FIXED = {
    WHITE: [255, 255, 255],
    BLACK: [0, 0, 0],
    BLUE: [0, 0, 255],
    GREEN: [0, 255, 0],
    RED: [255, 0, 0],
    GREY: [120, 120, 120],
  };

  // load_color_theme(t). Palettes are the verbatim RGB triples; theme 1 is the
  // default and also the fallback for any unknown id.
  const THEMES = {
    1: { label: "amber", hangman: [0, 104, 132], loss: [250, 157, 0], letter: [0, 104, 132], bg: [255, 208, 141] },
    2: { label: "mint", hangman: [12, 13, 13], loss: [254, 66, 63], letter: [2, 163, 136], bg: [220, 225, 225] },
    3: { label: "violet", hangman: [162, 110, 234], loss: [70, 183, 253], letter: [93, 112, 234], bg: [247, 175, 255] },
    4: { label: "wine", hangman: [104, 0, 33], loss: [147, 149, 152], letter: [0, 0, 0], bg: [255, 250, 236] },
    5: { label: "ink", hangman: [255, 250, 236], loss: [147, 149, 152], letter: [104, 0, 33], bg: [0, 0, 0] },
    6: { label: "petrol", hangman: [200, 200, 200], loss: [247, 149, 152], letter: [220, 220, 220], bg: [0, 50, 65] },
    7: { label: "moss", hangman: [250, 240, 180], loss: [147, 255, 130], letter: [200, 220, 255], bg: [48, 83, 75] },
    8: { label: "grape", hangman: [254, 179, 38], loss: [232, 77, 138], letter: [100, 197, 235], bg: [127, 88, 175] },
    9: { label: "clay", hangman: [80, 163, 164], loss: [249, 83, 53], letter: [252, 175, 56], bg: [103, 74, 64] },
    10: { label: "sand", hangman: [58, 63, 88], loss: [249, 172, 103], letter: [238, 106, 89], bg: [236, 230, 205] },
    11: { label: "olive", hangman: [79, 63, 132], loss: [255, 102, 42], letter: [255, 162, 42], bg: [130, 172, 38] },
    12: { label: "plum", hangman: [202, 221, 100], loss: [250, 135, 113], letter: [128, 67, 114], bg: [247, 242, 218] },
    13: { label: "slate", hangman: [43, 106, 108], loss: [184, 13, 72], letter: [242, 151, 36], bg: [64, 64, 64] },
  };
  const THEME_COUNT = Object.keys(THEMES).length;

  // `else: theme = 1` — an unknown id resolves to palette 1 and rewrites the
  // stored theme, which is what makes F3 wrap 13 -> 1.
  function colorTheme(id) {
    const found = THEMES[id];
    if (!found) return Object.assign({ id: 1 }, THEMES[1]);
    return Object.assign({ id }, found);
  }
  function nextThemeId(id) {
    return colorTheme(Number(id) + 1).id;
  }

  function isGuessable(letter) {
    return typeof letter === "string" && letter.length === 1 && ALPHABET.indexOf(letter) !== -1;
  }

  // Polish collation, matching locale.setlocale(locale.LC_COLLATE, "pl_PL.UTF-8")
  // + sorted(key=locale.strxfrm) used for the "tried letters" line.
  function sortLetters(letters) {
    return Array.from(new Set(letters)).sort((a, b) => String(a).localeCompare(String(b), "pl"));
  }

  // str.isupper(): at least one cased character and every cased character is
  // upper case. Used verbatim because load_dictionary rejects those words.
  function isAllUpperCase(word) {
    let cased = false;
    for (const ch of String(word)) {
      const upper = ch.toUpperCase();
      const lower = ch.toLowerCase();
      if (upper !== lower) {
        cased = true;
        if (ch !== upper) return false;
      }
    }
    return cased;
  }

  // load_dictionary(): one word per line, `parts = line.strip().split(";")`,
  // keep parts[0] when it is not ALL-CAPS and 5 <= len <= 18.
  function loadDictionary(rawText) {
    const words = [];
    for (const line of String(rawText).split("\n")) {
      const word = line.trim().split(";")[0];
      if (!isAllUpperCase(word) && word.length >= 5 && word.length <= 18) words.push(word);
    }
    return words;
  }

  // Length index for find_words(): the desktop scan walks the whole file and
  // then rejects on len(word); bucketing by length is the same filter, just
  // without touching 272k words for every F10.
  function indexByLength(words) {
    const index = new Map();
    for (const word of words) {
      const key = word.toLowerCase();
      const length = key.length;
      const bucket = index.get(length);
      if (bucket) bucket.push(key);
      else index.set(length, [key]);
    }
    return index;
  }

  // find_words() does not use the filtered word list: it re-reads the file with
  // re.findall(r"\b\w+\b", line) and only applies its own length test. Tokenizing
  // the same way keeps F10 identical to the desktop even for lengths outside the
  // 5..18 band that load_dictionary() keeps.
  function tokenize(rawText) {
    const found = String(rawText).match(/[\p{L}\p{M}\p{N}\p{Pc}]+/gu);
    return (found || []).map((word) => word.toLowerCase());
  }

  function escapeForRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // find_words(): `temphas = has.replace("_", ".")`, then a word is kept when
  // it has the requested length and shares no letter with the wrong guesses.
  // The desktop search is unanchored, which is equivalent to anchoring once the
  // lengths are equal, so the pattern is anchored here.
  function findWords(index, pattern, wrongLetters, length) {
    const candidates = index.get(Number(length)) || [];
    const body = Array.from(String(pattern))
      .map((ch) => (ch === "_" ? "." : escapeForRegExp(ch)))
      .join("");
    const re = new RegExp("^" + body + "$");
    const wrong = wrongLetters instanceof Set ? wrongLetters : new Set(String(wrongLetters || ""));
    const hits = [];
    for (const word of candidates) {
      if (!re.test(word)) continue;
      let excluded = false;
      for (const ch of word) {
        if (wrong.has(ch)) {
          excluded = true;
          break;
        }
      }
      if (!excluded) hits.push(word);
    }
    return hits.sort((a, b) => a.localeCompare(b, "pl"));
  }

  function displayedWord(word, guessed) {
    return Array.from(String(word || ""))
      .map((letter) => (guessed.has(letter) ? letter : "_"))
      .join("");
  }

  // "Your score: {score - wrong_guesses + 45 - 2 * len(current_word)}"
  function winPreview(score, wrongGuesses, word) {
    return score - wrongGuesses + 45 - 2 * String(word || "").length;
  }

  // explain_word(): the desktop program opens a Google query in the user's
  // browser; the phrase stays Polish exactly as upstream, in both languages.
  function explainUrl(word) {
    return "https://www.google.com/search?q=co+to+jest+" + encodeURIComponent(String(word || ""));
  }

  function dictionaryFileFor(language) {
    // load_dictionary() falls back to pruned_polish.txt for anything that is
    // not exactly "english".
    return language === "english" ? "pruned_english" : "pruned_polish";
  }

  // The defaults written into saved.txt on first run. A fresh game therefore
  // opens on "helicopter", exactly like the desktop build.
  function defaultState() {
    return {
      highscore: 0,
      theme: 1,
      language: "english",
      wrong_guesses: 0,
      score: 0,
      guessed_letters: [],
      correct_letters: [],
      bad_letters: [],
      current_word: "helicopter",
    };
  }

  /* ------------------------------------------------------------------ interface
   *
   * The desktop program's own on-screen text is English whatever the dictionary,
   * because its strings are hard-coded literals ("score:", "Game Over! The word
   * was ..."). A browser page in Polish settings reading English is something else
   * again: here the interface follows the language you are playing in, while the
   * rules, the saved record and the history lines stay exactly as upstream wrote
   * them. {braces} are filled in by t(); keys are shared by both tables.
   */
  const UI_HTML_LANG = { english: "en", polish: "pl" };

  const STRINGS = {
    english: {
      pageTitle: "Wisielec — Hangman",
      "lang.name.polish": "polish",
      "lang.name.english": "english",
      "btn.theme": "F3 theme",
      "btn.explain": "F1 explain",
      "title.language": "switch the dictionary",
      "title.theme": "F3 — next palette (13 of them)",
      "title.explain": "F1 — explain the word",
      "title.keyboard": "on-screen keyboard: {mode}",
      "title.sound": "sound: {state}",
      "title.help": "keys and notes",
      "title.close": "close",
      "mode.auto": "auto",
      "mode.on": "on",
      "mode.off": "off",
      "state.on": "on",
      "state.off": "off",
      "status.score": "score: {n}",
      "status.highscore": "high score: {n}",
      "msg.win": "Great!   Space to continue... (F1)",
      "msg.winTouch": "Great!",
      "msg.loss": "Game Over! The word was {word}.",
      "msg.f1": " (F1)",
      "msg.score": "Your score: {n}",
      "msg.continue": "Continue",
      "aria.word": "word",
      "aria.tried": "letters already tried",
      "aria.keyboard": "on-screen keyboard",
      "aria.letter": "letter {letter}",
      "tab.keys": "Keys",
      "tab.find": "Word finder",
      "tab.data": "Saved data",
      "help.letters.head": "a–z, ą ć ę ł ń ó ś ź ż",
      "help.letters.text":
        "a guess. Repeats, out-of-alphabet keys and input after the game ended are ignored, exactly as in the desktop build.",
      "help.lang.head": "language button",
      "help.lang.text":
        "switch dictionary English ⇄ Polish, by clicking it only — there is no key for it. It reloads the word list and starts a new word, which is what the desktop F2 did.",
      "help.f3.text": "next colour theme — the same 13 palettes, wrapping 13 → 1.",
      "help.newgame.head": "New game",
      "help.newgame.text":
        "there is none: a word is played to the end, won or lost. When it is over, Space or Enter deals the next one; reloading the page resumes the word in progress instead.",
      "help.space.head": "Space / Enter",
      "help.space.text": "next word, but only once the game is over.",
      "help.f1.text":
        "open “co to jest <word>” in a search tab — available when the game is over.",
      "help.f10.text":
        "count the dictionary words that still match the pattern and rule out the misses.",
      "help.notes": "Notes",
      "note.letters.html":
        "Polish letters are separate letters: <code>ą</code> is never revealed by guessing <code>a</code>. That is how the desktop version behaves, so the on-screen keyboard gains a row of ą ć ę ł ń ó ś ź ż while the Polish dictionary is active.",
      "note.state.html":
        "The state is written after every key press — reload the page, lock the phone, come back, and the word, letters, stage and score are where you left them.",
      "note.dicts.html":
        "The dictionaries are the unmodified upstream files (82 155 Polish / 272 372 English lines; 81 835 / 272 371 playable after the original 5–18-character filter).",
      "note.files.html":
        "Opening <code>index.html</code> directly works; serving the folder over http(s) just lets the page read the <code>.txt</code> files instead of their generated <code>.js</code> twins.",
      "find.note.html":
        "The pattern is the word as it currently stands; wrong letters are excluded — the same query as F10 and <code>list_words.py</code>.",
      "find.checking": "checking <{pattern}> without {letters} …",
      "find.found": "found {n} possible words for length {length}",
      "find.none": "No word in this dictionary matches the letters you have ruled out.",
      "find.tooMany": "Too many results to display. Please refine your search criteria.",
      "data.note.html":
        "saved.txt in the desktop format, so a browser save and a desktop save can be exchanged.",
      "data.apply": "Load this state",
      "data.export": "Download saved.txt",
      "data.file": "Read saved.txt",
      "data.exportHistory": "Download history.txt",
      "data.reset": "Erase saved game",
      "data.entries": "{n} entries kept in this browser (history.txt equivalent)",
      "busy.loading": "loading {file} dictionary…",
      "busy.failed": "dictionary could not be loaded: {message}",
    },
    polish: {
      pageTitle: "Wisielec — gra w wisielca",
      "lang.name.polish": "polski",
      "lang.name.english": "angielski",
      "btn.theme": "F3 motyw",
      "btn.explain": "F1 wyjaśnij",
      "title.language": "zmień słownik",
      "title.theme": "F3 — następna kolorystyka (jest ich 13)",
      "title.explain": "F1 — wyjaśnij hasło",
      "title.keyboard": "klawiatura ekranowa: {mode}",
      "title.sound": "dźwięk: {state}",
      "title.help": "klawisze i uwagi",
      "title.close": "zamknij",
      "mode.auto": "auto",
      "mode.on": "włączona",
      "mode.off": "wyłączona",
      "state.on": "włączony",
      "state.off": "wyłączony",
      "status.score": "wynik: {n}",
      "status.highscore": "rekord: {n}",
      "msg.win": "Brawo!   Spacja, aby zagrać dalej… (F1)",
      "msg.winTouch": "Brawo!",
      "msg.loss": "Koniec gry! Hasło brzmiało: {word}.",
      "msg.f1": " (F1)",
      "msg.score": "Twój wynik: {n}",
      "msg.continue": "Dalej",
      "aria.word": "hasło",
      "aria.tried": "litery, które już sprawdziłeś",
      "aria.keyboard": "klawiatura ekranowa",
      "aria.letter": "litera {letter}",
      "tab.keys": "Klawisze",
      "tab.find": "Znajdź słowa",
      "tab.data": "Zapisane dane",
      "help.letters.head": "a–z, ą ć ę ł ń ó ś ź ż",
      "help.letters.text":
        "strzał. Powtórki, klawisze spoza alfabetu i znaki wpisywane po zakończeniu gry są pomijane — dokładnie tak jak w wersji desktopowej.",
      "help.lang.head": "przycisk języka",
      "help.lang.text":
        "zmienia słownik: angielski ⇄ polski — tylko po kliknięciu, żaden klawisz tego nie robi. Lista słów wczytuje się od nowa i zaczyna nowe hasło, tak jak w wersji desktopowej robił to F2.",
      "help.f3.text": "następna kolorystyka — te same 13 palet, po trzynastej znowu pierwsza.",
      "help.newgame.head": "Nowa gra",
      "help.newgame.text":
        "nie ma takiej: hasło gra się do końca — wygrywa się lub przegrywa. Po zakończeniu spacja albo Enter losuje następne; odświeżenie strony wznawia grę toczonego właśnie hasła.",
      "help.space.head": "Spacja / Enter",
      "help.space.text": "następne hasło, ale dopiero wtedy, gdy gra jest zakończona.",
      "help.f1.text":
        "otwiera „co to jest <hasło>” w nowej karcie wyszukiwarki — dostępne po zakończeniu gry.",
      "help.f10.text":
        "liczy słowa ze słownika, które nadal pasują do wzoru i nie zawierają przestrzelonych liter.",
      "help.notes": "Uwagi",
      "note.letters.html":
        "Polskie litery są osobnymi literami: wpisanie <code>a</code> nigdy nie odsłoni <code>ą</code>. Tak właśnie zachowuje się wersja desktopowa, dlatego przy polskim słowniku klawiatura ekranowa dostaje rząd ą ć ę ł ń ó ś ź ż.",
      "note.state.html":
        "Stan zapisuje się po każdym naciśnięciu klawisza — odśwież stronę, zablokuj telefon, wróć, a hasło, litery, szubienica i wynik będą dokładnie tam, gdzie je zostawiłeś.",
      "note.dicts.html":
        "Słowniki to niezmienione pliki oryginału (82 155 linii polskich / 272 372 angielskich; 81 835 / 272 371 nadających się po oryginalnym filtrze długości 5–18 znaków).",
      "note.files.html":
        "Otwarcie <code>index.html</code> wprost działa; wystawienie katalogu przez http(s) pozwala tylko wczytać pliki <code>.txt</code> zamiast ich wygenerowanych bliźniaków <code>.js</code>.",
      "find.note.html":
        "Wzór to hasło dokładnie w takim stanie, w jakim jest teraz; przestrzelone litery są wykluczane — to samo zapytanie co F10 i <code>list_words.py</code>.",
      "find.checking": "szukam <{pattern}> bez {letters}…",
      "find.found": "znaleziono {n} możliwych słów długości {length}",
      "find.none": "Żadne słowo z tego słownika nie pasuje do liter, które odrzuciłeś.",
      "find.tooMany": "Zbyt wiele wyników, aby je wszystkie wyświetlić. Zawęź kryteria.",
      "data.note.html":
        "saved.txt w formacie desktopowym — zapis z przeglądarki i zapis z desktopu można wymieniać między sobą.",
      "data.apply": "Wczytaj ten stan",
      "data.export": "Pobierz saved.txt",
      "data.file": "Odczytaj saved.txt",
      "data.exportHistory": "Pobierz history.txt",
      "data.reset": "Skasuj zapisaną grę",
      "data.entries": "{n} wpisów zapisanych w tej przeglądarce (odpowiednik history.txt)",
      "busy.loading": "wczytuję słownik {file}…",
      "busy.failed": "nie udało się wczytać słownika: {message}",
    },
  };

  function uiLanguage(language) {
    return language === "polish" ? "polish" : "english";
  }

  // t(key, values): the interface text for the language being played. A missing key
  // falls back to English rather than showing the key, so a typo degrades to a
  // working page instead of a wall of identifiers.
  function stringsFor(language) {
    const table = STRINGS[uiLanguage(language)];
    const base = STRINGS.english;
    return function t(key, values) {
      const raw = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : base[key];
      if (raw == null) return key;
      return String(raw).replace(/\{(\w+)\}/g, function (whole, name) {
        return values && values[name] != null ? String(values[name]) : "";
      });
    };
  }

  function toInt(value, fallback) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? n : fallback;
  }

  function toLetters(value) {
    if (value == null) return [];
    const list = Array.isArray(value) ? value : Array.from(String(value));
    return sortLetters(list.map((letter) => String(letter).toLowerCase()).filter(isGuessable));
  }

  function normalizeState(saved) {
    const base = defaultState();
    const state = Object.assign(base, saved && typeof saved === "object" ? saved : {});
    state.highscore = toInt(state.highscore, 0);
    state.score = toInt(state.score, 0);
    state.wrong_guesses = toInt(state.wrong_guesses, 0);
    state.theme = toInt(state.theme, 1);
    state.language = state.language == null ? base.language : String(state.language);
    state.current_word = state.current_word == null ? base.current_word : String(state.current_word);
    state.guessed_letters = toLetters(state.guessed_letters);
    state.correct_letters = toLetters(state.correct_letters);
    state.bad_letters = toLetters(state.bad_letters);
    return state;
  }

  function unquotePythonString(text) {
    const quote = text[0];
    if ((quote === "'" || quote === '"') && text.length > 1 && text[text.length - 1] === quote) {
      return text.slice(1, -1).replace(/\\(.)/g, "$1");
    }
    return text;
  }

  // read_saved() interprets values with eval(); this covers the literals that
  // write_saved can produce: ints, quoted strings, set(), {'a', 'b'}, [...].
  function evalPythonLiteral(raw) {
    const text = String(raw).trim();
    if (text === "" || text === "set()" || text === "{}" || text === "[]") return [];
    if (text[0] === "{" || text[0] === "[") {
      const inner = text.slice(1, -1).trim();
      if (!inner) return [];
      return inner
        .split(",")
        .map((piece) => unquotePythonString(piece.trim()))
        .filter((piece) => piece !== "");
    }
    if (/^-?\d+$/.test(text)) return Number(text);
    if (text === "True") return true;
    if (text === "False") return false;
    return unquotePythonString(text);
  }

  // read_saved(): `k, v = line.split("=", 1)`
  function parseSaved(text) {
    const state = defaultState();
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim()) continue;
      const split = line.indexOf("=");
      if (split === -1) continue;
      const key = line.slice(0, split).trim();
      const value = evalPythonLiteral(line.slice(split + 1));
      if (key === "guessed_letters" || key === "correct_letters" || key === "bad_letters") {
        state[key] = toLetters(value);
      } else if (key in state) {
        state[key] = value;
      }
    }
    return normalizeState(state);
  }

  function pythonRepr(value) {
    return "'" + String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  }
  function pythonSetRepr(values) {
    const letters = toLetters(values);
    return letters.length ? "{" + letters.map(pythonRepr).join(", ") + "}" : "set()";
  }

  // write_saved(): `f"{key}={repr(value)}"`, so the exported file is readable
  // by the desktop hangman.pyw without changes.
  function formatSaved(state) {
    const s = normalizeState(state);
    return [
      `highscore=${s.highscore}`,
      `theme=${s.theme}`,
      `language=${pythonRepr(s.language)}`,
      `wrong_guesses=${s.wrong_guesses}`,
      `score=${s.score}`,
      `guessed_letters=${pythonSetRepr(s.guessed_letters)}`,
      `correct_letters=${pythonSetRepr(s.correct_letters)}`,
      `current_word=${pythonRepr(s.current_word)}`,
      `bad_letters=${pythonSetRepr(s.bad_letters)}`,
      "",
    ].join("\n");
  }

  /* ------------------------------------------------------------------ game */

  // Game owns the live rules. Persistence, sound and the word log are injected,
  // which is how the desktop behaviour (write_saved after every key, winsound
  // beeps, history.txt) is reproduced without the rules knowing about a browser.
  function Game(options) {
    const opts = options || {};
    this.persist = opts.persist || function () {};
    this.sound = opts.sound || function () {};
    this.log = opts.log || function () {};
    this.random = opts.random || Math.random;
    this.setDictionary(opts.words || [], opts.index);
    this.state = normalizeState(opts.state);
    this.guessed = new Set(this.state.guessed_letters);
    this.correct = new Set(this.state.correct_letters);
    this.bad = new Set(this.state.bad_letters);
    // show_score is set once a game is lost and is never reset upstream either,
    // so the final score line stays visible for later losses as well.
    this.showScore = false;
    this.gameOver = false;
    this.win = false;
    this.loss = false;
    this.evaluate();
  }

  // words: the list the next word is picked from (the load_dictionary() result).
  // index: optional length buckets for find_words(); the browser shell passes the
  // buckets over every token in the file, which is what find_words() scans.
  Game.prototype.setDictionary = function (words, index) {
    this.words = Array.isArray(words) ? words.slice() : [];
    this.index = index instanceof Map ? index : indexByLength(this.words);
    return this;
  };

  Game.prototype.pickWord = function () {
    if (!this.words.length) return this.state.current_word;
    return this.words[Math.floor(this.random() * this.words.length)];
  };

  Game.prototype.save = function () {
    const s = this.state;
    s.guessed_letters = sortLetters(this.guessed);
    s.correct_letters = sortLetters(this.correct);
    s.bad_letters = sortLetters(this.bad);
    this.persist(normalizeState(s));
  };

  // The KEYDOWN letter branch, including the guard that rejects a repeated
  // guess, input after the game ended and anything outside the alphabet.
  Game.prototype.guess = function (letter) {
    const key = String(letter == null ? "" : letter).toLowerCase();
    if (this.guessed.has(key) || this.gameOver || !isGuessable(key)) {
      return { accepted: false, letter: key };
    }
    this.guessed.add(key);
    this.save();

    const inWord = this.state.current_word.indexOf(key) !== -1;
    if (inWord) {
      this.state.score += 1;
      this.correct.add(key);
      this.save();
      this.sound("correct");
      if (this.state.score > this.state.highscore) {
        this.state.highscore = this.state.score;
        this.save();
      }
    } else {
      this.bad.add(key);
      this.state.wrong_guesses += 1;
      this.save();
      this.sound("wrong");
      if (this.state.wrong_guesses >= MAX_WRONG_GUESSES) this.showScore = true;
    }
    this.evaluate();
    return { accepted: true, letter: key, correct: inWord };
  };

  // The win/lose tests live in the pygame draw loop, i.e. they are derived from
  // state instead of being triggered by the key handler. evaluate() keeps that
  // shape: it recomputes the flags from the current state every time.
  Game.prototype.evaluate = function () {
    const shown = displayedWord(this.state.current_word, this.guessed);
    this.displayed = shown;
    this.solved = shown.indexOf("_") === -1;
    if (this.solved) {
      if (!this.gameOver) this.save();
      this.gameOver = true;
      this.win = true;
      this.loss = false;
    } else if (this.state.wrong_guesses === MAX_WRONG_GUESSES) {
      this.gameOver = true;
      this.loss = true;
      this.win = false;
    } else {
      this.gameOver = false;
      this.win = false;
      this.loss = false;
    }
    return this;
  };

  // reset_game(). The three branches decide what happens to the score and what
  // is appended to history.txt; the tail always starts a fresh word.
  Game.prototype.restart = function () {
    const s = this.state;
    if (!this.gameOver && s.wrong_guesses >= 0) {
      s.score = 0;
      this.log("--------restarted on " + s.current_word);
      this.save();
    } else if (this.gameOver && s.wrong_guesses >= MAX_WRONG_GUESSES) {
      this.log("died at " + s.current_word + " with " + s.score + " points");
      s.score = 0;
      this.correct.clear();
      this.guessed.clear();
      this.save();
      s.current_word = this.pickWord();
      this.save();
    } else if (this.gameOver && s.wrong_guesses < MAX_WRONG_GUESSES) {
      s.score = winPreview(s.score, s.wrong_guesses, s.current_word);
      this.save();
      this.log(s.current_word);
      if (s.score > s.highscore) {
        s.highscore = s.score;
        this.save();
      }
    }
    s.wrong_guesses = 0;
    this.save();
    this.gameOver = false;
    s.current_word = this.pickWord();
    this.save();
    this.guessed.clear();
    this.correct.clear();
    this.bad.clear();
    this.save();
    this.evaluate();
    return this;
  };

  // F2: language flip + dictionary reload + reset_game().
  Game.prototype.setLanguage = function (language) {
    this.state.language = String(language);
    this.save();
    return this;
  };

  // F3: next_theme()
  Game.prototype.cycleTheme = function () {
    this.state.theme = nextThemeId(this.state.theme);
    this.save();
    return colorTheme(this.state.theme);
  };

  // F10: find_words(displayed_word, bad_letters, len(current_word))
  Game.prototype.possibleWords = function () {
    this.evaluate();
    return findWords(this.index, this.displayed, this.bad, this.state.current_word.length);
  };

  // The single source of truth for the picture, mirroring the draw loop.
  Game.prototype.snapshot = function () {
    this.evaluate();
    const s = this.state;
    return {
      word: Array.from(String(s.current_word || "")),
      displayed: this.displayed,
      guessed: sortLetters(this.guessed),
      correct: sortLetters(this.correct),
      bad: sortLetters(this.bad),
      wrongGuesses: s.wrong_guesses,
      maxWrongGuesses: MAX_WRONG_GUESSES,
      score: s.score,
      highscore: s.highscore,
      language: s.language,
      theme: colorTheme(s.theme),
      gameOver: this.gameOver,
      win: this.win,
      loss: this.loss,
      showScore: this.showScore,
      finalScore: winPreview(s.score, s.wrong_guesses, s.current_word),
    };
  };

  return {
    ALPHABET,
    POLISH_EXTRA,
    MAX_WRONG_GUESSES,
    FIXED,
    THEMES,
    THEME_COUNT,
    colorTheme,
    nextThemeId,
    isGuessable,
    sortLetters,
    isAllUpperCase,
    loadDictionary,
    tokenize,
    indexByLength,
    findWords,
    displayedWord,
    winPreview,
    explainUrl,
    dictionaryFileFor,
    STRINGS,
    UI_HTML_LANG,
    uiLanguage,
    stringsFor,
    defaultState,
    normalizeState,
    parseSaved,
    formatSaved,
    Game,
  };
});
