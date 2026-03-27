# 🎡 Wheel of Fortune — Real-Time Multiplayer

A minimal real-time Wheel of Fortune built with Node.js, Express, and Socket.IO.

## Quick Start

```bash
npm install
node server.js
```

Then open:
- **Viewers:** http://localhost:3000/
- **Admin:**   http://localhost:3000/admin

## How It Works

- Admin visits `/admin` and sees the **Spin** button
- Viewers visit `/` — no spin button, watch-only
- When admin clicks Spin:
  1. The **server** randomly picks the winning segment
  2. The result + rotation angle is broadcast to **all** connected clients
  3. Every client animates identically to the same result
- Spinning is locked server-side until animation completes (~5.5s)

## Anti-Cheat

- Viewers can't trigger spins — `socket.emit("requestSpin")` is blocked client-side on `/`
- Even if bypassed, the server validates an `adminToken` before accepting any spin request
- The server (not the client) determines the result

## Project Structure

```
wheel-of-fortune/
├── server.js          # Express + Socket.IO server
├── package.json
└── public/
    ├── index.html     # Viewer page
    ├── admin.html     # Admin page (spin button)
    ├── style.css      # Shared styles
    └── script.js      # Shared wheel logic
```

## Customizing Segments

Edit the `SEGMENTS` array in `server.js`:

```js
const SEGMENTS = [
  { label: "🎉 JACKPOT", color: "#FF6B6B" },
  { label: "💎 500 pts", color: "#4ECDC4" },
  // add more...
];
```
