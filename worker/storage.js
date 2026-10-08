function database(env) {
  if (!env.DB?.prepare) throw new Error('Dashboard storage unavailable');
  return env.DB;
}
export async function readSnapshot(env) {
  const row = await database(env).prepare('SELECT body, revision, saved_at FROM dashboard_snapshots WHERE id = 1').first();
  return row ? {snapshot:JSON.parse(row.body),revision:row.revision,savedAt:row.saved_at,storage:'database'} : null;
}
export async function writeSnapshot(env, snapshot, expectedRevision) {
  const current = await readSnapshot(env);
  if ((current?.revision ?? 0) !== expectedRevision) return {conflict:true};
  const body=JSON.stringify(snapshot);
  if (current && JSON.stringify(current.snapshot) === body) return {...current,unchanged:true};
  if (current && Date.parse(snapshot.updatedAt) < Date.parse(current.snapshot.updatedAt)) return {stale:true};
  const now = new Date().toISOString();
  // Compare-and-swap in the statement prevents lost updates between the read and write.
  const row = current
    ? await database(env).prepare('UPDATE dashboard_snapshots SET body = ?, revision = revision + 1, observed_ms = ?, saved_at = ? WHERE id = 1 AND revision = ? RETURNING revision, saved_at').bind(body,Date.parse(snapshot.updatedAt),now,expectedRevision).first()
    : await database(env).prepare('INSERT INTO dashboard_snapshots (id, body, revision, observed_ms, saved_at) VALUES (1, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING revision, saved_at').bind(body,Date.parse(snapshot.updatedAt),now).first();
  if (!row) return {conflict:true};
  return {snapshot,revision:row.revision,savedAt:row.saved_at,storage:'database'};
}
