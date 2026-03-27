// script.js — shared wheel logic for both viewer and admin
// IS_ADMIN is set inline in each HTML file before this script loads

(function () {
  /* ── Socket connection ── */
  const socket = io();

  /* ── State ── */
  let segments = [];
  let currentRotation = 0; // tracks cumulative rotation for continuity
  let spinning = false;

  /* ── DOM refs ── */
  const canvas = document.getElementById("wheel");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const resultBanner = document.getElementById("result-banner");
  const resultValue = document.getElementById("result-value");
  const confettiCanvas = document.getElementById("confetti");
  const confettiCtx = confettiCanvas.getContext("2d");
  const spinBtn = document.getElementById("spinBtn"); // null for viewers

  /* ── Canvas sizing ── */
  const SIZE = Math.min(window.innerWidth * 0.82, 420);
  canvas.width = SIZE;
  canvas.height = SIZE;
  const R = SIZE / 2;

  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;

  /* ─────────────────────────────────────────────
     WHEEL DRAWING
  ───────────────────────────────────────────── */
  function drawWheel(rotationRad) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (!segments.length) return;

    const segAngle = (2 * Math.PI) / segments.length;

    segments.forEach((seg, i) => {
      const startAngle = rotationRad + i * segAngle;
      const endAngle = startAngle + segAngle;

      // Segment fill
      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.arc(R, R, R - 2, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();

      // Segment stroke
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(startAngle + segAngle / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 4;

      const fontSize = Math.max(11, Math.min(15, R / (segments.length * 0.7)));
      ctx.font = `600 ${fontSize}px 'DM Sans', sans-serif`;
      ctx.fillText(seg.label, R - 16, fontSize / 3);
      ctx.restore();
    });

    // Outer ring
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(247,201,72,0.25)";
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  /* ─────────────────────────────────────────────
     SPIN ANIMATION
     targetAngle: total degrees to rotate (absolute)
     duration: ms
  ───────────────────────────────────────────── */
  function animateSpin(targetAngleDeg, duration) {
    spinning = true;
    if (spinBtn) spinBtn.disabled = true;

    setStatus("spinning", "🎡 Spinning...");

    const startRotation = currentRotation;
    const endRotation = startRotation + targetAngleDeg;
    const startTime = performance.now();

    // Ease-out cubic
    function easeOut(t) {
      return 1 - Math.pow(1 - t, 4);
    }

    function frame(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOut(progress);

      const rotation = startRotation + (endRotation - startRotation) * eased;
      currentRotation = rotation;

      drawWheel((rotation * Math.PI) / 180);

      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    }

    requestAnimationFrame(frame);
  }

  /* ─────────────────────────────────────────────
     STATUS HELPER
  ───────────────────────────────────────────── */
  function setStatus(cls, msg) {
    statusEl.className = cls;
    statusEl.textContent = msg;
  }

  /* ─────────────────────────────────────────────
     RESULT BANNER
  ───────────────────────────────────────────── */
  function showResult(label) {
    resultValue.textContent = label;
    resultBanner.classList.add("show");
    launchConfetti();

    setTimeout(() => {
      resultBanner.classList.remove("show");
    }, 4000);
  }

  /* ─────────────────────────────────────────────
     MINI CONFETTI
  ───────────────────────────────────────────── */
  let confettiParticles = [];

  function launchConfetti() {
    confettiParticles = [];
    for (let i = 0; i < 100; i++) {
      confettiParticles.push({
        x: Math.random() * confettiCanvas.width,
        y: -10,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 4 + 2,
        color: ["#f7c948", "#ff6b6b", "#4ecdc4", "#c3a6ff", "#ff6fa8"][Math.floor(Math.random() * 5)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 8,
        life: 1,
      });
    }
    requestAnimationFrame(tickConfetti);
  }

  function tickConfetti() {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiParticles = confettiParticles.filter((p) => p.life > 0.01);

    confettiParticles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.rotation += p.rotSpeed;
      p.life -= 0.012;

      confettiCtx.save();
      confettiCtx.globalAlpha = p.life;
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate((p.rotation * Math.PI) / 180);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      confettiCtx.restore();
    });

    if (confettiParticles.length > 0) {
      requestAnimationFrame(tickConfetti);
    }
  }

  /* ─────────────────────────────────────────────
     SOCKET EVENTS
  ───────────────────────────────────────────── */
  socket.on("init", (data) => {
    segments = data.segments;
    drawWheel((currentRotation * Math.PI) / 180);
    setStatus("live", "● Connected — waiting for spin");
  });

  socket.on("spinResult", (data) => {
    // All clients receive same targetAngle and duration
    animateSpin(data.targetAngle, data.duration);
  });

  socket.on("spinComplete", (data) => {
    spinning = false;
    if (spinBtn) spinBtn.disabled = false;
    setStatus("live", "● Ready");
    showResult(data.label);
  });

  socket.on("spinBlocked", (data) => {
    setStatus("", data.message);
    setTimeout(() => setStatus("live", "● Ready"), 2000);
  });

  socket.on("disconnect", () => {
    setStatus("", "⚠ Disconnected — reconnecting...");
    if (spinBtn) spinBtn.disabled = true;
  });

  socket.on("connect", () => {
    setStatus("live", "● Connected");
    if (spinBtn && !spinning) spinBtn.disabled = false;
  });

  /* ─────────────────────────────────────────────
     ADMIN SPIN BUTTON
     Token is checked server-side; emitting from
     console won't work without the correct token.
  ───────────────────────────────────────────── */
  if (spinBtn) {
    spinBtn.addEventListener("click", () => {
      if (spinning) return;
      // Send admin token — server validates before accepting
      socket.emit("requestSpin", { adminToken: "wheel-admin-secret" });
    });
  }

  /* Prevent open console spin attempts on viewer page */
  if (!window.IS_ADMIN) {
    // Overwrite socket.emit so viewers can't send requestSpin
    const _emit = socket.emit.bind(socket);
    socket.emit = function (event, ...args) {
      if (event === "requestSpin") {
        console.warn("Nice try 😄 — spin is server-controlled.");
        return;
      }
      return _emit(event, ...args);
    };
  }
})();
