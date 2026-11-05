/* qa-summarise.mjs — one readable line per probe dump, for checking several
 * window states at once.
 *
 *   node tools/qa-summarise.mjs qa/_dump-mid800.html qa/_dump-crowded620.html
 *
 * Read together with tools/qa-probe.mjs, which produces the dump.
 */
import { readFileSync } from "node:fs";

function reportOf(file) {
  const raw = readFileSync(file);
  const dump =
    raw[0] === 0xff && raw[1] === 0xfe
      ? raw.subarray(2).toString("utf16le")
      : raw.toString("utf8");
  const m = dump.match(/<pre id="probe-report"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) throw new Error("no probe report in " + file);
  return JSON.parse(
    m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
  );
}

for (const file of process.argv.slice(2)) {
  const r = reportOf(file);
  const line = (label, value) => console.log("  " + label.padEnd(24) + (Array.isArray(value) ? value.join(" ") : value));
  console.log("\n== " + file);
  line("window / scroll", [...r.inner, "vs", ...r.scroll].join(" "));
  line("hanging below", (r.overflowing || []).length ? r.overflowing.join("  ") : "nothing");
  const rest = r.atRest || {};
  line("at rest inner/scroll", [(rest.inner || []).join("x"), (rest.scroll || []).join("x"), "playOver=" + rest.playOver].join(" "));
  line("at rest bar y/h", rest.hud);
  line("at rest chips", (rest.controls || []).map((c) => c.join(":")).join("  "));
  line("at rest tried", rest.tried);
  line("word", [r.letters + " letters", r.pitch, r.letterSize].join(" "));
  line("tried", r.tried);
  line("gallows", r.gallows);
  line("keyboard", [r.kbDisplay, r.keyboard, r.key].join(" "));
  line("top bar y/h", r.hud);
  line("chips (id x w h font)", r.controls.map((c) => c.join(":")).join("  "));
  line("note glyph / box", [r.ui.noteFont, r.ui.noteBox].join(" "));
  line("html lang / title", [r.ui.htmlLang, r.ui.title].join(" | "));
  line("language / F3 / F1", [r.ui.languageButton, r.ui.themeButton, r.ui.explainButton].join(" | "));
  line("titles", [r.ui.kbdTitle, r.ui.soundTitle].join(" | "));
  line("status", r.ui.status.join(" | "));
  line("tabs", r.ui.tabs.join(" | "));
  line("panel buttons", r.ui.dataButtons.join(" | "));
  line("message", (r.ui.messageLines || []).join(" | "));
  line("english left visible", r.ui.englishLeftVisible.length
    ? r.ui.englishLeftVisible.map((x) => x[0] + "→" + x[1]).join(" ")
    : "none");
  line("rowShare / spill", [r.words.rowShareOfPlayArea, r.words.glyphSpillPastSlot].join(" "));
  line("solved bar opacity", r.solvedBarOpacity);
}
