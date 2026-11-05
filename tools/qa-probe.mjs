// tools/qa-probe.mjs — temporary: measure the running page from inside a headless
// browser. Writes _qa_probe.html (a page + a measuring script; pass a fixture name to
// measure that state) and prints what that page reports, so layout questions get
// numbers instead of guesses.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// a fixture may be named on the command line (e.g. _qa_kbd.html, to measure the
// desktop keyboard while it is shown); otherwise the seeded fixture page, if it
// exists, so the probe runs against a known game
const base = process.argv[2] || (existsSync(path.join(root, "_qa_mid.html")) ? "_qa_mid.html" : "index.html");
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
            // a keyboard key: the box it offers a thumb, and how its letter is set
            key: key
              ? (() => {
                  const r = key.getBoundingClientRect();
                  const cs = getComputedStyle(key);
                  return [Math.round(r.width), Math.round(r.height), cs.fontSize, cs.fontWeight];
                })()
              : null,
            // the state the fixture left on screen, measured before anything is typed:
            // the barrage below ends the word it plays, and an ended word brings its
            // own line and button into the column — this is the size to compare against
            atRest: (() => {
              const line = document.getElementById("tried");
              const area = document.getElementById("play");
              const bar = document.querySelector(".hud");
              if (!line || !area || !bar) return null;
              const cs = getComputedStyle(line);
              const barBox = bar.getBoundingClientRect();
              return {
                inner: [window.innerWidth, window.innerHeight],
                scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
                playOver: area.scrollHeight - area.clientHeight,
                hud: [Math.round(barBox.y), Math.round(barBox.height)],
                controls: [...document.querySelectorAll(".hud .chip")].map((b) => {
                  const r = b.getBoundingClientRect();
                  return [b.id, Math.round(r.x), Math.round(r.width), Math.round(r.height)];
                }),
                tried: [
                  Math.round(line.getBoundingClientRect().height),
                  cs.fontSize,
                  cs.fontWeight,
                  cs.color,
                  cs.marginTop,
                  cs.display,
                ],
              };
            })(),
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
            // every control in the top bar: where it stands, and how big a press target it is
            controls: [...document.querySelectorAll(".hud .chip")].map((b) => {
              const r = b.getBoundingClientRect();
              return [
                b.id,
                Math.round(r.x),
                Math.round(r.width),
                Math.round(r.height),
                getComputedStyle(b).fontSize,
              ];
            }),
            // the bar itself: a control that grows must not make the bar grow with it
            hud: (() => {
              const bar = document.querySelector(".hud");
              if (!bar) return null;
              const r = bar.getBoundingClientRect();
              return [Math.round(r.y), Math.round(r.height)];
            })(),
            // the drawing: it is sized by the room the page has, so it must keep the
            // height it had when the keyboard appears, not be asked to step back
            gallows: (() => {
              const g = document.getElementById("gallows");
              if (!g) return null;
              const r = g.getBoundingClientRect();
              return [Math.round(r.width), Math.round(r.height)];
            })(),
            // the record of used letters, with its distance below the word row
            tried: (() => {
              const t = document.getElementById("tried");
              if (!t) return null;
              const r = t.getBoundingClientRect();
              const cs = getComputedStyle(t);
              const w = document.getElementById("word").getBoundingClientRect();
              return [
                Math.round(r.width),
                Math.round(r.height),
                cs.fontSize,
                cs.fontWeight,
                cs.color,
                Math.round(r.top - w.bottom),
                cs.display,
              ];
            })(),
            // when the page does scroll, say what hangs below the window
            overflowing: [...document.querySelectorAll("body *")]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.height > 0 && r.bottom > window.innerHeight + 0.5;
              })
              .slice(0, 8)
              .map((el) => {
                const name = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "");
                const cls = typeof el.className === "string" ? "." + el.className.split(" ")[0] : "";
                return name + cls + " bottom=" + Math.round(el.getBoundingClientRect().bottom);
              }),
            // the interface language as the running page applies it: the page's own
            // lang and title, what the top bar and panels actually say, and any
            // English word left visible on the page (an i18n gap I did not mark up)
            ui: (() => {
              const text = (id) => {
                const el = document.getElementById(id);
                return el ? el.textContent : null;
              };
              const tells = [
                "score", "high score", "Game Over", "Continue", "word", "words", "letters",
                "dictionary", "loading", "found", "entries", "Keys", "Saved data", "close",
                "next", "switch", "explain", "theme", "sound", "keyboard",
              ];
              const leftovers = [];
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const owner = node.parentElement;
                if (!owner || owner.closest("script,style")) continue;
                // the backslashes are doubled because this whole block is a template
                // literal: one backslash would be eaten before the page ever sees it
                const clean = String(node.nodeValue || "")
                  .replace(/\\{\\w+\\}/g, " ")
                  .replace(/[\\w.-]*\\.(?:txt|py|html|js)\\b/g, " ")
                  .replace(/https?\\b/g, " ")
                  .replace(/F\\d+/g, " ");
                for (const tell of tells) {
                  if (new RegExp("(^|[^A-Za-z])" + tell + "([^A-Za-z]|$)").test(clean)) {
                    leftovers.push([owner.tagName.toLowerCase() + "#" + (owner.id || owner.className || ""), tell, clean.trim().slice(0, 60)]);
                  }
                }
              }
              return {
                htmlLang: document.documentElement.lang,
                title: document.title,
                languageButton: text("btn-language"),
                themeButton: text("btn-theme"),
                explainButton: text("btn-explain"),
                kbdTitle: (document.getElementById("btn-kbd") || {}).title,
                soundTitle: (document.getElementById("btn-sound") || {}).title,
                noteFont: (() => {
                  const b = document.getElementById("btn-sound");
                  return b ? getComputedStyle(b).fontSize : null;
                })(),
                noteBox: (() => {
                  const b = document.getElementById("btn-sound");
                  if (!b) return null;
                  const r = b.getBoundingClientRect();
                  return [Math.round(r.width), Math.round(r.height)];
                })(),
                status: [text("highscore"), text("score")],
                tabs: [...document.querySelectorAll(".tab")].map((b) => b.textContent),
                dataButtons: ["data-apply", "data-export", "data-export-history", "data-reset"].map(text),
                helpFirstRow: (() => {
                  const row = document.querySelector(".keys tr");
                  return row ? [...row.children].map((c) => c.textContent.slice(0, 40)) : null;
                })(),
                messageLines: [...document.querySelectorAll("#message .msg-line")].map((d) => d.textContent),
                englishLeftVisible: leftovers.slice(0, 8),
              };
            })(),
          };
          // the report is read back out of the dumped DOM; it is written into a
          // zero-size box so it cannot add any scroll height of its own
          const reportBox = document.createElement("pre");
          reportBox.id = "probe-report";
          reportBox.setAttribute(
            "style",
            "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none",
          );
          reportBox.textContent = JSON.stringify(report);
          document.body.appendChild(reportBox);
        }, 1500);
      });
    </script>
  </body>`;

const out = path.join(root, "_qa_probe.html");
writeFileSync(out, html.replace(marker, probe), "utf8");
console.log(out);
