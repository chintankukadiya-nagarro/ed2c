// Starts the same Hydrogen app once per brand, each on its own HTTPS host.
// Starts them one after another so they don't fight over `.react-router` types.
//   npm run dev                  all three sites
//   npm run dev -- kerastase     one site
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALL = ["house", "laroche-posay", "kerastase"];
const COLORS = { house: 33, "laroche-posay": 34, kerastase: 35 };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "apps", "storefront");
const vite = path.join(root, "node_modules", "vite", "bin", "vite.js");

const requested = process.argv.slice(2);
const unknown = requested.filter((brand) => !ALL.includes(brand));
if (unknown.length) {
  console.error(`Unknown brand: ${unknown.join(", ")}. Use ${ALL.join(", ")}.`);
  process.exit(1);
}
const brands = requested.length ? requested : ALL;

const env = { ...process.env, CI: process.env.CI ?? "1" };
const children = [];

function pipe(brand, stream, out) {
  const prefix = `\x1b[${COLORS[brand]}m[${brand}]\x1b[0m `;
  let buffered = "";
  stream.on("data", (chunk) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    for (const line of lines) out.write(`${prefix}${line}\n`);
  });
}

function start(brand) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [vite, "dev", "--mode", brand], { cwd: app, env });
    children.push(child);
    let ready = false;
    const onReady = (chunk) => {
      if (ready) return;
      if (String(chunk).includes("ready in")) {
        ready = true;
        resolve(child);
      }
    };
    child.stdout.on("data", onReady);
    child.stderr.on("data", onReady);
    pipe(brand, child.stdout, process.stdout);
    pipe(brand, child.stderr, process.stderr);
    child.on("exit", (code) => {
      process.stdout.write(`\x1b[${COLORS[brand]}m[${brand}]\x1b[0m exited with code ${code}\n`);
      if (!ready) reject(new Error(`${brand} failed to start`));
      else shutdown(code ?? 1);
    });
  });
}

function shutdown(code = 0) {
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const brand of brands) {
  await start(brand);
}
