// tools/qa-probe.mjs — temporary: measure the running page from inside a headless
// browser. Writes _qa_probe.html (index.html + a measuring script) and prints what
// that page reports, so layout questions get numbers instead of guesses.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// the seeded fixture page, if it exists, so the probe runs against a known game
const base = existsSync(path.join(root, "_qa_mid.html")) ? "_qa_mid.html" : "index.html";
const html = readFileSync(path.join(root, base), "utf8");
const marker = "</body>";

const probe = `
    <script>
      // seeded by tools/qa-probe.mjs
      addEventListener("load", () => {
        setTimeout(() => {
          const box = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return [Math.round(r.width), Math.round(r.height), Math.round(r.left)];
          };
          const kb = document.getElementById("keyboard");
          const row = kb && kb.querySelector(".kbd-row");
          const key = row && row.querySelector(".key");
          const word = document.getElementById("word");
          const cell = word && word.querySelector(".cell");
          const report = {
            dpr: window.devicePixelRatio,
            inner: [window.innerWidth, window.innerHeight],
            meta: (document.querySelector('meta[name="viewport"]') || {}).content || null,
            app: box(document.querySelector(".app")),
            play: box(document.getElementById("play")),
            word: box(word),
            cell: cell ? [cell.getBoundingClientRect().width, getComputedStyle(cell).width] : null,
            pitch: word ? getComputedStyle(word).getPropertyValue("--cell") : null,
            letterSize: word ? getComputedStyle(word).getPropertyValue("--letter-size") : null,
            // what a reload would find: the record written after every key press
            persisted: (() => {
              const raw = localStorage.getItem("hangman.saved.v1");
              if (!raw) return null;
              const saved = JSON.parse(raw);
              return {
                word: saved.current_word,
                guessed: saved.guessed_letters.length,
                wrong: saved.wrong_guesses,
                score: saved.score,
              };
            })(),
            letters: word ? word.children.length : null,
            // the "_" of a slot that has been filled in must not be drawn
            solvedBarOpacity: (() => {
              const solved = word && word.querySelector(".cell.solved");
              return solved ? getComputedStyle(solved, "::after").opacity : null;
            })(),
            scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
            keyboard: box(kb),
            kbDisplay: kb ? getComputedStyle(kb).display : null,
            row: box(row),
            key: key ? [key.getBoundingClientRect().width, getComputedStyle(key).minWidth] : null,
            // the word is played out and a new one dealt, six times over: each word
            // is measured with the size it was given, no glyph may reach past its own
            // slot, and the row must always stay inside the play area
            words: (() => {
              const alphabet = "aąbcćdeęfghijklłmnńoópqrsśtuvwxyzźż";
              const press = (ch) =>
                document.body.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
              const play = document.getElementById("play");
              const samples = [];
              let spill = 0;
              let worstRow = 0;
              for (let round = 0; round < 6; round += 1) {
                for (const ch of alphabet) press(ch);
                press(" "); // the next word, once this one is won or lost
                const cells = [...word.querySelectorAll(".cell")];
                cells.forEach((cell) => {
                  const glyph = cell.querySelector(".glyph");
                  if (!glyph.textContent) return;
                  const g = glyph.getBoundingClientRect();
                  const s = cell.getBoundingClientRect();
                  spill = Math.max(spill, g.right - s.right, s.left - g.left);
                });
                const rowBox = word.getBoundingClientRect();
                const area = play.getBoundingClientRect();
                worstRow = Math.max(
                  worstRow,
                  rowBox.width / area.width,
                  (rowBox.right - area.right) / area.width,
                  (area.left - rowBox.left) / area.width,
                );
                samples.push([
                  cells.length,
                  getComputedStyle(word).getPropertyValue("--cell").trim(),
                  getComputedStyle(word).getPropertyValue("--letter-size").trim(),
                  Math.round(rowBox.width),
                ]);
              }
              for (const ch of "aon") press(ch); // leave a record worth reading back
              // finish the last word, so the end-of-word message and the Continue
              // button are on screen for the measurements taken below
              for (const ch of alphabet) press(ch);
              return {
                byWord: samples,
                glyphSpillPastSlot: Math.round(spill * 100) / 100,
                rowShareOfPlayArea: Math.round(worstRow * 1000) / 1000,
              };
            })(),
            // the end-of-word line as the running page actually writes it
            message: (() => {
              const host = document.getElementById("message");
              const line = host && host.querySelector(".msg-line");
              return line ? line.textContent : null;
            })(),
            // the only control that moves on from a finished word
            continueBtn: (() => {
              const b = document.getElementById("btn-continue");
              if (!b) return null;
              const r = b.getBoundingClientRect();
              return [Math.round(r.width), Math.round(r.height), getComputedStyle(b).fontSize];
            })(),
            // every control in the top bar, with its press target
            controls: [...document.querySelectorAll(".hud .controls .chip")].map((b) => {
              const r = b.getBoundingClientRect();
              return [b.id, Math.round(r.width), Math.round(r.height), getComputedStyle(b).fontSize];
            }),
          };
          document.title = "PROBE " + JSON.stringify(report);
        }, 1500);
      });
    </script>
  </body>`;

const out = path.join(root, "_qa_probe.html");
writeFileSync(out, html.replace(marker, probe), "utf8");
console.log(out);
