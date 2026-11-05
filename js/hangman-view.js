/* hangman-view.js — everything that touches the screen.
 *
 * The gallows uses the pixel coordinates from draw_hangman() unchanged (the
 * jitter list `r` in the Python source is built with j = 0, so those offsets are
 * all zero — the desktop drawing is straight lines, and so is this one). Word,
 * tried-letters line, score/high-score placement and the win/lose strings are
 * the desktop layout re-expressed in HTML; the on-screen keyboard is the new
 * part, added for phones.
 */
(function (root) {
  "use strict";
  const core = root.HM.core;

  /* ----------------------------------------------------------------- colour */

  function rgb(color) {
    return "rgb(" + color[0] + "," + color[1] + "," + color[2] + ")";
  }
  function rgba(color, alpha) {
    return "rgba(" + color[0] + "," + color[1] + "," + color[2] + "," + alpha + ")";
  }
  function mix(a, b, amount) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * amount),
      Math.round(a[1] + (b[1] - a[1]) * amount),
      Math.round(a[2] + (b[2] - a[2]) * amount),
    ];
  }
  function luminance(color) {
    return (0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]) / 255;
  }

  // Derived chrome colours so the keyboard, chips and panels follow whichever
  // of the 13 palettes is active instead of fighting it.
  function paletteOf(theme) {
    const light = luminance(theme.bg) > 0.5;
    const keyBase = light ? mix(theme.bg, theme.hangman, 0.14) : mix(theme.bg, theme.hangman, 0.3);
    return {
      bg: rgb(theme.bg),
      hangman: rgb(theme.hangman),
      letter: rgb(theme.letter),
      loss: rgb(theme.loss),
      hot: rgb(core.FIXED.RED),
      faint: rgba(theme.hangman, light ? 0.5 : 0.62),
      chip: light ? mix(theme.bg, theme.hangman, 0.1) : mix(theme.bg, theme.hangman, 0.22),
      chipEdge: rgba(theme.hangman, light ? 0.32 : 0.45),
      panel: light ? mix(theme.bg, [255, 255, 255], 0.5) : mix(theme.bg, [0, 0, 0], 0.25),
      keyBg: rgb(keyBase),
      keyFg: rgb(theme.letter),
      keyHit: rgb(theme.letter),
      keyHitFg: rgb(theme.bg),
      keyMiss: rgb(light ? mix(theme.bg, theme.hangman, 0.42) : mix(theme.bg, theme.hangman, 0.55)),
      keyShadow: rgba(light ? [0, 0, 0] : theme.hangman, light ? 0.16 : 0.2),
      underline: rgba(theme.letter, 0.85),
    };
  }

  /* ------------------------------------------------------------ sound (beep) */

  // The desktop build beeps 300 Hz for 100 ms on a hit and 800 Hz for 70 ms on a
  // miss. Those two are swapped here on request: a letter that was in the word gets
  // the short high beep, a miss gets the low long one.
  const BEEPS = { correct: [800, 70], wrong: [300, 100] };

  function createAudio() {
    let context = null;
    let enabled = true;
    function ensure() {
      if (context) return context;
      const Ctor = root.AudioContext || root.webkitAudioContext;
      if (!Ctor) return null;
      try {
        context = new Ctor();
      } catch (error) {
        return null;
      }
      return context;
    }
    return {
      play(kind) {
        const spec = BEEPS[kind];
        if (!enabled || !spec) return;
        const ctx = ensure();
        if (!ctx) return;
        if (ctx.state === "suspended") ctx.resume();
        const [freq, ms] = spec;
        const end = ctx.currentTime + ms / 1000;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
        gain.gain.setValueAtTime(0.12, Math.max(ctx.currentTime + 0.02, end - 0.015));
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(end + 0.02);
      },
      setEnabled(value) {
        enabled = !!value;
      },
      get enabled() {
        return enabled;
      },
      unlock() {
        const ctx = ensure();
        if (ctx && ctx.state === "suspended") ctx.resume();
      },
    };
  }

  /* -------------------------------------------------------------- on-screen */

  // QWERTY as in Wordle; the extra row carries the nine Polish letters and is
  // only shown while the Polish dictionary is active.
  const LETTER_ROWS = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"],
  ];
  const POLISH_ROW = ["ą", "ć", "ę", "ł", "ń", "ó", "ś", "ź", "ż"];

  function createKeyboard(host, onPress) {
    const keys = new Map();
    let strings = core.stringsFor("english");

    function addRow(row, extra) {
      const rowEl = document.createElement("div");
      rowEl.className = "kbd-row" + (extra ? " kbd-row-extra" : "");
      for (const letter of row) {
        const key = document.createElement("button");
        key.type = "button";
        key.className = "key";
        key.dataset.letter = letter;
        key.textContent = letter.toUpperCase();
        key.setAttribute("aria-label", strings("aria.letter", { letter: letter }));
        key.addEventListener("click", () => onPress(letter));
        rowEl.appendChild(key);
        keys.set(letter, key);
      }
      host.appendChild(rowEl);
    }

    for (const row of LETTER_ROWS) addRow(row, false);
    addRow(POLISH_ROW, true);

    return {
      setStrings(t) {
        strings = t;
        for (const [letter, key] of keys) {
          key.setAttribute("aria-label", strings("aria.letter", { letter: letter }));
        }
      },
      setPolish(visible) {
        host.classList.toggle("show-polish", !!visible);
      },
      apply(snapshot) {
        // one muted state for every letter already played, found or not: the board
        // says whether it was in the word, the keyboard only has to say "not again"
        for (const [letter, key] of keys) {
          key.classList.toggle("used", snapshot.guessed.includes(letter));
        }
      },
      clear() {
        for (const key of keys.values()) key.classList.remove("used");
      },
    };
  }

  /* ------------------------------------------------------------------- view */

  function createView(get) {
    const gallowsStages = [];
    for (let i = 1; i <= core.MAX_WRONG_GUESSES; i += 1) {
      gallowsStages.push(get("stage-" + i));
    }
    const audio = createAudio();
    let wordCells = [];
    let t = core.stringsFor("english");

    // The interface speaks the language being played: index.html carries data-i18n,
    // data-i18n-html, data-i18n-title and data-i18n-label keys on every piece of
    // static chrome, and this rewrites them from the core's table. It runs on boot
    // and whenever the language button or an imported saved.txt changes the language
    // — not on every keystroke, because a page redraw is not a re-translation.
    function applyLanguage(language) {
      t = core.stringsFor(language);
      document.documentElement.lang = core.UI_HTML_LANG[core.uiLanguage(language)];
      document.title = t("pageTitle");
      const fill = (selector, attribute, write) => {
        for (const node of document.querySelectorAll("[" + selector + "]")) {
          write(node, t(node.getAttribute(selector)));
        }
      };
      fill("data-i18n", null, (node, text) => {
        node.textContent = text;
      });
      fill("data-i18n-html", null, (node, html) => {
        node.innerHTML = html;
      });
      fill("data-i18n-title", null, (node, text) => {
        node.setAttribute("title", text);
      });
      fill("data-i18n-label", null, (node, text) => {
        node.setAttribute("aria-label", text);
      });
      return t;
    }

    function setPalette(theme) {
      const colors = paletteOf(theme);
      const style = document.documentElement.style;
      Object.entries(colors).forEach(([name, value]) => style.setProperty("--" + name, value));
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", colors.bg);
      return colors;
    }

    // The word on the board is the biggest thing on the page, and its size does not
    // How wide the widest letter the game can hand out is, as a fraction of its own
    // font size. Measured with the font the page really uses, so a slot of a given
    // width can be promised to hold any letter without touching its neighbours: the
    // "_" bars are a fixed percentage of the slot, so the spacing along the row is
    // the same for every letter.
    let widestRatio = 0;

    function measureWidest() {
      if (widestRatio) return widestRatio;
      const family = getComputedStyle(get("word")).fontFamily || "sans-serif";
      const probe = document.createElement("canvas").getContext("2d");
      // keep this weight in step with ".cell .glyph" in styles.css
      probe.font = "400 100px " + family;
      // every character the word can contain is measured on its own: what has to
      // fit is the widest single glyph, not the widest run of them
      for (const ch of "mwMW0ĄĆĘŁŃÓŚŹŻąćęłńóśźż") {
        widestRatio = Math.max(widestRatio, probe.measureText(ch).width / 100);
      }
      if (!widestRatio) widestRatio = 0.78; // no canvas: assume a wide sans
      return widestRatio;
    }

    // The word is drawn as large as the space allows: the slot pitch is the width
    // of the play area divided by the number of letters in the word on the board,
    // never more than a share of its height and never over MAX_PITCH. A five-letter
    // word therefore gets big letters and an eighteen-letter one smaller ones, while
    // the size stays put for as long as that word is in play.
    const MAX_PITCH = 110;

    function fitWord(count) {
      const letters = Math.max(1, Math.round(Number(count) || 1));
      const host = get("word");
      const area = get("play") || host.parentElement;
      const board = get("board") || area;
      const width = Math.max(160, (area && area.clientWidth) || window.innerWidth - 16);
      const height = Math.max(120, (board && board.clientHeight) || window.innerHeight - 160);
      const byWidth = Math.floor((width - 10) / letters);
      const byHeight = Math.floor(height * 0.34);
      const pitch = Math.max(13, Math.min(MAX_PITCH, byWidth, byHeight));
      // a letter may be as tall as its slot, but never wider than the slot inside
      // its bars: that keeps the gaps along the row constant whatever is drawn
      const room = pitch - Math.max(4, Math.round(pitch * 0.18));
      const size = Math.max(11, Math.min(Math.round(pitch * 1.16), Math.floor(room / measureWidest())));
      // the sizes go on the play area rather than the word row: the record of the
      // letters you tried sits beside the word and is drawn at a fraction of its size,
      // as in the source game (tried_letters at 60pt against the word's 80pt), so it
      // has to inherit them
      const styles = area || host;
      styles.style.setProperty("--cell", pitch + "px");
      styles.style.setProperty("--letter-size", size + "px");
      // the bar is a fraction of the letter, as the source game's "_" is
      styles.style.setProperty("--underline-h", Math.max(2, Math.round(size * 0.07)) + "px");
    }

    // The record of used letters is drawn at a fraction of the word's size, which is
    // what makes it readable beside it. A long row of them, or a word that has just
    // ended with its line and its button, must not push the page. What gives way first
    // is the space under the word, because that is only distance; only after that the
    // size of the letters, and only by as much as the page is actually short of. The
    // word in play is never part of that trade, and whatever bought no room is put
    // straight back.
    function fitTried(line, count) {
      const area = get("play") || (line && line.parentElement);
      if (!area || !count) return;
      if (getComputedStyle(line).display === "none") return; // the keyboard shows them
      area.style.removeProperty("--tighten");
      line.style.removeProperty("font-size");
      const over = () =>
        // what matters is that neither the column nor the page ends up short of room
        Math.max(
          area.scrollHeight - area.clientHeight,
          document.documentElement.scrollHeight - window.innerHeight,
        );
      const before = over();
      if (before <= 1) return;
      // the distance under the word goes first: it is only space, and a few pixels of
      // it are missed far less than a letter is
      const gap = Math.floor(parseFloat(getComputedStyle(line).marginTop)) || 0;
      const give = Math.max(0, Math.min(gap - 8, before));
      if (give > 0) {
        area.style.setProperty("--tighten", give + "px");
        if (over() <= 1) return;
      }
      for (let pass = 0; pass < 6; pass += 1) {
        const styles = getComputedStyle(line);
        const size = parseFloat(styles.fontSize) || 0;
        const leading = parseFloat(styles.lineHeight) || size * 1.2;
        const lines = Math.max(1, Math.round(line.offsetHeight / leading));
        // give back exactly the height the page is short of, shared out over the lines
        // this text really makes: two pixels of overflow cost two pixels of size, not a
        // fixed fraction of it
        const want = Math.max(18, Math.floor(size - Math.max(1, Math.ceil(over() / lines))));
        if (!(want < size)) break;
        line.style.fontSize = want + "px";
        if (over() <= 1 || want <= 18) break;
      }
      // undo in the same order, whatever did not actually buy room
      if (over() >= before) line.style.removeProperty("font-size");
      if (over() >= before) area.style.removeProperty("--tighten");
    }

    function renderWord(snapshot) {
      const host = get("word");
      const letters = snapshot.word;
      fitWord(letters.length);
      if (wordCells.length !== letters.length) {
        host.textContent = "";
        wordCells = letters.map((_, index) => {
          const cell = document.createElement("span");
          cell.className = "cell";
          cell.dataset.index = String(index);
          const glyph = document.createElement("span");
          glyph.className = "glyph";
          cell.appendChild(glyph);
          host.appendChild(cell);
          return cell;
        });
        host.setAttribute(
          "aria-label",
          "word of " + letters.length + " letters",
        );
      }
      snapshot.displayed.split("").forEach((shown, index) => {
        const cell = wordCells[index];
        if (!cell) return;
        const solved = shown !== "_";
        cell.classList.toggle("solved", solved);
        cell.querySelector(".glyph").textContent = solved ? shown : "";
      });
    }

    function renderGallows(snapshot) {
      gallowsStages.forEach((stage, index) => {
        if (!stage) return;
        stage.classList.toggle("on", snapshot.wrongGuesses >= index + 1);
      });
    }

    function renderTried(snapshot) {
      // " ".join(sorted(guessed_letters, key=locale.strxfrm)) with pl_PL rules.
      get("tried").textContent = snapshot.guessed.join(" ");
    }

    function renderStatus(snapshot) {
      const score = get("score");
      // if score == highscore: tempcolor = RED — the current run matching the
      // best run is drawn in plain red, as on the desktop.
      score.classList.toggle("hot", snapshot.score === snapshot.highscore);
      score.textContent = t("status.score", { n: snapshot.score });
      get("highscore").textContent = t("status.highscore", { n: snapshot.highscore });
    }

    function renderMessage(snapshot) {
      const host = get("message");
      // a phone has no Space key and no F1: the Continue button under the message is
      // the whole affordance there, so the desktop hint is not repeated at it
      const touch = root.matchMedia ? root.matchMedia("(pointer: coarse)").matches : false;
      host.textContent = "";
      host.classList.toggle("is-over", snapshot.gameOver);
      if (snapshot.win) {
        const line = document.createElement("div");
        line.className = "msg-line";
        line.textContent = touch ? t("msg.winTouch") : t("msg.win");
        const value = document.createElement("div");
        value.className = "msg-line msg-score";
        value.textContent = t("msg.score", { n: snapshot.finalScore });
        host.append(line, value);
      } else if (snapshot.loss) {
        const line = document.createElement("div");
        line.className = "msg-line";
        line.textContent =
          t("msg.loss", { word: snapshot.word.join("") }) + (touch ? "" : t("msg.f1"));
        host.appendChild(line);
        if (snapshot.showScore) {
          const value = document.createElement("div");
          value.className = "msg-line msg-score";
          value.textContent = t("msg.score", { n: snapshot.score });
          host.appendChild(value);
        }
      }
      if (snapshot.gameOver) {
        const cont = document.createElement("button");
        cont.type = "button";
        cont.id = "btn-continue";
        cont.className = "chip chip-continue";
        cont.textContent = t("msg.continue");
        host.appendChild(cont);
      }
    }

    function renderLanguage(snapshot) {
      // the label names the language in play, in the language of the interface. The
      // desktop build wrote "F2  polish" here; this button has no key, so the label
      // is the language and nothing else
      get("btn-language").textContent = t("lang.name." + core.uiLanguage(snapshot.language));
      document.body.dataset.language = snapshot.language;
    }

    function render(snapshot) {
      setPalette(snapshot.theme);
      renderLanguage(snapshot);
      renderWord(snapshot);
      renderGallows(snapshot);
      renderTried(snapshot);
      renderStatus(snapshot);
      renderMessage(snapshot);
      // last, so the end-of-word line and its button are already counted in the room
      // the column has before the used-letters size is settled
      fitTried(get("tried"), snapshot.guessed.length);
      return snapshot;
    }

    return {
      render,
      applyLanguage,
      strings: () => t,
      fitWord,
      audio,
      cells: () => wordCells,
      wordHost: () => get("word"),
    };
  }

  root.HM.view = {
    createView,
    createKeyboard,
    createAudio,
    paletteOf,
    rgb,
    rgba,
    mix,
    luminance,
    LETTER_ROWS,
    POLISH_ROW,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
