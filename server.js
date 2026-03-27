const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

const SEGMENTS = [
  { label: "🎉 JACKPOT", color: "#FF6B6B" },
  { label: "💎 500 pts", color: "#4ECDC4" },
  { label: "🌟 250 pts", color: "#FFE66D" },
  { label: "🔥 BONUS", color: "#FF8C42" },
  { label: "💫 100 pts", color: "#A8E6CF" },
  { label: "🎁 GIFT", color: "#C3A6FF" },
  { label: "⚡ DOUBLE", color: "#FF6FA8" },
  { label: "🍀 LUCKY", color: "#69D2E7" },
];

// Track spinning state to prevent rapid spam
let isSpinning = false;

// Serve admin page
app.get("/7b0a4404-4809-4a6b-bf54-6e655640632f09-4a6b-bf56b-bf54-6e655640632f09-6e6556404", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// Serve viewer page at root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Serve static files
app.use(express.static(__dirname));

// Provide segment data to clients
app.get("/segments", (req, res) => {
  res.json(SEGMENTS);
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send current segment count so client can draw wheel
  socket.emit("init", { segments: SEGMENTS });

  // Only handle spin requests — server decides result
  socket.on("requestSpin", (data) => {
    // Basic anti-cheat: validate admin token sent from admin page
    if (data?.adminToken !== "wheel-admin-secret") {
      console.log(`Unauthorized spin attempt from ${socket.id}`);
      return;
    }

    if (isSpinning) {
      socket.emit("spinBlocked", { message: "Wheel is already spinning!" });
      return;
    }

    isSpinning = true;

    // SERVER determines the result — not the client
    const winningIndex = Math.floor(Math.random() * SEGMENTS.length);
    const totalRotations = 5; // full rotations before landing
    const segmentAngle = 360 / SEGMENTS.length;

    // Calculate final rotation: land pointer (top) on winning segment center
    // Pointer is at top (270deg). Each segment starts from 0.
    // To land segment i at top: rotate so that segment i center aligns with 270deg
    const segmentCenter = winningIndex * segmentAngle + segmentAngle / 2;
    const targetAngle = 360 * totalRotations + (270 - segmentCenter + 360) % 360;

    console.log(`Spin result: segment ${winningIndex} — ${SEGMENTS[winningIndex].label}`);

    // Broadcast spin event to ALL clients (including sender)
    io.emit("spinResult", {
      winningIndex,
      targetAngle,
      duration: 5000, // 5 seconds animation
      label: SEGMENTS[winningIndex].label,
    });

    // Reset spinning lock after animation completes
    setTimeout(() => {
      isSpinning = false;
      io.emit("spinComplete", { label: SEGMENTS[winningIndex].label });
    }, 5500);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`\n🎡 Wheel of Fortune running!`);
  console.log(`   Viewer:  http://localhost:${PORT}/`);
  console.log(`   Admin:   http://localhost:${PORT}/admin\n`);
});
