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
git pull --ff-only origin main   # resolve any local changes before continuing
```

## 3. Update the database — keeping your existing data, no drop

For the existing production database described in the supplied 14 October 2026 schema listing, follow [the additive upgrade instructions](elec-app/docs/UPGRADE-2026-10-14.md).

Apply only this release migration to the existing database:

~~~bash
mysql -u <db_user> -p <db_name> < elec-app/server/db/migrations/20261014_project_retention_versions.sql
~~~

It adds projects.current_version only if it is missing. It does not drop tables, delete rows, or replace your database. Use schema.sql for a fresh installation or a separately reviewed full schema upgrade; do not replace production data with a development dump.

## 4. Update `.env`

```bash
cd ~/horizon-app/elec-app/server
test -f .env || cp .env.example .env   # preserve existing production settings
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
