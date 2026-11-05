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
| `tools/qa-fixture.mjs`, `tools/qa-probe.mjs` | seeded pages, and what the running page measures about itself |

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
- the keys: letters, F1 explain, F3 theme, F10 word finder (upstream's F2, F5 and Esc are
  handled differently here, see below)
- the word finder: `_` for a known-position letter, disallowed letters, exact length

## what is deliberately different

- **The layout is not the pygame window's.** The dictionary switch stands at the left end
  of the top bar, apart from everything else; the controls that belong together — theme,
  explain, and the keyboard / sound / help toggles — are grouped in the middle, and the
  score and the high score sit at the right end. The word finder has no button: F10
  opens it, and the Keys panel is where that is written down. The language switch works by
  clicking it and by nothing else: upstream's F2 does nothing here, and the Keys panel says
  so in place of a key row. On a phone the same controls are sized for a thumb: every
  control in the bar is at least 46 px tall, the icon buttons are 46 px squares with 21 px
  glyphs, and the music note is set at 38 px because that pictogram is far sparser than
  the keyboard one and only reads at the same size that way; on a desktop the same note is
  26 px inside its 36 px box, which does not make the bar any taller. The word being
  guessed is the largest element at every screen size; the gallows and the record of the
  letters already tried are drawn around it — the used letters at nine tenths of the size
  of the word they belong to, close to the source game's 60 pt against 80 pt, so they read
  instead of being a grey whisper.
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
  whether it was in the word or not. With a physical keyboard in play that line stays,
  and it is sized against the word it belongs to rather than fixed small: nine tenths of
  that word's letter size, over a 20 px floor — `calc(var(--letter-size) * 0.9)` — the
  same derivation the source game uses, its `tried_letters` at 60 pt against a word of
  80 pt. Measured: 68 px beside a 76 px word at 1280 × 800, 76 px beside an 85 px one at
  1920 × 1080, with a clear gap under the word row (32–49 px) rather than a crowding of
  it. Size is the only thing that differs from the word's own setting: the line keeps the
  theme's muted colour and an ordinary weight, because a line of letters that will not
  read is more often a bold one than a small one, and this one is secondary to the word by
  weight and colour, not by being shrunk away. If the column does run out of room — a long
  record of used letters, the word just ended with its message and its button below — what
  gives way first is the space under the word, and only then the size, in each case by
  exactly the number of pixels the page is short of rather than by a fixed fraction; the
  fit exists only to keep the page from scrolling, and whatever bought no room is put
  straight back. Measured at its worst (14 letters tried, `tools/qa-fixture.mjs crowded`,
  1280 × 620) that costs 2 px of gap and none of the letters.
  Asked for on a desktop, the keyboard is sized for a hand, not a thumbnail: keys about
  98 × 57 px (up to 68 px tall on a tall window, never below 52 px on a short one) with
  24 px letters at a normal weight — a bold letter on a key is noise, not a letter you
  read. A phone keeps its own 46 px thumb keys, unchanged.
  Nothing is asked to step back for it either: the page is a fixed-height flex
  column and the drawing is sized by the room that leaves, so at 1920 × 1080 the gallows
  measures 312 × 520 whether the keyboard is on or off, and it only gives way when a
  window is genuinely too short for both (411 → 373 px at 1280 × 800). The page does not
  scroll in any of these cases.
- **The toggles show what they are doing.** The keyboard and the sound chip take the same
  filled on-state, so "sound is on" is visible before anything is pressed, and switching
  sound back on answers with one beep.
- `saved.txt`, the preferences and the history live in `localStorage`
  (`hangman.saved.v1`, `hangman.prefs.v1`, `hangman.history.v1`) with the same fields
  and written at the same moments.
- **F10 — F10 alone, with no button for it — searches the dictionary you are actually
  playing.** The desktop `find_words()`
  hard-codes `pruned_polish.txt` whatever language is selected; that reads as a bug, and
  the port does not reproduce it.
- **The dictionary is switched by clicking, not by a key.** Upstream flips English ⇄ Polish
  on F2, reloads the list and starts a new word. Here that is the chip standing at the left
  end of the bar, and F2 does nothing at all: a function key is not reachable on a phone,
  and on a laptop it is a modifier away from being one. The chip names the dictionary in
  play, in the language of the interface (`polski` / `angielski`), and clicking it does what
  F2 did — reload that word list, start a new word. The Keys panel describes the button in
  place of the key row it replaces.
