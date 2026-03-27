// script.js — shared wheel logic for viewer + admin
// window.IS_ADMIN is set inline in each HTML file

(function () {
  const socket = io();

  let segments = [];
  let currentRotation = 0; // cumulative degrees — kept in sync across spins
  let spinning = false;

  const canvas      = document.getElementById("wheel");
  const ctx         = canvas.getContext("2d");
  const statusEl    = document.getElementById("status");
  const resultBanner = document.getElementById("result-banner");
  const resultValue  = document.getElementById("result-value");
  const confettiCanvas = document.getElementById("confetti");
  const confettiCtx    = confettiCanvas.getContext("2d");
  const spinBtn = document.getElementById("spinBtn");

  // Canvas sizing
  const SIZE = Math.min(window.innerWidth * 0.82, 420);
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const R = SIZE / 2;

  confettiCanvas.width  = window.innerWidth;
  confettiCanvas.height = window.innerHeight;

  // ── Draw wheel ────────────────────────────────────────────────────
  function drawWheel(rotDeg) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (!segments.length) return;

    const rotRad    = (rotDeg * Math.PI) / 180;
    const segAngle  = (2 * Math.PI) / segments.length;

    segments.forEach((seg, i) => {
      const start = rotRad + i * segAngle;
      const end   = start + segAngle;

      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.arc(R, R, R - 2, start, end);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(start + segAngle / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur  = 4;
      const fs = Math.max(11, Math.min(15, R / (segments.length * 0.7)));
      ctx.font = `600 ${fs}px 'DM Sans', sans-serif`;
      ctx.fillText(seg.label, R - 16, fs / 3);
      ctx.restore();
    });

    // Outer ring
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(247,201,72,0.25)";
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // ── Animate spin ──────────────────────────────────────────────────
  // targetAngleDeg: DELTA degrees to add to currentRotation
  function animateSpin(targetAngleDeg, duration) {
    spinning = true;
    if (spinBtn) spinBtn.disabled = true;
    setStatus("spinning", "🎡 Spinning...");

    const startRot = currentRotation;
    const endRot   = startRot + targetAngleDeg;
    const startTime = performance.now();

    function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

    function frame(now) {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const rot = startRot + (endRot - startRot) * easeOut(progress);
      currentRotation = rot;
      drawWheel(rot);
      if (progress < 1) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  // ── Status ────────────────────────────────────────────────────────
  function setStatus(cls, msg) {
    statusEl.className   = cls;
    statusEl.textContent = msg;
  }

  // ── Result banner ─────────────────────────────────────────────────
  function showResult(label) {
    resultValue.textContent = label;
    resultBanner.classList.add("show");
    launchConfetti();
    setTimeout(() => resultBanner.classList.remove("show"), 4000);
  }

  // ── Confetti ──────────────────────────────────────────────────────
  let confettiParticles = [];

  function launchConfetti() {
    confettiParticles = [];
    for (let i = 0; i < 100; i++) {
      confettiParticles.push({
        x: Math.random() * confettiCanvas.width,
        y: -10,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 4 + 2,
        color: ["#f7c948","#ff6b6b","#4ecdc4","#c3a6ff","#ff6fa8"][Math.floor(Math.random()*5)],
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
    confettiParticles = confettiParticles.filter(p => p.life > 0.01);
    confettiParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.1;
      p.rotation += p.rotSpeed; p.life -= 0.012;
      confettiCtx.save();
      confettiCtx.globalAlpha = p.life;
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate((p.rotation * Math.PI) / 180);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.size/2, -p.size/4, p.size, p.size/2);
      confettiCtx.restore();
    });
    if (confettiParticles.length > 0) requestAnimationFrame(tickConfetti);
  }

  // ── Socket events ─────────────────────────────────────────────────
  socket.on("init", (data) => {
    segments = data.segments;
    drawWheel(currentRotation);
    setStatus("live", "● Connected — waiting for spin");
    if (window.IS_ADMIN) renderAdminPanel();
  });

  socket.on("segmentsUpdated", (data) => {
    segments = data.segments;
    // Reset rotation so pointer math stays clean after segment count changes
    currentRotation = 0;
    drawWheel(0);
    if (window.IS_ADMIN) renderAdminPanel();
  });

  socket.on("spinResult", (data) => {
    animateSpin(data.targetAngle, data.duration);
  });

  socket.on("spinComplete", (data) => {
    spinning = false;
    // Normalise currentRotation to keep numbers small
    currentRotation = currentRotation % 360;
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

  // ── Spin button ───────────────────────────────────────────────────
  if (spinBtn) {
    spinBtn.addEventListener("click", () => {
      if (spinning) return;
      socket.emit("requestSpin", { adminToken: "wheel-admin-secret" });
    });
  }

  // ── Block viewers from spoofing spins ─────────────────────────────
  if (!window.IS_ADMIN) {
    const _emit = socket.emit.bind(socket);
    socket.emit = function (event, ...args) {
      if (event === "requestSpin" || event === "updateSegments") {
        console.warn("Nice try 😄 — controls are server-side only.");
        return;
      }
      return _emit(event, ...args);
    };
  }

  // ── Admin panel ───────────────────────────────────────────────────
  // Renders a live editable list of segments on the right side
  function renderAdminPanel() {
    const panel = document.getElementById("segment-panel");
    if (!panel) return;

    panel.innerHTML = "";

    segments.forEach((seg, i) => {
      const row = document.createElement("div");
      row.className = "seg-row";

      // Color swatch
      const swatch = document.createElement("input");
      swatch.type  = "color";
      swatch.value = seg.color;
      swatch.className = "seg-color";
      swatch.title = "Change color";
      swatch.addEventListener("input", () => {
        segments[i].color = swatch.value;
        drawWheel(currentRotation);
      });

      // Label input
      const labelInput = document.createElement("input");
      labelInput.type      = "text";
      labelInput.value     = seg.label;
      labelInput.maxLength = 30;
      labelInput.className = "seg-label";
      labelInput.placeholder = "Segment label";
      labelInput.addEventListener("input", () => {
        segments[i].label = labelInput.value;
        drawWheel(currentRotation);
      });

      // Delete button
      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.className   = "seg-del";
      delBtn.title       = "Remove segment";
      delBtn.addEventListener("click", () => {
        if (segments.length <= 2) {
          alert("Need at least 2 segments.");
          return;
        }
        segments.splice(i, 1);
        pushSegments();
      });

      row.appendChild(swatch);
      row.appendChild(labelInput);
      row.appendChild(delBtn);
      panel.appendChild(row);
    });

    // Add segment button
    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Add segment";
    addBtn.className   = "seg-add";
    addBtn.addEventListener("click", async () => {
      const res   = await fetch("/next-color");
      const { color } = await res.json();
      segments.push({ label: "New", color });
      pushSegments();
    });
    panel.appendChild(addBtn);

    // Apply button — broadcasts to all clients
    const applyBtn = document.createElement("button");
    applyBtn.textContent = "✔ Apply to all viewers";
    applyBtn.className   = "seg-apply";
    applyBtn.addEventListener("click", pushSegments);
    panel.appendChild(applyBtn);
  }

  function pushSegments() {
    socket.emit("updateSegments", {
      adminToken: "wheel-admin-secret",
      segments,
    });
  }

})();
