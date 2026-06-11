# Satisfactory Map Connector

Multi-user web connector for opening a Satisfactory dedicated-server save in
Satisfactory Calculator's interactive map.

Frontend URL target:

```text
https://redxjak.github.io/Satisfactory-map-connector
```

## What It Does

- Lets approved users sign in with Supabase Auth.
- Stores each user's SFTP connection settings.
- Encrypts SFTP passwords on the backend before storing them.
- Pulls the newest `.sav` from the configured save folder.
- Uploads `latest.sav` to a private Supabase Storage bucket.
- Creates a temporary signed save URL and wraps it in a SCIM map link.
- Supports manual pulls and a Render cron refresh every 30 minutes.

## Project Pieces

- `web/` is the static GitHub Pages frontend.
- `server/` is the Render Node/Express API.
- `supabase/migrations/001_initial_schema.sql` creates the invite list,
  connection tables, save snapshot table, RLS policies, and private `saves`
  bucket.
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
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
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
2. Run `supabase/migrations/001_initial_schema.sql` in SQL Editor.
3. Add invited users:

   ```sql
   insert into public.allowed_users (email)
   values ('your-email@example.com')
   on conflict (email) do nothing;
   ```

4. Enable email sign-in in Supabase Auth.
5. Copy the project URL, publishable key, and secret key into local/Render
   environment variables.

## Render Setup

Create a Render Blueprint from `render.yaml` or create the services manually.

Set these secrets on both the web service and cron job:

```env
SUPABASE_URL=
SUPABASE_SECRET_KEY=
CREDENTIAL_ENCRYPTION_KEY=
SAVE_BUCKET=saves
SIGNED_URL_TTL_SECONDS=1800
REFRESH_INTERVAL_MINUTES=30
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
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
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
- The backend stores encrypted SFTP credentials in `credentials_encrypted`.
- The encryption key must live only in Render environment variables.
- Supabase Storage bucket `saves` is private.
- Generated SCIM links use temporary signed save URLs.
- Anyone with a valid temporary SCIM URL can load that save until it expires.

If SCIM cannot load Supabase signed URLs because of CORS, add a backend save
proxy endpoint that serves the object with:

```text
Access-Control-Allow-Origin: https://satisfactory-calculator.com
Content-Type: application/octet-stream
```
