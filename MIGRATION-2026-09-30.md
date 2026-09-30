# Upgrade horizonlb while preserving existing data

Compared: the schema-only export you supplied, dated 30 September 2026, from MySQL 8.0.46, against this workspace's `elec-app/server/db/schema.sql`.

No connection to your online server was made and no live database was changed.

## Exact changes required

Both versions contain 36 tables. All existing column definitions, equivalent indexes and foreign-key relationships match after accounting for local database-engine defaults. Only these additions are required:

| Table | Additions |
| --- | --- |
| clients | updated_at, deleted_at, idx_clients_deleted_at |
| product_discounts | updated_at, deleted_at, idx_product_discounts_deleted_at |

Use `elec-app/server/db/migrations/20260930_clients_discounts_audit.sql`. It contains conditional ADD COLUMN / ADD INDEX operations and is rerunnable. It does not delete or rewrite existing business fields, reset IDs, replace tables, seed users, or recalculate project totals. Existing rows get deleted_at=NULL, so they remain visible. The new updated_at value starts at migration time; historical update times cannot be reconstructed from this export.

Do not import `/root/schema_export.sql` into horizonlb: it contains DROP TABLE statements and no records. It is not a data backup. Do not import the local development database over production. Avoid running the entire schema.sql for this upgrade: it includes seed inserts and quotation-number backfills beyond the six required additions.

## Validation already performed

The supplied 36-table schema was recreated in disposable local databases. The migration was applied twice to populated client/discount fixtures. All original fixture field values, all 36 table counts, and checked numeric totals were preserved; the resulting columns and equivalent indexes match the release. Disposable databases were removed.

The available local engine is MariaDB 10.4.32, not your MySQL 8.0.46. For comparison only, the disposable schemas used a common collation and explicit timestamp nullability to match MySQL 8 defaults. The migration does not change production collations. Rehearse on your actual MySQL engine as below before applying it to the real database. The supplied file has no row data, so production data contents have not been inspected.

## Server procedure

Use a maintenance window. These instructions assume the same root MySQL access that worked in your pasted session. If your server uses password authentication, add `-p` and enter the password at the prompt; do not put it in a command.

1. Copy these two files to `/root/horizon-migration/` on the server:

   - 20260930_clients_discounts_audit.sql
   - 20260930_verify_counts.sql

2. Identify the application's actual process and directory before stopping anything:

```bash
pm2 list
pm2 describe YOUR_APP_NAME
```

If the app uses systemd instead, use its specific service name. Do not stop MySQL. Stop all app instances/background jobs that can write to horizonlb for the final backup and comparison. Do not run `pm2 stop all` on a shared server.

```bash
pm2 stop YOUR_APP_NAME
```

3. In the same Ubuntu Bash session, make a full backup and a rehearsal-only copy. Stop on any error:

```bash
set -euo pipefail
umask 077
MIGRATION_DIR=/root/horizon-migration
STAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/root/horizon-backups/$STAMP"
mkdir -p "$BACKUP_DIR"
test -s "$MIGRATION_DIR/20260930_clients_discounts_audit.sql"
test -s "$MIGRATION_DIR/20260930_verify_counts.sql"

mysqldump -u root --single-transaction --quick --hex-blob \
  --routines --events --triggers --no-tablespaces --set-gtid-purged=OFF \
  horizonlb > "$BACKUP_DIR/horizonlb-full.sql"
test -s "$BACKUP_DIR/horizonlb-full.sql"
sha256sum "$BACKUP_DIR/horizonlb-full.sql" > "$BACKUP_DIR/horizonlb-full.sha256"

# Tables/data only for rehearsal; exclude executable events/routines/triggers.
# No --databases flag: the dump must not switch back to horizonlb during import.
mysqldump -u root --single-transaction --quick --hex-blob \
  --skip-triggers --skip-routines --skip-events --skip-add-drop-table \
  --no-tablespaces --set-gtid-purged=OFF \
  horizonlb > "$BACKUP_DIR/horizonlb-rehearsal.sql"
test -s "$BACKUP_DIR/horizonlb-rehearsal.sql"

mysql -u root --batch horizonlb < "$MIGRATION_DIR/20260930_verify_counts.sql" \
  > "$BACKUP_DIR/production-before.tsv"
```