- Esc does nothing at all; there is nothing to quit, and the game is in storage anyway.

## the interface speaks the language you are playing in

The upstream game draws its own messages in English whichever dictionary is selected: the
language switch changes the words, not the writing. The port is different there at the
request of the person playing it — with the Polish dictionary in play, everything on screen
is Polish. The buttons (`polski`, `F3 motyw`, `F1 wyjaśnij`, `?`), the score line
(`rekord: 44  wynik: 3`), the end-of-word lines, the help panel with its Keys table, the
word finder and its notes, the record file's button and tooltips. The word, the letters,
the rules and the arithmetic are untouched. `index.html?lang=polish` opens that way
directly, which is how the screenshots below are taken.

Two things stay English on purpose, being the game's own records rather than its interface:
the contents of `saved.txt` (`language='polish'`, python-repr, byte for byte the format the
desktop writes) and the history lines the original writes (`died at … with N points`). The
page's `<meta name="description">` and its `lang` attribute at parse time are English too;
`lang` and the document title are switched at runtime with everything else.

The text lives in one table in `js/hangman-core.js` — `STRINGS`, one key per piece of text,
and `stringsFor(language)` returning a `t(key, values)` that fills `{placeholders}` through
a single formatter — because the page is three classic `<script src>` files and there is no
build step to add a module to. `index.html` marks its text with `data-i18n`,
`data-i18n-html`, `data-i18n-title` and `data-i18n-label`, and `applyLanguage()` rewrites
those on boot and whenever the language changes, never on a keystroke: redrawing the board
is not re-translating the page. A mark may therefore never point at a string containing a
placeholder, because the sweep would write the template with its hole emptied; anything with
a value in it — the score, the loss line, the keyboard and sound tooltips — is written from
code. `tools/verify-parity.mjs` holds both halves to that: the two tables have the same
keys, every key marked in the page exists in both, no string in the Polish table is English,
and no marked string carries a placeholder.

## checking it

```
node tools/verify-parity.mjs
```

99 checks over ten areas: the dictionary payloads and filter, the word-finder scan,
all 13 palettes, the game rules, the saved-file format, Polish collation, page wiring,
and the interface rules above (one used-letter state, the keyboard replacing the tried
list, no restart control, the dictionary switch standing at the left end of the top bar
with the other controls grouped away from it and the score at its right end, the word sized
to the space it is given and measured against the widest glyph, a filled slot drawing no
bar, the two beeps swapped, touch-sized controls and a touch-sized Continue button, an
end-of-word message that mentions no keys on a touch device, the word finder having no
button and being F10 only,
the sound chip carrying the same on-state as the keyboard chip, a desktop keyboard sized
for a hand with its letters at a normal weight, a drawing sized by the room the page has
rather than one made smaller for the keyboard, a used-letters line sized against the word,
muted in colour and not bold, and giving way by its space before its letters, every
readable text on the page smaller
than the word — the pictogram chips are exempt, being controls in fixed boxes rather than
content), and the translation of that interface (both tables holding the same keys, every key
marked in the page present in both, no English left standing in the Polish table, one
formatter for values in text, no marked string carrying a placeholder, the rules and the
game's own records kept out of the translation, and the Keys panel describing the language
button rather than a key for it). The expected values were measured by running the upstream
Python over these exact dictionary files.

`node tools/qa-probe.mjs [fixture]` prints what the running page actually measures: box
geometry for the app, the play area, the word row, the drawing, the controls in the top
bar and the keyboard (a key as `[width, height, font-size, font-weight]`); the state the
fixture left on screen **before anything is typed** — the top bar with each chip's x
position, height and font, the used-letters line's height, computed size, weight, colour,
margin and display, the play area's own overflow, and whether the document scrolls; the box,
computed size and distance below the word row of the used-letters line afterwards; the state a
reload would find in `localStorage`; the computed opacity of a filled slot's bar; which
elements, if any, reach past the bottom of the window; the end-of-word line as the page wrote it; the size of the Continue
button; the interface's own state (`<html lang>`, the document title, the button labels, the
panel tabs and their buttons, the tooltip of every icon chip) and a count of English words
left in the visible text when the interface should be Polish; and — after playing six words out and dealing new ones —
a sample per word of `[letters, slot pitch, letter size, row width]`. A fixture may be
named to measure a state: `node tools/qa-probe.mjs _qa_kbd.html` measures the desktop
keyboard while it is shown. What has to hold:

