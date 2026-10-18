import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workerPath = resolve(projectRoot, "dist/server/index.js");
const manifestPath = resolve(projectRoot, "dist/.openai/hosting.json");

const [source, manifest] = await Promise.all([
  readFile(workerPath, "utf8"),
  readFile(manifestPath, "utf8"),
]);
const config=JSON.parse(manifest);
if(config.d1){
 assert.equal(config.d1,'DB');
 const migrationRoot=resolve(projectRoot,'dist/.openai/drizzle');
 const journal=JSON.parse(await readFile(resolve(migrationRoot,'meta/_journal.json'),'utf8'));
 assert.equal(journal.dialect,'sqlite');assert.ok(journal.entries.length);
 for(const entry of journal.entries){
  assert.match(entry.tag,/^[a-zA-Z0-9_-]+$/);
  const sql=await readFile(resolve(migrationRoot,entry.tag+'.sql'),'utf8');
  assert.ok(sql.trim());assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i,'Las migraciones deben limitarse al esquema.');
 }
}

// A data URL forces ESM parsing even though the generated output has no package.json.
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const workerModule = await import(moduleUrl);
assert.equal(
  typeof workerModule.default?.fetch,
  "function",
  `${pathToFileURL(workerPath)} must export default.fetch`,
);

console.log("Artifact is valid ESM and exports default.fetch");
