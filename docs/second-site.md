# Running a second site for another fountain

Each site tracks one fountain. To track a fountain in another place, run this
same repo a second time: a second Render web service with its own database. The
original site keeps running exactly as before, and every push to `main`
redeploys both.

|                      | Site 1 (original)                                  | Site 2 (new)                                                         |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| Render service       | `petlibro-dashboard`                               | a new web service, e.g. `petlibro-dashboard-office`                  |
| Database             | its TiDB database                                  | a new database (the same TiDB cluster is fine)                       |
| GitHub secrets       | `RENDER_APP_URL`, `CRON_SECRET`, `HEALTHCHECK_URL` | `SITE2_RENDER_APP_URL`, `SITE2_CRON_SECRET`, `SITE2_HEALTHCHECK_URL` |
| Name in Actions runs | `site1`                                            | `site2`                                                              |

The steps below use "office" as the example location. Use your own.

## Before you start

**The fountain is on Wi-Fi in the PETLIBRO app** and shows its water data there.
The Dockstream 2 (model PLWF106) needs the full PETLIBRO app; its manual says
PETLIBRO Lite doesn't support it. In the Home Assistant integration's code, it
reads the same Petlibro endpoints and fields as the original Dockstream (water
level, filter and cleaning days, today's and yesterday's intake), so the
dashboard needs no model-specific changes. The history endpoint behind backfill
and the Time-of-Day chart hasn't been tried on a Dockstream 2 yet; the dry-run
backfill in step 5 shows whether it returns data.

**Decide which Petlibro account the new site signs in with.** Petlibro appears
to allow one active login per account, so a new login signs the previous one
out. The Home Assistant integration's docs advise a separate account for this
reason.

- **Recommended:** create a second Petlibro account, share the new fountain
  with it from the PETLIBRO app, and use that account on the new site. The two
  sites then never sign each other out.
- **Also works:** use the same account as site 1. Each site signs back in when
  its session is rejected, and the scheduled sync runs the sites one after the
  other rather than at the same time.

## 1. Create the database

In [TiDB Cloud](https://tidbcloud.com/), open the cluster site 1 uses, then open
the **SQL Editor** and run:

```sql
CREATE DATABASE petlibro_office;
USE petlibro_office;
```

Then, in the same editor, run every `CREATE TABLE` statement from the README's
[Database Setup](../README.md#1-database-setup-tidb-serverless) step 4.

The connection string is site 1's `DATABASE_URL` with the database name
changed. Copy it from the original service's **Environment** page on Render and
swap the name after the port:

```
mysql://USER:PASSWORD@HOST:4000/petlibro_office?ssl={"rejectUnauthorized":true}
```

## 2. Create the Render web service

In the [Render Dashboard](https://dashboard.render.com/), choose **New → Web
Service** and pick this repo. Don't use **New → Blueprint**: `render.yaml`
describes site 1.

| Setting                      | Value                                              |
| ---------------------------- | -------------------------------------------------- |
| Name                         | `petlibro-dashboard-office` (this becomes the URL) |
| Branch                       | `main`                                             |
| Language                     | Node                                               |
| Build command                | `pnpm install && pnpm build`                       |
| Start command                | `pnpm start`                                       |
| Instance type                | Free                                               |
| Health check path (Advanced) | `/api/health`                                      |

Environment variables:

| Key                  | Value                                             |
| -------------------- | ------------------------------------------------- |
| `NODE_ENV`           | `production`                                      |
| `DATABASE_URL`       | the connection string from step 1                 |
| `JWT_SECRET`         | click **Generate**                                |
| `CRON_SECRET`        | click **Generate**, and copy the value for step 4 |
| `VITE_LOCATION_NAME` | `Office`, or whatever you call the place          |

`VITE_LOCATION_NAME` labels the site in the browser tab, the sidebar, the phone
header and the sign-in card, so the two sites are easy to tell apart. It's
optional. It's read when the site builds, so when you change it later, save
with **Save, rebuild, and deploy**. To label site 1 as well, add
`VITE_LOCATION_NAME` (e.g. `Home`) to the original service the same way.

Free web services sleep after 15 minutes without traffic, and all of them in a
workspace share Render's 750 free instance hours a month. The scheduled sync
wakes each site six times a day for about 15 minutes each time, roughly 50
hours a month per site, so two sites fit with plenty to spare.

## 3. Set up the site

1. Open the new site's URL and choose **Register**. This account is separate
   from your site 1 login.
2. In **Settings**, enter the Petlibro email, password and region, then click
   **Test Connection** and **Save**.
3. Select the Dockstream 2 from the device list.
4. Under **Timezone**, pick the timezone where this fountain is, and save. Days
   and hours are counted in that timezone, so this matters if the location
   isn't on Eastern time.
5. Go back to **Dashboard** and click **Refresh**.

## 4. Add the GitHub secrets

In this repo on GitHub, go to **Settings → Secrets and variables → Actions →
New repository secret** and add:

| Secret                  | Value                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `SITE2_RENDER_APP_URL`  | the new site's URL, e.g. `https://petlibro-dashboard-office.onrender.com`, with no trailing slash |
| `SITE2_CRON_SECRET`     | the new service's `CRON_SECRET` from step 2                                                       |
| `SITE2_HEALTHCHECK_URL` | optional: a separate [Healthchecks.io](https://healthchecks.io/) ping URL for this site           |

Then open **Actions → Petlibro Sync → Run workflow**. Both `sync (site1)` and
`sync (site2)` should finish green. Until these secrets exist, `sync (site2)`
skips itself and leaves a notice rather than failing.

## 5. Recover the new fountain's history

Petlibro keeps about 170 days of history (see
[petlibro-history-api.md](petlibro-history-api.md)), so pull it in soon. Open
**Actions → Petlibro Backfill → Run workflow**, set **site** to `site2`,
**months** to `6`, and leave **dry run** checked. Check the run's summary, then
run it again with **dry run** unchecked to write the days.

After that, the weekly backfill covers both sites on its own.

## Troubleshooting

| What you see                                                | Why, and what to do                                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sync (site2)` says "Skipping site2"                        | `SITE2_RENDER_APP_URL` or `SITE2_CRON_SECRET` is missing. Add both (step 4).                                                                     |
| `sync (site2)` fails with status 401                        | `SITE2_CRON_SECRET` doesn't match the new service's `CRON_SECRET`.                                                                               |
| Test Connection fails                                       | Check the email, password and region.                                                                                                            |
| The Dockstream 2 isn't in the device list                   | The account you entered doesn't have the fountain. If you shared it from another account, check in the PETLIBRO app that the share went through. |
| Totals reset at the wrong hour, or show under the wrong day | The **Timezone** setting doesn't match where the fountain is.                                                                                    |
| The label doesn't appear                                    | `VITE_LOCATION_NAME` was saved without a rebuild. On Render, run **Manual Deploy → Deploy latest commit**.                                       |