- each word larger than a longer one, every row inside the play area
  (`rowShareOfPlayArea` below 1), no glyph reaching past its slot, a filled slot's bar
  reading `0`;
- `scroll` equal to `inner` at every window size, with the keyboard shown or hidden, and
  nothing named under `hanging below`;
- a phone's icon buttons measuring 46 px with the note glyph larger than the rest, and a
  desktop's keys about 98 px wide at a normal letter weight, so even a 620 px-tall window
  holds the whole page;
- the drawing measuring the same for `_qa_mid.html` and `_qa_kbd.html` at 1920 × 1080
  (312 × 520 both) and giving way only when the window is too short for both;
- the used letters, at rest, measuring 0.9 of the letter size of the word in play (68 px
  beside a 76 px word at 1280 × 800), at weight `400` and in the theme's `--faint` colour,
  with the gap under the word row intact;
- `at rest chips` putting `btn-language` at the left edge of the window and the rest of the
  controls between it and the score, all of them the same height, and the note chip's glyph
  at 26 px on a desktop, 38 px on a phone, with the bar no taller for it;
- the `controls` list coming back with six chips — language, theme, explain and the three
  icon toggles — the word finder not among them, because it has no button;
- `html lang`/`title`/labels matching the language of the dictionary in play, and
  `englishLeftVisible` empty on a fixture that should be reading Polish.

### screenshots

`node tools/qa-fixture.mjs mid lost win kbd sndoff crowded` writes `_qa_*.html` — pages with a
game seeded into `localStorage`, so a headless browser lands on a board in a chosen state
(`kbd` has the on-screen keyboard asked for, `sndoff` is the same board with sound
switched off, which is how both halves of the sound indicator are compared, and `crowded` is
the worst case the layout has to survive: a five-letter word at its largest letter size with
fourteen used letters filled under it, three lines of them, in a window 620 px tall):

```
msedge --headless=new --disable-gpu --no-first-run --hide-scrollbars \
  --force-device-scale-factor=1 --user-data-dir=.qa-seed \
  --window-size=1280,800 --virtual-time-budget=25000 \
  --screenshot=qa/desktop-mid.png file:///…/_qa_mid.html
```

The two `_qa_kbd.html` shots — `qa/desktop-kbd.png` at 1280 × 800 and `qa/wide-kbd.png`
at 1920 × 1080 — are kept side by side because together they are the evidence for the two
claims above: the key letters are large at a normal weight, and the drawing is the same
size with the keyboard on as with it off.

Headless Chromium always reports a fine primary pointer whatever the window size, so a
fixture name ending in `-touch` (`win-touch`, `lost-touch`, `mid-touch`) seeds the same
board with `matchMedia("(pointer: coarse)")` stubbed to true — the only way to see the touch
end-of-word message in these shots. The phone images in `qa/` come from those, at
`--window-size=500,900`. A name ending in `-en` (`mid-en`) keeps the same board but switches
its dictionary back to English: the fixtures seed Polish, so that is the pair to compare when
checking that a Polish interface really has no English left in it.

The probe's report is easier to read through `node tools/qa-summarise.mjs qa/_dump.html`,
which turns a dumped DOM into one compact block per window size. `--dump-dom` output goes
through `tools/qa-read-report.mjs` if the JSON is wanted on its own — a PowerShell `>`
redirect writes UTF-16, which that script detects rather than silently mis-decoding.

Headless Chromium will not make its window narrower than about 491 CSS px, so phone
shots are taken at `--window-size=500,900`; a true 390 px viewport needs DevTools
emulation. When a layout question comes up, `node tools/qa-probe.mjs` prints the real
box sizes from inside the running page. The images in `qa/` are the current output, not
a golden reference — regenerate them after touching the view.

`qa/live-desktop.png` and `qa/live-mobile.png` are the same two viewports aimed at the
Pages URL instead of a local file; taking them, and counting `class="cell"` and
`class="key"` in the rendered DOM of the live page, is how a push is checked after it
has deployed.
