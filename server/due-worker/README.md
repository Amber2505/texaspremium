# Due-date reminder cloud worker

Runs on Railway as its own service (separate from the socket server). It acts like one
more office computer named **Cloud**, so reminders run even with every office computer off.

## Railway setup
1. New service → deploy from this folder (it has a Dockerfile).
2. **Add a Volume** mounted at `/data`. This keeps Chrome signed in to the carrier sites between deploys.
3. Variables:

| Name | Value |
|---|---|
| `OFFICE_CAPTURE_KEY` | same as Heroku / Vercel |
| `BITWARDEN_EMAIL` | the Bitwarden account email (same vault the office uses) |
| `BITWARDEN_PASSWORD` | Bitwarden master password (unlocks the vault) |
| `BW_CLIENTID` | recommended: Bitwarden personal API key `client_id` (starts with `user.`) |
| `BW_CLIENTSECRET` | recommended: Bitwarden personal API key `client_secret` |
| `MATRIX_LOGIN` / `MATRIX_PASSWORD` | AgencyMatrix login (used before Bitwarden for AgencyMatrix) |
| `EMAIL_INTERNAL` | the internal Gmail that gets carrier codes |
| `EMAIL_INTERNAL_PASS` | its Gmail **app password** |
| `OPENAI_API_KEY` | only used when a site's search box can't be found by the normal rules |

Optional: `WORKER_NAME` (default `Cloud`), `EMAIL_INTERNAL_IMAP` (default `imap.gmail.com`),
`ASTRAL_API_URL` (default the Heroku app).

Bitwarden API key: bitwarden.com web vault → Settings → Security → Keys → **View API key**.
Without the API key, Bitwarden emails a "new device" code to the Bitwarden email the first time the worker signs in, and the CLI can't type it. The API key skips that.

## What it does
- 10 AM–5 PM Mon–Sat, asks astral_api for work every minute.
- Signs in with the Bitwarden login whose website matches the site (exact address first, then same domain;
  an item named "admin" or "Texas Premium" wins a tie).
- Email codes: picks "email" when a site offers it and reads the code from `EMAIL_INTERNAL`.
- Authenticator-app codes (Progressive): texts the admin; enter it on the Due-date Reminders page within 10 min.
- A carrier it can't sign in to is skipped for the day on Cloud, and an office computer can still pick it up.
