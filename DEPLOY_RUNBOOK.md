# Deployment runbook — Horizon LB

Run these on the production VPS over SSH. Fill in the placeholders
(`<...>`) before running anything. This assumes:
- The repo is already cloned at `~/horizon-app` (adjust path as needed)
- MySQL is running locally on the VPS
- You're using `pm2` to keep the Node process alive (swap for `systemctl`
  commands if you use systemd instead)

## 0. Back up first

Cheap insurance regardless of what follows — one command.

```bash
mysqldump -u <db_user> -p <db_name> > ~/backup_$(date +%Y%m%d_%H%M%S).sql
```

Copy that file off the server too (`scp` it to your own machine) before continuing.

## 1. Stop the running app

```bash
pm2 stop horizon-app        # or: sudo systemctl stop horizon-app
```

## 2. Pull latest code — both frontend and backend live in the same repo

```bash
cd ~/horizon-app
git fetch origin
git reset --hard origin/main   # discards any local server-side edits — make sure nothing important is uncommitted first
```

## 3. Update the database — keeping your existing data, no drop

`schema.sql` uses `CREATE TABLE IF NOT EXISTS` and idempotent column checks
throughout, so it's safe to run directly against your **existing**
database — it only adds whatever's missing (new tables like
`project_technicians`/`oauth_tokens`, new columns like the technician role
and the OneDrive attachment fields) and leaves every existing row in every
existing table untouched.

```bash
mysql -u <db_user> -p <db_name> < elec-app/server/db/schema.sql
```

(Only if you ever genuinely want to start from an empty database instead —
not the case here — you'd `DROP DATABASE` first. Skip that entirely for a
normal update.)

## 4. Update `.env`

```bash
cd ~/horizon-app/elec-app/server
cp .env.example .env   # or edit your existing .env — add any new variables listed in .env.example that you don't have yet
nano .env
```

## 5. Install dependencies (in case package.json changed) and build the frontend

```bash
cd ~/horizon-app/elec-app/server
npm install

cd ~/horizon-app/elec-app/client
npm install
npm run build
```

The server serves the built client directly from `client/dist` — no
separate frontend deploy step needed.

## 6. Restart the app

```bash
cd ~/horizon-app/elec-app/server
pm2 restart horizon-app      # or: sudo systemctl start horizon-app
pm2 logs horizon-app --lines 50   # confirm it boots clean — look for "[DB] ✅ MySQL connected"
```

## 7. Smoke test

- Load the site in a browser, confirm the login page renders
- Log in with the admin account (`admin@company.com` / whatever `OWNER_PASSWORD` you set)
- Open a project's CRM page, confirm panels/items load
- Check `pm2 logs` for any errors during these actions
