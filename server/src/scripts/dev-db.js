/**
 * A local MongoDB for development, with no install needed:
 *
 *   npm run dev:db
 *
 * Runs as a one-node replica set (onboarding uses transactions) on port 27017
 * and keeps its data in server/.devdb between runs.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const dbPath = fileURLToPath(new URL("../../.devdb", import.meta.url));
mkdirSync(dbPath, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ port: 27017, dbPath }],
});

console.log("Dev MongoDB ready at mongodb://127.0.0.1:27017/?directConnection=true");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await replSet.stop({ doCleanup: false });
    process.exit(0);
  });
}
