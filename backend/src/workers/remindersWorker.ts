import dotenv from "dotenv";

dotenv.config();

import {
  runDailyGenerationTick,
  runMissedDoseTick,
} from "../infrastructure/db/reminders";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n =
    typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

async function main() {
  const genEveryMs = clampInt(
    process.env.REMINDERS_GENERATION_EVERY_MS,
    5 * 60_000,
    10_000,
    24 * 60 * 60_000,
  );
  const missedEveryMs = clampInt(
    process.env.REMINDERS_MISSED_EVERY_MS,
    60_000,
    10_000,
    60 * 60_000,
  );

  const daysAhead = clampInt(process.env.REMINDERS_DAYS_AHEAD, 7, 1, 31);
  const batchLimit = clampInt(process.env.REMINDERS_BATCH_LIMIT, 250, 1, 5000);
  const windowMinutes = clampInt(
    process.env.REMINDERS_MIDNIGHT_WINDOW_MINUTES,
    20,
    1,
    120,
  );

  let shuttingDown = false;

  const shutdown = () => {
    shuttingDown = true;
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // eslint-disable-next-line no-console
  console.log("reminders worker started", {
    genEveryMs,
    missedEveryMs,
    daysAhead,
    batchLimit,
    windowMinutes,
  });

  let nextGenAt = 0;
  let nextMissedAt = 0;

  while (!shuttingDown) {
    const now = Date.now();

    if (now >= nextGenAt) {
      nextGenAt = now + genEveryMs;
      try {
        const result = await runDailyGenerationTick({
          batchLimit,
          daysAhead,
          windowMinutes,
        });
        // eslint-disable-next-line no-console
        console.log("reminders generation tick", result);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("reminders generation tick failed:", err);
      }
    }

    if (now >= nextMissedAt) {
      nextMissedAt = now + missedEveryMs;
      try {
        const result = await runMissedDoseTick({ batchLimit });
        // eslint-disable-next-line no-console
        console.log("reminders missed-dose tick", result);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("reminders missed-dose tick failed:", err);
      }
    }

    await sleep(1000);
  }

  // eslint-disable-next-line no-console
  console.log("reminders worker stopped");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
