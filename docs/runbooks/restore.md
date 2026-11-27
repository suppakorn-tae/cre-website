# Restore runbook: PostgreSQL and reports

Spec: Architecture v2.3 AD-26 (Backup and recovery), Database Design v1.1 section 8.
Targets: RPO 5 minutes, RTO 4 hours. Applies only when `BACKUP_ENABLED=true`.

## What is protected

| Store | How | Where |
| --- | --- | --- |
| PostgreSQL | pgBackRest, WAL every 60 s | repo1 (rolling) and repo2 (monthly, object lock) |
| RustFS `reports/` | nightly 03:00 copy | `<BACKUP_S3_BUCKET>/reports-mirror/` |
| RustFS `exports/`, Valkey | not backed up | re-run the export; users log in again |
| `.env`, backup cipher passphrase | team secret store | never next to the backups |

Schedule (Asia/Bangkok): full on Sunday 02:00, differential other days
02:00, first Sunday of the month also a full into repo2. Repo1 keeps 5
full backups plus all WAL between them. Repo2 keeps 12. A restore
check of the newest backup runs on the 15th at 04:00.

Without `BACKUP_CIPHER_PASS` no backup can be read. Keep it outside the server.

## Enable, disable, switch

1. Set `BACKUP_ENABLED` and the `BACKUP_*` variables in `.env`
   (see the list at the end).
2. Run `deploy/backup/deploy.sh up -d`. The wrapper sets the `backup`
   profile and `archive_mode` together and runs preflight. Preflight
   fails with a clear message if the profile and `archive_mode`
   disagree (profile on with archiving off, or the reverse).
3. `archive_mode` needs a PostgreSQL restart. The wrapper recreates
   `db`; writes pause for a few seconds.
4. First start takes a full backup and a restore check automatically.
   PITR history starts at that full backup; nothing earlier can be
   recovered. Confirm:
   `deploy/backup/deploy.sh logs backup | grep -E "restore check|check"`.
5. When disabled, existing off-site backups stay under their retention
   but nothing new is protected and no RPO/RTO is promised.

## Health checks

```
deploy/backup/deploy.sh exec backup gosu postgres pgbackrest --stanza=cre info
deploy/backup/deploy.sh exec backup gosu postgres pgbackrest --stanza=cre check
deploy/backup/deploy.sh exec backup busybox wget -qO- http://localhost:9099/cgi-bin/metrics
```

Metrics exposed by the backup container (port 9099, private-net only):
`backup_enabled`, `backup_last_backup_age_seconds`,
`backup_last_wal_age_seconds`, `backup_check_ok`. Alert when WAL age is
over 600 s, backup age over 93600 s (26 h), or `backup_check_ok` is 0.
`-1` means never.

## Scenario A: lose the database host (restore to latest)

Goal: every change up to the failure, including account deletions.

1. Provision the host, restore `.env` from the secret store, check out the repo.
2. Start everything except the app:
   `deploy/backup/deploy.sh up -d valkey rustfs gotenberg`
3. Restore into the (empty) `pgdata` volume with a one-off container.
   `db` is not started yet. The `backup` service mounts `pgdata` read
   only, so use `docker run` with the volume read-write (build the image
   first with `deploy/backup/deploy.sh build backup`):

   ```
   docker run --rm --env-file .env --network cre_egress-net \
     -v cre_pgdata:/var/lib/postgresql \
     --entrypoint sh cre-pgbackrest:local -c '
       /opt/backup/render-config.sh /etc/pgbackrest/pgbackrest.conf &&
       chown -R postgres:postgres /etc/pgbackrest &&
       gosu postgres pgbackrest --stanza=cre --repo=1 \
         --pg1-path=/var/lib/postgresql/19/docker --delta restore'
   ```

   The default restore replays WAL to the end of the archive.
   The off-site endpoint must be reachable from this container. Use
   `--network <project>_egress-net` (replace `cre` with your Compose
   project name), or any network that reaches the endpoint.
4. Start `backup` first, without its dependencies. `db` replays WAL
   through `backup` (`archive-get`), and `backup` normally waits for a
   healthy `db`, so a plain `up -d` deadlocks:

   ```
   deploy/backup/deploy.sh up -d --no-deps backup
   deploy/backup/deploy.sh up -d
   ```

   PostgreSQL replays WAL and opens.
   Check `select pg_is_in_recovery();` returns `f`.
5. Restore `reports/` if the RustFS volume is lost (see Reports below).
6. A new timeline starts. Run `pgbackrest check`, then take a new full:
   `deploy/backup/deploy.sh exec backup gosu postgres pgbackrest --stanza=cre --type=full backup`.
7. Record the elapsed time; that is the real RTO.

If repo1 is lost or unreadable, use `--repo=2` (latest monthly full;
recovers to the end of the WAL archived into repo2).

## Scenario B: undo a mistake (PITR to a separate instance)

