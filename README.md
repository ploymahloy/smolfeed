# Smolfeed

A local, light-mode reader that weaves connected social accounts and RSS categories into one unordered feed.

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Bluesky’s local sign-in requires that host, not `localhost`.

Add provider keys to `.env` when you want live accounts. Redirect URI for each app:

`http://127.0.0.1:3000/api/auth/{provider}/callback`

RSS categories work without keys. Screen time and analytics stay inside this app.