Also securely copy the full backup off the server. Back up the deployed application, its `.env` and `server/uploads` directory before replacing code. A database dump does not contain uploaded files. Preserve existing JWT, database, email and OneDrive configuration.

4. Restore into a NEW rehearsal database on the same MySQL server. CREATE DATABASE intentionally fails if the name already exists:

```bash
REHEARSAL_DB="horizonlb_rehearsal_$STAMP"
mysql -u root -e "CREATE DATABASE \`$REHEARSAL_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
mysql -u root "$REHEARSAL_DB" < "$BACKUP_DIR/horizonlb-rehearsal.sql"
mysql -u root --batch "$REHEARSAL_DB" < "$MIGRATION_DIR/20260930_verify_counts.sql" \
  > "$BACKUP_DIR/rehearsal-before.tsv"
diff -u "$BACKUP_DIR/production-before.tsv" "$BACKUP_DIR/rehearsal-before.tsv"

mysql -u root "$REHEARSAL_DB" < "$MIGRATION_DIR/20260930_clients_discounts_audit.sql" \
  > "$BACKUP_DIR/rehearsal-migration.log"
mysql -u root "$REHEARSAL_DB" < "$MIGRATION_DIR/20260930_clients_discounts_audit.sql" \
  > "$BACKUP_DIR/rehearsal-rerun.log"
mysql -u root --batch "$REHEARSAL_DB" < "$MIGRATION_DIR/20260930_verify_counts.sql" \
  > "$BACKUP_DIR/rehearsal-after.tsv"
diff -u "$BACKUP_DIR/rehearsal-before.tsv" "$BACKUP_DIR/rehearsal-after.tsv"
```

Both diffs should be empty. The migration log should list four columns and two indexes. Counts/totals are useful checks, not a byte-for-byte proof of every field. Retain the full backup. If any command fails, stop and inspect the error; do not use `mysql --force` to ignore it.

5. Only after the rehearsal succeeds, apply the same small migration to production while writers are still stopped:

```bash
mysql -u root horizonlb < "$MIGRATION_DIR/20260930_clients_discounts_audit.sql" \
  > "$BACKUP_DIR/production-migration.log"
mysql -u root --batch horizonlb < "$MIGRATION_DIR/20260930_verify_counts.sql" \
  > "$BACKUP_DIR/production-after.tsv"
diff -u "$BACKUP_DIR/production-before.tsv" "$BACKUP_DIR/production-after.tsv"
```

6. Deploy the new application into a separate release directory, keeping the previous release available. Install from its lockfiles and build the client (`npm ci` in server and client, then `npm run build` in client). Reuse the real production configuration with DB_NAME=horizonlb. Preserve or mount the existing upload directory; do not replace it with an empty local directory. Point your existing process manager at the new release before restarting the specific app.

**Owner-account behavior to review before restarting:** the current `server.js` updates the existing owner's name/email/password whenever OWNER_PASSWORD is set. Production startup also requires that variable. If owner credentials must remain exactly unchanged, change that startup behavior to seed an owner only when none exists before deploying; simply omitting OWNER_PASSWORD will fail the current production environment check. Do not replace the production `.env` with local settings.

7. Restart the specific app, inspect its logs and check login, client listing/editing, discounts, products, existing projects/panels/items, quotations and payments. Verify historical totals against a known project. A health endpoint alone does not prove database readiness. Keep the rehearsal database private and remove it only after the deployment is accepted.

## Recovery

MySQL ALTER TABLE commits implicitly, so a surrounding transaction cannot roll back this migration. If an individual addition fails, keep the app stopped, investigate, then rerun the migration after resolving the cause; completed additions are skipped.

If the new application has a problem, switch back to the previous application release while retaining the extra columns/indexes. This avoids overwriting records. Do not automatically restore the backup over a database that has accepted new writes: that would discard those later records. If data recovery is required, keep writers stopped and restore the backup into a separate recovery database first, verify it and reconcile any later writes before switching.

References: [MySQL 8 mysqldump](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html), [MySQL implicit commits](https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html).
