const STORAGE_DELETION_BATCH_SIZE = 100;

type StorageDeletionRow = {
  object_key: string;
  attempts: number;
};

export type StorageDeletionResult = {
  selected: number;
  deleted: number;
  failed: number;
};

export async function drainStorageDeletionOutbox(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  now = new Date()
): Promise<StorageDeletionResult> {
  const rows = await env.DB.prepare(
    `SELECT object_key, attempts
     FROM storage_deletion_outbox
     WHERE next_attempt_at <= ?
     ORDER BY created_at
     LIMIT ?`
  )
    .bind(now.toISOString(), STORAGE_DELETION_BATCH_SIZE)
    .all<StorageDeletionRow>();
  const selected = rows.results;
  if (selected.length === 0) {
    return { selected: 0, deleted: 0, failed: 0 };
  }

  const objectKeys = selected.map((row) => row.object_key);
  try {
    await env.MEDIA_BUCKET.delete(objectKeys);
    await env.DB.batch(
      objectKeys.map((objectKey) =>
        env.DB.prepare(
          "DELETE FROM storage_deletion_outbox WHERE object_key = ?"
        ).bind(objectKey)
      )
    );
    return {
      selected: selected.length,
      deleted: selected.length,
      failed: 0
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "R2 deletion failed";
    await env.DB.batch(
      selected.map((row) => {
        const attempts = row.attempts + 1;
        const retrySeconds = Math.min(24 * 60 * 60, 60 * 2 ** Math.min(attempts - 1, 10));
        return env.DB.prepare(
          `UPDATE storage_deletion_outbox
           SET attempts = ?, next_attempt_at = ?, last_error = ?
           WHERE object_key = ?`
        ).bind(
          attempts,
          new Date(now.getTime() + retrySeconds * 1_000).toISOString(),
          message,
          row.object_key
        );
      })
    );
    console.error(
      JSON.stringify({
        message: "R2 deletion outbox failed",
        object_count: selected.length,
        error: message
      })
    );
    return {
      selected: selected.length,
      deleted: 0,
      failed: selected.length
    };
  }
}
