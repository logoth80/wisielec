/* qa-read-report.mjs — print the report a probe page left in a dumped DOM.
 *
 *   node tools/qa-probe.mjs _qa_mid.html
 *   msedge ... --dump-dom .../_qa_probe.html > qa/_dump.html
 *   node tools/qa-read-report.mjs qa/_dump.html
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node tools/qa-read-report.mjs <dumped-dom.html>");
  process.exit(2);
}
const raw = readFileSync(file);
// a shell redirect may hand us UTF-16 with a BOM; read that as what it is
const dump =
  raw[0] === 0xff && raw[1] === 0xfe
    ? raw.subarray(2).toString("utf16le")
    : raw[0] === 0xfe && raw[1] === 0xff
      ? raw.subarray(2).swap16().toString("utf16le")
      : raw.toString("utf8");
const match = dump.match(/<pre id="probe-report"[^>]*>([\s\S]*?)<\/pre>/);
if (!match) {
  console.error("no probe report in " + file + " — the page did not finish its probe");
  process.exit(1);
}
const text = match[1]
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");
console.log(JSON.stringify(JSON.parse(text), null, 1));
