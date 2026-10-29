/**
 * check-dials-prod: fail if a production iOS bundle contains DevTools/Rozenite code.
 *
 * WHY IT EXISTS
 * An early `if (!__DEV__) return` before a `require()` does NOT strip the
 * required module: Metro still bundles it. Only a constant-folded branch such as
 * `const loadBridge = __DEV__ ? () => require(...) : null` removes it. This
 * script guards that guarantee by exporting a production bundle and grepping it.
 *
 * FLOW
 *   1. `expo export --platform ios` with APP_ENV=production and no WITH_ROZENITE
 *   2. Locate the bundle (.hbc, or .js) under <out>/_expo/static/js/ios/
 *   3. Count occurrences of each forbidden marker string in the bundle bytes
 *   4. Remove the output dir; exit 1 if any marker was found, else 0
 *
 * USAGE: bun run dials:check-prod
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Constants
// ============================================================================

const MARKERS = ["rozenite", "getRozeniteDevToolsClient", "__FUSEBOX_REACT_DEVTOOLS_DISPATCHER__"];
const ROOT = join(__dirname, "..");

// ============================================================================
// Helpers
// ============================================================================

function countOccurrences(haystack: Buffer, needle: string): number {
  const needleBuf = Buffer.from(needle);
  let count = 0;
  let index = haystack.indexOf(needleBuf);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needleBuf, index + needleBuf.length);
  }
  return count;
}

function findBundle(outDir: string): string | null {
  const dir = join(outDir, "_expo", "static", "js", "ios");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir);
  const bundle = files.find((f) => f.endsWith(".hbc")) ?? files.find((f) => f.endsWith(".js"));
  return bundle ? join(dir, bundle) : null;
}

// ============================================================================
// Main
// ============================================================================

function main(): number {
  const outDir = mkdtempSync(join(tmpdir(), "dials-prod-check-"));
  try {
    mkdirSync(join(ROOT, "node_modules/react-native-worklets/.worklets"), { recursive: true });

    const env: NodeJS.ProcessEnv = { ...process.env, APP_ENV: "production" };
    delete env.WITH_ROZENITE;

    console.log(`Exporting production iOS bundle to ${outDir} ...`);
    const result = spawnSync(
      "bunx",
      ["expo", "export", "--platform", "ios", "--output-dir", outDir],
      { cwd: ROOT, env, stdio: "inherit" },
    );
    if (result.status !== 0) {
      console.error(`expo export failed (exit ${result.status}).`);
      return 2;
    }

    const bundlePath = findBundle(outDir);
    if (!bundlePath) {
      console.error("No .hbc/.js bundle found under _expo/static/js/ios/.");
      return 2;
    }

    const bytes = readFileSync(bundlePath);
    console.log(`\nBundle: ${bundlePath} (${bytes.length} bytes)`);

    let leaked = false;
    for (const marker of MARKERS) {
      const count = countOccurrences(bytes, marker);
      console.log(`  ${marker}: ${count}`);
      if (count > 0) leaked = true;
    }

    console.log(leaked ? "\nFAIL: dev-only DevTools code leaked into the production bundle." : "\nOK: no markers found.");
    return leaked ? 1 : 0;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

process.exit(main());
