# Running your own G&lt;Logger

G&lt;Logger is a single `index.html`, hosted on Cloudflare as a normal website you can add to your home screen.
It signs you in with Google and calls the Calendar API directly. A tiny Cloudflare Worker (`worker/worker.js`)
handles the sign-in, so you stay logged in.

You do these steps once. After that, every push to `main` publishes automatically.

## 1. Google Cloud: let the app ask for Calendar access

1. Go to <https://console.cloud.google.com/> and create a project (e.g. **G-Logger**).
2. **APIs & Services → Library**: enable **Google Calendar API** and **Google Drive API**.
3. **APIs & Services → OAuth consent screen** (also called *Google Auth Platform*):
   - User type **External**. App name **G&lt;Logger**, your email as support and developer contact.
   - **Data access / Scopes**: add `.../auth/calendar`, `.../auth/drive.appdata`, `openid`, `email`.
   - **Audience**: click **Publish app** so it's *In production*. (In *Testing*, Google signs you out every 7 days.)
     It stays "unverified", so you'll see a warning when signing in: **Advanced → Go to G&lt;Logger**. Fine for you and friends.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type **Web application**.
   - **Authorized redirect URIs**: `https://g-logger.<your-subdomain>.workers.dev/auth/callback`
     (you'll know the exact address after step 2; you can come back and add it).
   - Copy the **Client ID** and **Client secret**.

## 2. Cloudflare: host it

1. Sign up at <https://dash.cloudflare.com/> (free plan).
2. **Workers & Pages**: note your **Account ID** (right-hand side) and your `*.workers.dev` subdomain.
3. **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"** template → create, copy the token.

## 3. GitHub: add the secrets

Repo **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the token from Cloudflare |
| `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account ID |
| `GOOGLE_CLIENT_ID` | the OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | the OAuth client secret |
| `COOKIE_SECRET` | any long random string, e.g. from `openssl rand -base64 32` |

Then **Actions → Cloudflare → Run workflow**. The app goes live at `https://g-logger.<your-subdomain>.workers.dev`.

## 4. First run

Open the address, tap **Continue with Google**, allow access. On iPhone: Safari → Share → **Add to Home Screen**.

Set up your categories in Settings. If you already log to a calendar named **Log**, the app picks it up as is.
