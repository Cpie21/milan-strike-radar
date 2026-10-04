const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('PostgreSQL sync reconciliation, locking and feedback protections', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.strikes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), date date, region text,
        category text, provider text, display_time text, data_source text, status text,
        updated_at timestamptz
      );
      CREATE TABLE public.feedback (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content text);
      GRANT INSERT ON public.feedback TO anon, authenticated;
    `);
    for (const filename of ['20261003190000_strike_sources_and_sync_runs.sql', '20261004134223_sync_reconciliation_and_feedback.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', filename), 'utf8'));
    }
    const begin = async () => (await db.query('SELECT * FROM public.begin_strike_sync()')).rows;
    const finish = async (id) => (await db.query(`SELECT public.finish_strike_sync($1,'2026-09-27','2027-01-02',12,12,2,'[]') AS retired`, [id])).rows[0].retired;

    await t.test('only one caller acquires a running lease', async () => {
      const [a, b] = await Promise.all([begin(), begin()]);
      assert.equal(a.length + b.length, 1);
      await db.exec("UPDATE public.strike_sync_runs SET status='failed'");
    });
    await t.test('expired leases are failed and replaced', async () => {
      const [old] = await begin();
      await db.query("UPDATE public.strike_sync_runs SET started_at=now()-interval '7 minutes' WHERE id=$1", [old.id]);
      const [next] = await begin();
      assert.ok(next);
      assert.equal((await db.query('SELECT status FROM public.strike_sync_runs WHERE id=$1', [old.id])).rows[0].status, 'failed');
      await assert.rejects(finish(old.id), /lease expired or superseded/i);
      await db.query("UPDATE public.strike_sync_runs SET status='failed' WHERE id=$1", [next.id]);
    });
    await t.test('successful snapshot retires removed modes, revised names and unmatched legacy rows', async () => {
      const [run] = await begin();
      const seed = async (provider, category, date, source, status, seen) => db.query(
        'INSERT INTO strikes(provider,category,date,data_source,status,last_seen_at,region) VALUES($1,$2,$3,$4,$5,$6,\'MILANO\')',
        [provider, category, date, source, status, seen]);
      await seed('old name', 'BUS', '2026-10-09', 'MIT_PRIMARY', 'CONFIRMED', '2026-01-01');
      await seed('removed mode', 'TRAIN', '2026-10-09', 'MIT_PRIMARY', 'UNCERTAIN', '2026-01-01');
      await seed('unmatched legacy', 'BUS', '2026-10-09', 'MIT_PRIMARY', 'CONFIRMED', null);
      await seed('fresh', 'BUS', '2026-10-09', 'MIT_PRIMARY', 'CONFIRMED', run.started_at);
      await seed('cancelled', 'BUS', '2026-10-09', 'MIT_PRIMARY', 'CANCELLED', '2026-01-01');
      await seed('secondary', 'BUS', '2026-10-09', 'SECONDARY_VERIFIED', 'CONFIRMED', null);
      await seed('outside window', 'BUS', '2027-02-01', 'MIT_PRIMARY', 'CONFIRMED', '2026-01-01');
      assert.equal(await finish(run.id), 3);
      const rows = (await db.query('SELECT provider,status FROM strikes ORDER BY provider')).rows;
      assert.equal(rows.filter(row => row.status === 'STALE').length, 3);
      assert.equal(rows.find(row => row.provider === 'fresh').status, 'CONFIRMED');
      assert.equal(rows.find(row => row.provider === 'cancelled').status, 'CANCELLED');
      assert.equal(rows.find(row => row.provider === 'secondary').status, 'CONFIRMED');
      assert.equal(rows.find(row => row.provider === 'outside window').status, 'CONFIRMED');
      assert.equal((await db.query('SELECT status,retired FROM strike_sync_runs WHERE id=$1', [run.id])).rows[0].retired, 3);
    });
    await t.test('failure or an invalid cleanup window does not retire existing records', async () => {
      const [run] = await begin();
      await db.exec("INSERT INTO strikes(date,data_source,status) VALUES('2026-10-09','MIT_PRIMARY','CONFIRMED')");
      await assert.rejects(db.query("SELECT finish_strike_sync($1,'2026-01-01','2027-01-01',0,0,0,'[]')", [run.id]), /invalid reconciliation window/i);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM strikes WHERE status='CONFIRMED'")).rows[0].n, 4);
      await db.query("UPDATE strike_sync_runs SET status='failed' WHERE id=$1", [run.id]);
    });
    await t.test('feedback limit counts atomically and resets after its window', async () => {
      const hash = 'a'.repeat(64);
      for (let i = 0; i < 7; i++) {
        const allowed = (await db.query('SELECT consume_feedback_limit($1) AS allowed', [hash])).rows[0].allowed;
        assert.equal(allowed, i < 5);
      }
      await db.exec("UPDATE feedback_rate_limits SET window_start=now()-interval '2 hours'");
      assert.equal((await db.query('SELECT consume_feedback_limit($1) AS allowed', [hash])).rows[0].allowed, true);
    });
    await t.test('anonymous callers cannot write feedback or execute protected RPCs', async () => {
      await db.exec('SET ROLE anon');
      await assert.rejects(db.query("INSERT INTO feedback(content) VALUES('spam')"), /permission denied/);
      await assert.rejects(db.query('SELECT * FROM begin_strike_sync()'), /permission denied/);
      await assert.rejects(db.query('SELECT consume_feedback_limit($1)', ['b'.repeat(64)]), /permission denied/);
      await db.exec('RESET ROLE');
    });
  } finally { await db.close(); }
});
