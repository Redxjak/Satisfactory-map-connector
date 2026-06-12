# Satisfactory Map Connector

Multi-user web connector for opening a Satisfactory dedicated-server save in
Satisfactory Calculator's interactive map.

Frontend URL target:

```text
https://redxjak.github.io/Satisfactory-map-connector
```

## What It Does

- Lets server owners create accounts and manage SFTP connections.
- Lets owners generate player access codes for map-only access.
- Stores each user's SFTP connection settings.
- Encrypts SFTP passwords on the backend before storing them.
- Pulls the newest `.sav` from the configured save folder.
- Uploads `latest.sav` to a private Supabase Storage bucket.
- Creates a temporary signed save URL and wraps it in a SCIM map link.
- Supports manual pulls and a Render cron refresh every 30 minutes.

## Project Pieces

- `web/` is the static GitHub Pages frontend.
- `server/` is the Render Node/Express API.
- `supabase/migrations/` creates owner accounts, connection tables, save
  snapshot tables, access-code session tables, RLS policies, and private
  `saves` bucket.
- `render.yaml` defines the Render web service and cron job.
- `.github/workflows/deploy-pages.yml` builds and deploys the frontend to
  GitHub Pages.

## Local Setup

Install dependencies:

```powershell
npm install
```

Create a local env file:

```powershell
Copy-Item .env.example .env
```

Generate an encryption key:

```powershell
npm run lint
```

Copy the generated value into:

```env
CREDENTIAL_ENCRYPTION_KEY=...
```

Fill in:

```env
VITE_API_BASE_URL=http://localhost:8787
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

Run the API:

```powershell
npm run dev:api
```

Run the frontend:

```powershell
npm run dev:web
```

## Supabase Setup

1. Create a Supabase project.
2. Run the SQL files in `supabase/migrations/` in order.
3. Owners can create accounts from the website. For a manually seeded owner
   code, first hash the code locally:

   ```powershell
   node scripts/hash-access-code.js "a-long-private-code"
   ```

4. Insert that hash into Supabase:

   ```sql
   insert into public.access_codes (label, code_hash)
   values ('Derrick', 'paste-the-hash-here');
   ```

5. Copy the project URL and secret key into local/Render environment variables.

## Render Setup

Create a Render Blueprint from `render.yaml` or create the service manually. The
Blueprint uses Render's free web service tier. Add a paid Render cron job later
if you want true every-30-minute background refreshes while nobody is visiting
the site.

Set these secrets on the web service:

```env
SUPABASE_URL=
SUPABASE_SECRET_KEY=
CREDENTIAL_ENCRYPTION_KEY=
SAVE_BUCKET=saves
SIGNED_URL_TTL_SECONDS=1800
REFRESH_INTERVAL_MINUTES=30
SESSION_TTL_HOURS=720
```

Set this on the web service:

```env
FRONTEND_ORIGIN=https://redxjak.github.io
```

After Render deploys, set the frontend's API URL to the Render service URL.

## GitHub Pages Setup

Create a GitHub repo named:

```text
Satisfactory-map-connector
```

Add repository secrets:

```env
VITE_API_BASE_URL=https://your-render-service.onrender.com
```

Enable GitHub Pages from GitHub Actions.

Pushing to `main` deploys:

```text
https://redxjak.github.io/Satisfactory-map-connector
```

## SFTP Defaults

For Satisfactory dedicated servers on Linux hosts, the common save folder is:

```text
/.config/Epic/FactoryGame/Saved/SaveGames/server
```

The connector chooses the newest `.sav` by modified time.

## Security Notes

- SFTP credentials are never sent to the frontend after creation.
- Player accounts do not edit SFTP settings and do not receive SFTP passwords.
- The backend stores encrypted SFTP credentials in `credentials_encrypted`.
- The encryption key must live only in Render environment variables.
- Access codes are stored only as SHA-256 hashes in Supabase.
- Use one access code per person so you can disable a single code if it is
  shared.
- Supabase Storage bucket `saves` is private.
- Generated SCIM links use temporary signed save URLs.
- Anyone with a valid temporary SCIM URL can load that save until it expires.

If SCIM cannot load Supabase signed URLs because of CORS, add a backend save
proxy endpoint that serves the object with:

```text
Access-Control-Allow-Origin: https://satisfactory-calculator.com
Content-Type: application/octet-stream
```
