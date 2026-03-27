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

// Live segments — mutated by admin at runtime
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

let isSpinning = false;

// ── Routes ───────────────────────────────────────────────────────────
app.get("/7b0a4404-4809-4a6b-bf54-6e655640632f09-4a6b-bf56b-bf54-6e655640632f09-6e6556404", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.use(express.static(__dirname));

// Spare color helper for new segments
app.get("/next-color", (req, res) => {
  const used = segments.map(s => s.color);
  const spare = COLORS.find(c => !used.includes(c)) || COLORS[segments.length % COLORS.length];
  res.json({ color: spare });
});

// ── Socket.IO ─────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.emit("init", { segments });

  // Admin: update segments list
  socket.on("updateSegments", (data) => {
    if (data?.adminToken !== "wheel-admin-secret") return;
    if (!Array.isArray(data.segments) || data.segments.length < 2) return;

    segments = data.segments.map((s, i) => ({
      label: String(s.label || "Segment " + (i + 1)).trim().slice(0, 30),
      color: String(s.color || COLORS[i % COLORS.length]),
    }));

    io.emit("segmentsUpdated", { segments });
    console.log(`Segments updated → ${segments.length} segments`);
  });

  // Admin: spin
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

    const winningIndex = Math.floor(Math.random() * segments.length);
    const segmentAngle = 360 / segments.length;

    // ── Pointer fix ──────────────────────────────────────────────────
    // Canvas draws segment[i] occupying angles:
    //   from: rotationRad + i * segAngle
    //   to:   rotationRad + (i+1) * segAngle
    // (all in radians, clockwise from the right / 3 o'clock position)
    //
    // The pointer is at the TOP of the canvas = -π/2 rad from centre
    // = 270° in clockwise-from-right degrees.
    //
    // After animation, finalRotationDeg = currentRotation + targetAngle.
    // We want the CENTER of segment[winningIndex] to sit at 270°:
    //   finalRotation + winningIndex * segAngle + segAngle/2  ≡  270  (mod 360)
    //
    // Because every client resets currentRotation to 0 after each spin
    // (we accumulate targetAngle into currentRotation), we can treat
    // currentRotation = 0 here and send targetAngle as an absolute delta:
    //
    //   targetAngle = (270 - winningIndex*segAngle - segAngle/2) mod 360
    //               + 360*N   (add full spins so wheel visibly spins)
    //
    const segCenter = winningIndex * segmentAngle + segmentAngle / 2;
    const extra = ((270 - segCenter) % 360 + 360) % 360;
    const targetAngle = 360 * 5 + extra;

    console.log(
      `Winner: [${winningIndex}] "${segments[winningIndex].label}" | ` +
      `segCenter=${segCenter.toFixed(1)}° extra=${extra.toFixed(1)}°`
    );

    io.emit("spinResult", {
      winningIndex,
      targetAngle,
      duration: 5000,
      label: segments[winningIndex].label,
    });

    setTimeout(() => {
      isSpinning = false;
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
