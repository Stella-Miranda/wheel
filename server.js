const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

const PORT = 3000;

const COLORS = [
  "#FF6B6B","#4ECDC4","#FFE66D","#FF8C42",
  "#A8E6CF","#C3A6FF","#FF6FA8","#69D2E7",
  "#F7B731","#26de81","#fd9644","#45aaf2",
];

let segments = [
  { label: "🎉 JACKPOT", color: "#FF6B6B" },
  { label: "💎 500 pts", color: "#4ECDC4" },
  { label: "🌟 250 pts", color: "#FFE66D" },
  { label: "🔥 BONUS",   color: "#FF8C42" },
  { label: "💫 100 pts", color: "#A8E6CF" },
  { label: "🎁 GIFT",    color: "#C3A6FF" },
  { label: "⚡ DOUBLE",  color: "#FF6FA8" },
  { label: "🍀 LUCKY",   color: "#69D2E7" },
];

let isSpinning   = false;
// The single source of truth for where the wheel face sits (degrees).
// Every client is snapped to this value after each spin completes,
// so all devices are always perfectly in sync.
let sharedRotation = 0;

// ── Routes ───────────────────────────────────────────────────────────
app.get("/7b0a4404-4809-4a6b-bf54-6e655640632f09-4a6b-bf56b-bf54-6e655640632f09-6e6556404", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.use(express.static(__dirname));

app.get("/next-color", (req, res) => {
  const used  = segments.map(s => s.color);
  const spare = COLORS.find(c => !used.includes(c)) || COLORS[segments.length % COLORS.length];
  res.json({ color: spare });
});

// ── Socket.IO ─────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send current state — new clients start at the same rotation as everyone else
  socket.emit("init", { segments, sharedRotation });

  // ── Admin: update segments ──
  socket.on("updateSegments", (data) => {
    if (data?.adminToken !== "wheel-admin-secret") return;
    if (!Array.isArray(data.segments) || data.segments.length < 2) return;

    segments = data.segments.map((s, i) => ({
      label: String(s.label || "Segment " + (i + 1)).trim().slice(0, 30),
      color: String(s.color || COLORS[i % COLORS.length]),
    }));

    // Reset rotation when segments change so pointer math is clean
    sharedRotation = 0;
    io.emit("segmentsUpdated", { segments, sharedRotation });
    console.log(`Segments updated → ${segments.length} segments`);
  });

  // ── Admin: spin ──
  socket.on("requestSpin", (data) => {
    if (data?.adminToken !== "wheel-admin-secret") {
      console.log(`Unauthorized spin attempt from ${socket.id}`);
      return;
    }
    if (isSpinning) {
      socket.emit("spinBlocked", { message: "Wheel is already spinning!" });
      return;
    }
    if (segments.length < 2) {
      socket.emit("spinBlocked", { message: "Need at least 2 segments!" });
      return;
    }

    isSpinning = true;

    const winningIndex  = Math.floor(Math.random() * segments.length);
    const segmentAngle  = 360 / segments.length;

    // ── Cross-device sync fix ────────────────────────────────────────
    // The wheel is drawn starting from `sharedRotation` (degrees).
    // Segment[i] occupies the arc from:
    //   sharedRotation + i * segmentAngle
    //   to
    //   sharedRotation + (i+1) * segmentAngle
    // (clockwise, canvas coords — 0° = 3 o'clock)
    //
    // The pointer is at the TOP = 270° (canvas clockwise from 3 o'clock).
    //
    // We want segment[winningIndex]'s CENTER to land at 270° after the spin.
    // Center of segment[i] in the final wheel = finalRotation + i*segAngle + segAngle/2
    // We solve:
    //   finalRotation + segCenter ≡ 270  (mod 360)
    //   finalRotation = (270 - segCenter + 360*k) for large enough k
    //
    // We need finalRotation > sharedRotation (wheel spins forward) by at least 5 full turns.
    // So:
    //   extra      = ((270 - segCenter) % 360 + 360) % 360   ← 0..359
    //   finalRotation = sharedRotation + 360*5 + extra
    //
    // After animation, every client snaps currentRotation = nextSharedRotation,
    // where nextSharedRotation = finalRotation % 360 (kept small for next spin).

    const segCenter       = winningIndex * segmentAngle + segmentAngle / 2;
    const extra           = ((270 - segCenter) % 360 + 360) % 360;
    const finalRotation   = sharedRotation + 360 * 5 + extra;
    const nextShared      = finalRotation % 360;

    console.log(
      `Winner: [${winningIndex}] "${segments[winningIndex].label}" | ` +
      `segCenter=${segCenter.toFixed(1)}° extra=${extra.toFixed(1)}° ` +
      `final=${finalRotation.toFixed(1)}° nextShared=${nextShared.toFixed(1)}°`
    );

    // Broadcast to ALL clients — same numbers, same animation, same result
    io.emit("spinResult", {
      finalRotation,   // absolute target every client animates TO
      sharedRotation: nextShared, // value every client stores AFTER animation
      duration: 5000,
      label: segments[winningIndex].label,
    });

    setTimeout(() => {
      isSpinning   = false;
      sharedRotation = nextShared; // server now tracks the new resting position
      io.emit("spinComplete", { label: segments[winningIndex].label });
    }, 5500);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`\n🎡 Wheel of Fortune`);
  console.log(`   Viewer: http://localhost:${PORT}/`);
  console.log(`   Admin:  http://localhost:${PORT}/admin\n`);
});
