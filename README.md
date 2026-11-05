# Hangman — a browser port of [logoth80/Hangman](https://github.com/logoth80/Hangman)

The desktop game in `hangman.pyw`, running as a static page: the same words, the same
rules, the same saved-state semantics and the same keys, plus an on-screen keyboard so
it can be played with a thumb.

## play it

**[logoth80.github.io/wisielec](https://logoth80.github.io/wisielec/)** — the game runs
straight off this repository. GitHub Pages serves the files in `main` as they are: no
build step, no server, nothing to install. The word lists, the themes and the saved-board
code are all in the repo, so that link is the game; it is also set as the repository's
homepage, and pushing to `main` redeploys it.

## running it locally

Clone it and open `index.html` — `git clone https://github.com/logoth80/wisielec.git`.
There is no build step and no server is required.

- The dictionaries load with `fetch()` when the page is served over http (including the
  Pages deployment) and through the `dictionaries/*.js` payloads when it is opened
  straight from the filesystem.
- `node tools/build-dictionaries.mjs` regenerates those payloads from the `.txt` files.

## how it is split

| file | role |
| --- | --- |
| `index.html` | the board: gallows as ten SVG stages, word cells, the top control bar, panel |
| `styles.css` | layout and palette hooks; no colour is hard-coded here |
| `js/hangman-core.js` | the rules — dictionary filter, game state, saved format, themes; no DOM |
| `js/hangman-view.js` | the drawing — palettes into CSS variables, gallows stages, cells, keyboard |
| `js/hangman-app.js` | wiring: keys, buttons, storage, dictionary loading |
| `tools/verify-parity.mjs` | the checks described below |

## what is copied from the original

- the word lists and the dictionary filter: `;`-separated, 5–18 characters, ALL-CAPS out
- ten wrong guesses before the word is lost, and the gallows drawn stage by stage with
  the coordinates from `draw_hangman()` (nothing at all at zero misses, as upstream)
- the 13 colour themes and F3 cycling them, including plain RED only when the current
  score equals the high score
- scoring: one point per correct letter, `+45 - 2 * len(word)` banked on a win, and the
  history log wording (`--------restarted on …`, `died at … with N points`)
- the saved record, written after every key press: language, theme, high score, score,
  wrong guesses, guessed/correct/bad letters, current word
- the keys: letters, F1 explain, F2 language, F3 theme, F10 word finder (F5 and Esc are
  dropped, see below)
- the word finder: `_` for a known-position letter, disallowed letters, exact length

## what is deliberately different

- **The layout is not the pygame window's.** Every control — language, theme, word finder,
  explain, and the keyboard / sound / help toggles — is in one row along the top, with the
  score and the high score at its right end; the word finder's F10 hotkey is not printed
  on its button, it is only listed in the Keys panel. On a phone the same controls are
  sized for a thumb: the icon buttons are 46 px squares with 21 px glyphs. The word being
  guessed is the largest element at every screen size; the gallows and the letters already
  tried are drawn smaller around it.
- **The word takes the room it is given.** The slot pitch is the width of the play area
  divided by the number of letters in the word on the board, limited by a share of the
  screen height and by 110 px; the letter size is then measured against the widest glyph
  the page's font can produce, so a letter can never reach into its neighbour's slot and
  the spacing along the row is constant. A short word therefore gets very large letters
  (~95 px on a desktop) and a long one smaller ones, and the size stays put for as long
  as that word is in play, changing only when a new word is dealt. The original works the
  same way with a 50/40/30 px ladder.
- **A placed letter replaces its `_`:** the bar of a filled slot is not drawn, and the
  slots still empty keep theirs — which is what the source game does.
- **There is no way to abandon a word.** F5, Esc and the new-game button are gone: a word
  is played to the end, and Space, Enter or the Continue button deal the next one only
  once it is won or lost. Reloading the page picks the word in progress straight back up,
  because the state is written after every key press.
- **On a touch device the end of a word is a button, not a sentence.** Where the primary
  pointer is coarse, the win line is just `Great!` and the loss line does not carry the
  `(F1)` marker — there is no Space and no F1 to press. The Continue button takes the
  whole affordance: 55 px tall and 18 px of text, against 33 px and 13 px on a desktop.
  A narrow desktop window keeps the key hints, because the keys are really there.
- **The two beeps are swapped.** The desktop game calls `Beep(300, 100)` when a letter was
  in the word and `Beep(800, 70)` when it was not; here a found letter gets the short high
  beep and a miss gets the low long one, which is the way it reads.
- **The on-screen keyboard sits at the bottom and replaces the "letters you tried"
  line** while it is shown — it already shows every letter used, greyed the same way
  whether it was in the word or not. With a physical keyboard in play that line stays.
- `saved.txt`, the preferences and the history live in `localStorage`
  (`hangman.saved.v1`, `hangman.prefs.v1`, `hangman.history.v1`) with the same fields
  and written at the same moments.
- **F10 searches the dictionary you are actually playing.** The desktop `find_words()`
  hard-codes `pruned_polish.txt` whatever language is selected; that reads as a bug, and
  the port does not reproduce it.
- Esc does nothing at all; there is nothing to quit, and the game is in storage anyway.

## checking it

```
node tools/verify-parity.mjs
```

86 checks over nine areas: the dictionary payloads and filter, the word-finder scan,
all 13 palettes, the game rules, the saved-file format, Polish collation, page wiring,
and the interface rules above (one used-letter state, the keyboard replacing the tried
list, no restart control, all controls and the score in the top bar, the word sized to
the space it is given and measured against the widest glyph, a filled slot drawing no
bar, the two beeps swapped, touch-sized controls and a touch-sized Continue button, an
end-of-word message that mentions no keys on a touch device, no F10 printed on a button,
everything else smaller than the word). The expected values were measured by running the
upstream Python over these exact dictionary files.

`node tools/qa-probe.mjs` prints what the running page actually measures: box geometry
for the app, the play area, the word row and the keyboard, the state a reload would find
in `localStorage`, the computed opacity of a filled slot's bar, whether the page scrolls,
the size of every control in the top bar, the end-of-word line as the page wrote it and
the size of the Continue button, and — after playing six words out and dealing new ones —
a sample per word of `[letters, slot pitch, letter size, row width]`. Each word must get
a bigger size than a longer one, every row must stay inside the play area
(`rowShareOfPlayArea` below 1), no glyph may reach past its slot, the filled slot's bar
must read `0`, the page must not scroll, and a phone's icon buttons must measure 46 px.

### screenshots

`node tools/qa-fixture.mjs mid lost win kbd` writes `_qa_*.html` — pages with a game
seeded into `localStorage`, so a headless browser lands on a board in a chosen state:

```
msedge --headless=new --disable-gpu --no-first-run --hide-scrollbars \
  --force-device-scale-factor=1 --user-data-dir=.qa-seed \
  --window-size=1280,800 --virtual-time-budget=25000 \
  --screenshot=qa/desktop-mid.png file:///…/_qa_mid.html
```

Headless Chromium always reports a fine primary pointer whatever the window size, so a
fixture name ending in `-touch` (`win-touch`, `lost-touch`) seeds the same board with
`matchMedia("(pointer: coarse)")` stubbed to true — the only way to see the touch
end-of-word message in these shots. The phone images in `qa/` come from those, at
`--window-size=500,900`.

Headless Chromium will not make its window narrower than about 491 CSS px, so phone
shots are taken at `--window-size=500,900`; a true 390 px viewport needs DevTools
emulation. When a layout question comes up, `node tools/qa-probe.mjs` prints the real
box sizes from inside the running page. The images in `qa/` are the current output, not
a golden reference — regenerate them after touching the view.

`qa/live-desktop.png` and `qa/live-mobile.png` are the same two viewports aimed at the
Pages URL instead of a local file; taking them, and counting `class="cell"` and
`class="key"` in the rendered DOM of the live page, is how a push is checked after it
has deployed.
