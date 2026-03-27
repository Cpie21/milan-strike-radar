import { fetchAndFilter, transformRows, upsertToSupabase } from '../lib/strikeSync';

const today = new Date().toISOString().slice(0, 10);

async function run() {
  const rawRows = await fetchAndFilter();
  const records = await transformRows(rawRows);
  const futureRecords = records.filter((record) => record.date >= today);
  const upserted = await upsertToSupabase(futureRecords);

  console.log(`Rebuilt ${upserted} future strike rows from shared sync logic.`);
}

run().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