Production is never rolled back as a whole, as that would also undo
later work and later account deletions. Restore to just before the
mistake in a separate instance and copy the affected rows back.

1. Pick the target time in UTC, just before the mistake, for example
   `2026-11-24 03:14:00+00`.
2. Restore into a scratch volume with a throwaway container. It reads
   the repository directly and publishes nothing:

   ```
   docker volume create pitr-data
   docker run --rm --env-file .env --network cre_egress-net \
     -v pitr-data:/var/lib/postgresql \
     --entrypoint sh cre-pgbackrest:local -c '
       /opt/backup/render-config.sh /etc/pgbackrest/pgbackrest.conf &&
       chown -R postgres:postgres /etc/pgbackrest &&
       gosu postgres pgbackrest --stanza=cre --repo=1 \
         --pg1-path=/var/lib/postgresql/19/docker --delta \
         --type=time "--target=2026-11-24 03:14:00+00" \
         --target-action=promote restore'
   ```

3. Start it on another port with archiving off so it cannot write
   into the production repository. It needs the same `.env` and a
   network that reaches the off-site endpoint, because recovery to the
   target reads WAL from the repository (`restore_command`), and it
   needs a rendered `pgbackrest.conf`:

   ```
   docker run -d --name pitr --env-file .env --network cre_egress-net \
     -v pitr-data:/var/lib/postgresql \
     -p 127.0.0.1:55432:5432 --entrypoint sh cre-pgbackrest:local -c '
       /opt/backup/render-config.sh /etc/pgbackrest/pgbackrest.conf &&
       chown -R postgres:postgres /etc/pgbackrest &&
       exec gosu postgres postgres -c archive_mode=off \
         -c unix_socket_directories=/tmp'
   ```

   The target must lie before the last archived transaction, otherwise
   recovery stops with `recovery ended before configured recovery
   target was reached`.

4. Inspect and export the rows, then load them into production
   with `psql`/`COPY` inside a transaction, reviewed by a second person:

   ```
   psql -h 127.0.0.1 -p 55432 -U "$POSTGRES_USER" "$POSTGRES_DB"
   ```

5. Clean up: `docker rm -f pitr && docker volume rm pitr-data`.

If the PITR target is earlier than the oldest backup in repo1 (about
5 weeks), use `--repo=2` and a monthly full.

## Scenario C: restore check and drill

- Automatic: `restore-check.sh` restores the newest repo1 backup into
  `/scratch` on the backup container, starts it on a private socket,
  runs smoke queries, and deletes it. It runs after the first full
  and on the 15th at 04:00. Run by hand:
  `deploy/backup/deploy.sh exec backup gosu postgres /opt/backup/restore-check.sh`
- Needs free space in the `backup-scratch` volume of about the database size.
- Once a quarter run Scenario A on a spare host and write down the time.

## Reports (`reports/`)

Files are copied nightly to `<BACKUP_S3_BUCKET>/reports-mirror/` with
rclone `copy` (a deletion in the app does not delete the off-site copy).
`exports/` is never copied.

To restore, from a host that can reach both buckets:

```
rclone copy "DST:<BACKUP_S3_BUCKET>/reports-mirror" "SRC:<S3_BUCKET>/reports"
```

with `DST` and `SRC` defined by `RCLONE_CONFIG_*` env variables as in
`deploy/backup/reports-mirror.sh` (swap source and destination).

## Deleted accounts

An anonymised e-mail can remain in backups up to 5 weeks (12 months in
monthly copies). Backups are never used to bring erased data back into
production: after any restore, re-apply account deletions made since
the restore point if the restore went to an older time.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `pgbackrest check` fails right after enabling | db not restarted with `archive_mode=on`; run via `deploy.sh up -d`, then `show archive_mode;` |
| WAL age grows, `pg_wal` fills | backup container down or repo unreachable; archiving retries and WAL accumulates. Fix the repo or restore `backup` quickly |
| Preflight "mismatch" | fix `.env`; do not set `COMPOSE_PROFILES=backup` or `POSTGRES_ARCHIVE_MODE` by hand |
| `repo2` expire fails | object lock still active on old data; expected until the lock period ends |
| `unable to find backup` on restore | wrong `--repo`, or wrong `BACKUP_CIPHER_PASS` |

## Variables (`.env`)

`BACKUP_ENABLED`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`,
`BACKUP_S3_BUCKET`, `BACKUP_S3_KEY`, `BACKUP_S3_SECRET`,
`BACKUP_S3_PATH_STYLE` (default true), `BACKUP_S3_VERIFY_TLS` (default y),
`BACKUP_LOCK_S3_BUCKET` (object-lock bucket with default retention of
12 months and versioning on), `BACKUP_LOCK_S3_KEY` and
`BACKUP_LOCK_S3_SECRET` (optional, default to the main key),
`BACKUP_CIPHER_PASS` (at least 16 characters, kept in the secret store).
The endpoint must be an off-site provider or region, never the app's RustFS.
