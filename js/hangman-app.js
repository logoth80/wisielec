/* hangman-app.js — browser shell: dictionaries, saved state, keys, panels.
 *
 * The desktop program keeps its whole game in saved.txt and rewrites the changed
 * key after every keystroke; that behaviour is reproduced with localStorage under
 * `hangman.saved.v1`, written synchronously on the same occasions. saved.txt can
 * still be exported and imported verbatim (Data panel), so a browser save and a
 * desktop save are interchangeable.
 */
(function (root) {
  "use strict";
  const core = root.HM.core;
  const view = root.HM.view;

  const STORAGE_KEY = "hangman.saved.v1";
  const PREFS_KEY = "hangman.prefs.v1";
  const HISTORY_KEY = "hangman.history.v1";
  const HISTORY_LIMIT = 400;

  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, document.getElementById(id));
    return elements.get(id);
  };

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }
  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  let prefs = Object.assign({ sound: true, keyboard: "auto" }, readJson(PREFS_KEY, {}));
  function savePrefs() {
    writeJson(PREFS_KEY, prefs);
  }

  function history() {
    const list = readJson(HISTORY_KEY, []);
    return Array.isArray(list) ? list : [];
  }
  function appendHistory(line) {
    const list = history();
    list.push({ at: new Date().toISOString(), line: String(line) });
    writeJson(HISTORY_KEY, list.slice(-HISTORY_LIMIT));
    renderHistoryCount();
  }
  function renderHistoryCount() {
    const box = get("data-history");
    if (box) box.textContent = history().length + " entries kept in this browser (history.txt equivalent)";
  }

  /* ----------------------------------------------------------- dictionaries */

  const dictionaryCache = new Map();

  function loadRawText(file) {
    // Serving the folder over http(s) reads the verbatim .txt; opening
    // index.html directly refuses fetch, so the generated .js twin is injected.
    return window.fetch("dictionaries/" + file + ".txt")
      .then((response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.text();
      })
      .catch(() => new Promise((resolve, reject) => {
        const store = (root.HM_DICT_RAW || (root.HM_DICT_RAW = {}));
        const script = document.createElement("script");
        script.src = "dictionaries/" + file + ".js";
        script.charset = "utf-8";
        script.onload = () => {
          if (typeof store[file === "pruned_polish" ? "polish" : "english"] === "string") resolve(store[file === "pruned_polish" ? "polish" : "english"]);
          else reject(new Error("dictionary payload missing"));
        };
        script.onerror = () => reject(new Error("dictionary unavailable"));
        document.head.appendChild(script);
      }));
  }

  function loadDictionary(language) {
    const file = core.dictionaryFileFor(language);
    if (dictionaryCache.has(file)) return Promise.resolve(dictionaryCache.get(file));
    return loadRawText(file).then((text) => {
      const words = core.loadDictionary(text);
      const entry = {
        file,
        words,
        // find_words() in the desktop build re-reads the file rather than the
        // filtered list, so the word finder is indexed over every token in it.
        index: core.indexByLength(core.tokenize(text)),
      };
      dictionaryCache.set(file, entry);
      return entry;
    });
  }

  /* -------------------------------------------------------------- game boot */

  let game = null;
  let dictionary = null;
  let view_ = null;
  let keyboardView = { setPolish() {}, apply() {}, clear() {} };

  function persist(state) {
    // write_saved after each key: the whole record is stored, so a reload or a
    // phone locking mid-word resumes at the same letter, score and stage.
    writeJson(STORAGE_KEY, state);
  }

  function draw() {
    if (!game || !view_) return;
    const snapshot = game.snapshot();
    view_.render(snapshot);
    keyboardView.setPolish(snapshot.language !== "english");
    keyboardView.apply(snapshot);
    const explain = get("btn-explain");
    explain.disabled = !snapshot.gameOver;
    return snapshot;
  }

  function bootState() {
    const state = core.normalizeState(readJson(STORAGE_KEY, core.defaultState()));
    const params = new URLSearchParams(window.location.search);
    const lang = params.get("lang");
    if (lang) state.language = /^(pl|pol|polish)$/i.test(lang) ? "polish" : /^(en|eng|english)$/i.test(lang) ? "english" : lang;
    const theme = params.get("theme");
    if (theme) state.theme = core.colorTheme(parseInt(theme, 10) || 1).id;
    return state;
  }

  // one place to build a game, so boot, import and "erase saved game" all get
  // the same persistence, sound and history hooks
  function newGame(state) {
    return new core.Game({
      words: dictionary.words,
      index: dictionary.index,
      state,
      persist,
      sound: (kind) => {
        if (prefs.sound) view_.audio.play(kind);
      },
      log: appendHistory,
    });
  }

  function boot() {
    view_ = view.createView(get);
    const state = bootState();
    setBusy("loading " + core.dictionaryFileFor(state.language) + " dictionary…");
    loadDictionary(state.language)
      .then((entry) => {
        dictionary = entry;
        game = newGame(state);
        setBusy(null);
        wireControls();
        draw();
      })
      .catch((error) => {
        setBusy("dictionary could not be loaded: " + error.message);
      });
  }

  function setBusy(message) {
    const box = get("busy");
    if (!box) return;
    box.textContent = message || "";
    box.hidden = !message;
  }

  /* -------------------------------------------------------------- key input */

  function press(letter) {
    if (!game) return;
    game.guess(letter); // guarded exactly like the KEYDOWN branch
    draw();
  }

  function restart() {
    if (!game) return;
    game.restart();
    draw();
  }

  function cycleTheme() {
    if (!game) return;
    game.cycleTheme();
    draw();
  }

  function explainWord() {
    if (!game || !game.gameOver) return;
    window.open(core.explainUrl(game.state.current_word), "_blank", "noopener");
  }

  function toggleLanguage() {
    if (!game) return;
    const next = game.state.language === "english" ? "polish" : "english";
    game.setLanguage(next);
    setBusy("loading " + core.dictionaryFileFor(next) + " dictionary…");
    loadDictionary(next)
      .then((entry) => {
        dictionary = entry;
        setBusy(null);
        game.setDictionary(entry.words, entry.index);
        game.restart(); // F2 reloads the word list, then reset_game()
        draw();
      })
      .catch((error) => {
        setBusy("dictionary could not be loaded: " + error.message);
        draw();
      });
  }

  function possibleWords() {
    if (!game) return;
    openPanel("find");
    const pattern = game.evaluate().displayed;
    const length = game.state.current_word.length;
    const out = get("find-result");
    out.textContent = "checking <" + pattern.replace(/_/g, ".") + "> without " + Array.from(game.bad).join("") + " …";
    // The scan is a few thousand regex tests; deferring it keeps the tap instant.
    window.setTimeout(() => {
      const hits = game.possibleWords();
      const head = document.createElement("div");
      head.className = "find-head";
      head.textContent = "found " + hits.length + " possible words for length " + length;
      out.textContent = "";
      out.appendChild(head);
      if (hits.length === 0) {
        const none = document.createElement("div");
        none.className = "find-note";
        none.textContent = "No word in this dictionary matches the letters you have ruled out.";
        out.appendChild(none);
      } else if (hits.length <= 100) {
        // list_words.py prints the set when it is short enough to read.
        const list = document.createElement("div");
        list.className = "find-list";
        list.textContent = hits.join("  ");
        out.appendChild(list);
      } else {
        const note = document.createElement("div");
        note.className = "find-note";
        note.textContent = "Too many results to display. Please refine your search criteria.";
        out.appendChild(note);
      }
    }, 16);
  }

  function closePanel() {
    const panel = get("panel");
    panel.hidden = true;
    get("panel-tabs").querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  }

  function openPanel(name) {
    const panel = get("panel");
    panel.hidden = false;
    panel.dataset.tab = name;
    get("panel-tabs").querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.panel === name);
    });
    document.querySelectorAll(".panel-body").forEach((body) => {
      body.hidden = body.dataset.panel !== name;
    });
    if (name === "data") {
      get("data-saved").value = core.formatSaved(game.state);
      renderHistoryCount();
    }
  }

  function downloadText(name, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function setKeyboardMode(mode) {
    prefs.keyboard = mode;
    document.body.dataset.kbd = mode;
    const button = get("btn-kbd");
    button.classList.toggle("on", mode === "on" || (mode === "auto" && isNarrow()));
    button.title = "on-screen keyboard: " + mode;
    savePrefs();
    draw(); // showing or hiding the keyboard changes the room the window has
  }
  function isNarrow() {
    return window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
  }

  // the sound chip carries the same filled on-state as the keyboard chip, so "sound
  // is on" is visible without pressing it — and off is the plain chip
  function setSoundOn(on) {
    const button = get("btn-sound");
    button.classList.toggle("on", !!on);
    button.title = "sound: " + (on ? "on" : "off");
  }

  function wireControls() {
    // rotating a phone or resizing a window changes the stage and the word pitch,
    // so a redraw is part of the controls, not an extra
    let redrawTimer = 0;
    const redraw = () => {
      window.clearTimeout(redrawTimer);
      redrawTimer = window.setTimeout(draw, 120);
    };
    window.addEventListener("resize", redraw);
    window.addEventListener("orientationchange", redraw);

    document.addEventListener("keydown", (event) => {
      const field = event.target.closest && event.target.closest("input, textarea, select, [contenteditable]");
      if (field) {
        // typing in the Data panel must not be treated as a guess
        return;
      }
      const key = event.key;
      if (key === "F1") {
        event.preventDefault();
        explainWord();
        return;
      }
      if (key === "F2") {
        event.preventDefault();
        toggleLanguage();
        return;
      }
      if (key === "F3") {
        event.preventDefault();
        cycleTheme();
        return;
      }
      if (key === "F10") {
        event.preventDefault();
        possibleWords();
        return;
      }
      if (key === " " || key === "Enter") {
        if (event.target && event.target.tagName === "BUTTON") return;
        event.preventDefault();
        if (game.gameOver) restart(); // Space/Enter only continue after a finished game
        return;
      }
      if (key.length === 1) {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        view_.audio.unlock();
        press(key.toLowerCase());
      }
    });

    get("btn-language").addEventListener("click", toggleLanguage);
    get("btn-theme").addEventListener("click", cycleTheme);
    get("btn-explain").addEventListener("click", explainWord);
    get("btn-help").addEventListener("click", () => (get("panel").hidden ? openPanel("help") : closePanel()));
    get("btn-kbd").addEventListener("click", () => {
      const order = ["auto", "on", "off"];
      setKeyboardMode(order[(order.indexOf(prefs.keyboard) + 1) % order.length]);
    });
    get("btn-sound").addEventListener("click", () => {
      prefs.sound = !prefs.sound;
      setSoundOn(prefs.sound);
      savePrefs();
      // one beep when it comes back on, so the chip's filled state is confirmed
      if (prefs.sound) {
        view_.audio.unlock();
        view_.audio.play("correct");
      }
    });

    get("message").addEventListener("click", (event) => {
      if (event.target && event.target.id === "btn-continue") restart();
    });
    get("panel-close").addEventListener("click", closePanel);
    get("panel-tabs").addEventListener("click", (event) => {
      const tab = event.target.closest(".tab");
      if (tab) openPanel(tab.dataset.panel);
    });
    get("data-export").addEventListener("click", () => downloadText("saved.txt", core.formatSaved(game.state)));
    get("data-export-history").addEventListener("click", () => {
      downloadText("history.txt", history().map((entry) => entry.line).join("\n") + "\n");
    });
    get("data-apply").addEventListener("click", () => {
      // an imported saved.txt may name the other language, so the dictionary is
      // re-read first when its file is not the one in play
      const state = core.parseSaved(get("data-saved").value);
      const run = () => {
        game = newGame(state);
        draw();
      };
      if (core.dictionaryFileFor(state.language) !== dictionary.file) {
        setBusy("loading " + core.dictionaryFileFor(state.language) + " dictionary…");
        loadDictionary(state.language)
          .then((entry) => {
            dictionary = entry;
            setBusy(null);
            run();
          })
          .catch((error) => {
            setBusy("dictionary could not be loaded: " + error.message);
            draw();
          });
      } else {
        run();
      }
    });
    get("data-reset").addEventListener("click", () => {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(HISTORY_KEY);
      game = newGame(core.defaultState()); // back to the fresh-game defaults
      draw();
    });
    get("data-file").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        get("data-saved").value = String(reader.result);
        get("data-apply").click();
      };
      reader.readAsText(file, "utf-8");
    });

    document.addEventListener("pointerdown", () => view_.audio.unlock(), { once: true });
    window.addEventListener("resize", () => {
      if (game) view_.fitWord(game.state.current_word.length);
      setKeyboardMode(prefs.keyboard);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.body.dataset.kbd = prefs.keyboard;
    setSoundOn(prefs.sound);
    keyboardView = view.createKeyboard(get("keyboard"), (letter) => {
      view_.audio.unlock();
      press(letter);
    });
    setKeyboardMode(prefs.keyboard);
    boot();
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
