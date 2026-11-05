# Hangman — a browser port of [logoth80/Hangman](https://github.com/logoth80/Hangman)

The desktop game in `hangman.pyw`, running as a static page: the same words, the same
rules, the same saved-state semantics and the same keys, plus an on-screen keyboard so
it can be played with a thumb.

## running it

Open `index.html`. There is no build step and no server is required.

- The dictionaries load with `fetch()` when the page is served over http and through
  the `dictionaries/*.js` payloads when it is opened straight from the filesystem.
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

- **The layout is not the pygame window's.** Every control — F2 language, F3 theme, F10
  word finder, F1 explain, and the keyboard / sound / help toggles — is in one row along
  the top, with the score and the high score at its right end. The word being guessed is
  the largest element at every screen size; the gallows and the letters already tried are
  drawn smaller around it.
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

82 checks over nine areas: the dictionary payloads and filter, the word-finder scan,
all 13 palettes, the game rules, the saved-file format, Polish collation, page wiring,
and the interface rules above (one used-letter state, the keyboard replacing the tried
list, no restart control, all controls and the score in the top bar, the word sized to
the space it is given and measured against the widest glyph, a filled slot drawing no
bar, everything else smaller than the word). The expected values were measured by running
the upstream Python over these exact dictionary files.

`node tools/qa-probe.mjs` prints what the running page actually measures: box geometry
for the app, the play area, the word row and the keyboard, the state a reload would find
in `localStorage`, the computed opacity of a filled slot's bar, whether the page scrolls,
and — after playing six words out and dealing new ones — a sample per word of
`[letters, slot pitch, letter size, row width]`. Each word must get a bigger size than a
longer one, every row must stay inside the play area (`rowShareOfPlayArea` below 1), no
glyph may reach past its slot, the filled slot's bar must read `0`, and the page must not
scroll.

### screenshots

`node tools/qa-fixture.mjs mid lost win kbd` writes `_qa_*.html` — pages with a game
seeded into `localStorage`, so a headless browser lands on a board in a chosen state:

```
msedge --headless=new --disable-gpu --no-first-run --hide-scrollbars \
  --force-device-scale-factor=1 --user-data-dir=.qa-seed \
  --window-size=1280,800 --virtual-time-budget=25000 \
  --screenshot=qa/desktop-mid.png file:///…/_qa_mid.html
```

Headless Chromium will not make its window narrower than about 491 CSS px, so phone
shots are taken at `--window-size=500,900`; a true 390 px viewport needs DevTools
emulation. When a layout question comes up, `node tools/qa-probe.mjs` prints the real
box sizes from inside the running page. The images in `qa/` are the current output, not
a golden reference — regenerate them after touching the view.
