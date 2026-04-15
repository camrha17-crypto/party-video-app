# Party Video App

A Node.js video chat app built with Express, Socket.io, and LiveKit. Users can create or join parties, stay connected with their own crew, and get matched against other parties for live video chat.

## Running Locally

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm start
```

3. Open `http://localhost:3000`

Local development defaults:
- `PORT=3000`
- `LIVEKIT_URL=ws://localhost:7880`
- `LIVEKIT_API_KEY=devkey`
- `LIVEKIT_API_SECRET=secret`

## Deploying to Railway

This app is ready to run on Railway as a standard Node.js web service.

### What Changed For Deployment

- The server now reads `PORT` from `process.env.PORT`
- LiveKit config now reads from environment variables instead of hardcoded localhost values
- Local development still works because non-production fallbacks are preserved
- In production, missing required LiveKit environment variables will fail fast so Railway does not boot with invalid config

### Environment Variables

Set these in Railway for production:

- `LIVEKIT_URL`
  Use your LiveKit WebSocket URL, typically `wss://<your-livekit-host>`
- `LIVEKIT_API_KEY`
  Your LiveKit API key
- `LIVEKIT_API_SECRET`
  Your LiveKit API secret

Recommended:

- `NODE_ENV=production`

Usually not set manually on Railway:

- `PORT`
  Railway injects this automatically for the web service

### Railway Service Setup

1. Create a new Railway project.
2. Deploy this repo as a Node.js service.
3. In the Railway service variables panel, add:
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `NODE_ENV=production`
4. Set the start command to:

```bash
npm start
```

5. Deploy.

### Notes About Domains

- Do not hardcode your Railway domain in the app
- Do not hardcode your custom domain in the app
- Railway public domain and DNS setup can be handled manually after deploy
- Because the frontend is served by Express and Socket.io connects to the same origin, no domain-specific code changes are needed here

### Production LiveKit Notes

- `LIVEKIT_URL` must point to your production LiveKit instance, not localhost
- If your LiveKit server is public, use `wss://...` instead of `ws://...`
- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` must match the same LiveKit project/server as that URL

### Quick Production Checklist

- Railway service deployed successfully
- `LIVEKIT_URL` points to production LiveKit
- `LIVEKIT_API_KEY` is set
- `LIVEKIT_API_SECRET` is set
- `NODE_ENV=production` is set
- Railway generated domain works
- Custom domain can be connected separately in Railway and your DNS provider
