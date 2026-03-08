# ⚡ LiveSpark

> Real-time interactive presentations and polls — a Mentimeter clone built on [RedwoodSDK](https://rwsdk.com) + Cloudflare Workers.

**Live demo:** https://livespark.shortcircuit.workers.dev

---

## Features

- 🚀 **Create presentations** with multiple slide types
- 📊 **Multiple Choice** — animated live bar chart
- ⭐ **Rating** — 1–5 stars with average score
- ☁️ **Word Cloud** — frequency-weighted word display
- 💬 **Open Text** — live scrolling response feed
- 🔴 **Real-time sync** — all clients update instantly via `useSyncedState`
- 📱 **Mobile-friendly** — audience joins by 6-character code
- 🔢 **Live audience count** on the host panel

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [RedwoodSDK](https://rwsdk.com) (React Server Components) |
| Runtime | [Cloudflare Workers](https://workers.cloudflare.com) |
| Real-time | Cloudflare Durable Objects + `useSyncedState` |
| Styling | Vanilla CSS (dark glassmorphism design system) |
| Language | TypeScript + React 19 |

## How It Works

Real-time state is powered by rwsdk's built-in `useSyncedState` hook — a drop-in replacement for `useState` that synchronises across all connected clients in the same session room via Cloudflare Durable Objects:

```ts
const [state, setState] = useSyncedState<SessionState>(initial, "sessionState", sessionId);
```

When the host navigates slides or an audience member votes, every connected browser updates instantly — no WebSocket boilerplate required.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 10+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free plan works)

### Local Development

```bash
git clone https://github.com/your-username/livespark
cd livespark
pnpm install
pnpm dev
```

Open `http://localhost:5173` in your browser.

### Deploy to Cloudflare

```bash
pnpm release
```

> On first deploy, `rw-scripts ensure-deploy-env` will guide you through Cloudflare account setup.

## Project Structure

```
src/
├── worker.tsx              # Worker entry: routes + syncedStateRoutes
├── client.tsx              # Client entry point
├── durableObjects/
│   └── SessionDO.ts        # TypeScript types for session state
├── app/
│   ├── document.tsx        # HTML shell
│   ├── db/
│   │   └── store.ts        # In-memory session store
│   └── pages/
│       ├── home.tsx        # Landing page + slide builder
│       ├── host.tsx        # Host control panel (live charts)
│       ├── audience.tsx    # Audience voting UI
│       └── results.tsx     # Final results view
public/
└── global.css              # Design system (edit this for styles)
```

## User Flow

1. **Host** opens the app → clicks **Create Presentation**
2. Adds slides (Multiple Choice, Rating, Word Cloud, Open Text) → **Start Session**
3. A unique **6-character join code** and link are displayed
4. **Audience** enters the code or opens the join link on their phone
5. Votes are cast → bar charts update live on the host screen
6. Host navigates **Prev / Next** → audience view advances in real time
7. **End Session** → shareable results page at `/results/:sessionId`

## Limitations (free plan / dev mode)

- Sessions are stored **in-memory** in the Worker — they reset on Worker restart. Swap `src/app/db/store.ts` for [Cloudflare D1](https://developers.cloudflare.com/d1/) for persistence.
- Audience count decrements on graceful navigation away; abrupt tab closes may lag until the DO connection times out.

## License

MIT
