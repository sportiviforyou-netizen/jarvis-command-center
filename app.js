/* ── GARVIS COMMAND CENTER · app.js ────────────────────────── */

const GARVIS_API_URL    = "https://jarvis-command-center-1-0.onrender.com/command";
const GARVIS_STREAM_URL = "https://jarvis-command-center-1-0.onrender.com/command-stream";
const STATUS_API_URL    = "https://jarvis-command-center-1-0.onrender.com/system-status";
const STATUS_INTERVAL   = 30000; // 30 sec

/* ── DOM REFS ────────────────────────────────────────────────── */
const commandEl   = document.getElementById("command");
const sendBtn     = document.getElementById("sendBtn");
const resultCard  = document.getElementById("resultCard");
const resultEl    = document.getElementById("result");
const copyBtn     = document.getElementById("copyBtn");
const clearBtn    = document.getElementById("clearBtn");
const orbCanvas   = document.getElementById("orbCanvas");
const orbStatus   = document.getElementById("orbStatus");

/* ═══════════════════════════════════════════════════════════════
   ORB – Canvas 2D AI Core
═══════════════════════════════════════════════════════════════ */

(function initOrb() {
  const ctx  = orbCanvas.getContext("2d");
  const SIZE = Math.min(200, window.innerWidth * 0.46);
  const DPR  = Math.min(window.devicePixelRatio || 1, 2);

  orbCanvas.width  = SIZE * DPR;
  orbCanvas.height = SIZE * DPR;
  orbCanvas.style.width  = SIZE + "px";
  orbCanvas.style.height = SIZE + "px";
  ctx.scale(DPR, DPR);

  const CX = SIZE / 2, CY = SIZE / 2;
  const R  = SIZE * 0.28;

  /* ── particles ── */
  const PARTICLE_COUNT = 38;
  const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    angle:  Math.random() * Math.PI * 2,
    radius: R * (1.4 + Math.random() * 1.1),
    speed:  (Math.random() - 0.5) * 0.006,
    size:   0.6 + Math.random() * 1.4,
    alpha:  0.2 + Math.random() * 0.6,
    drift:  (Math.random() - 0.5) * 0.0008,
  }));

  /* ── rings ── */
  const rings = [
    { rx: R * 1.55, ry: R * 0.45, angle: 0,    speed:  0.008, color: "rgba(0,212,255," },
    { rx: R * 1.30, ry: R * 0.38, angle: 1.05, speed: -0.011, color: "rgba(0,128,255," },
    { rx: R * 1.75, ry: R * 0.28, angle: 2.10, speed:  0.006, color: "rgba(123,47,255," },
  ];

  let t = 0;
  let raf = null;
  let hidden = false;

  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    if (!hidden && !raf) loop();
  });

  function drawOrb() {
    ctx.clearRect(0, 0, SIZE, SIZE);

    /* outer ambient glow */
    const amb = ctx.createRadialGradient(CX, CY, R * 0.6, CX, CY, R * 2.2);
    amb.addColorStop(0, "rgba(0,212,255,0.10)");
    amb.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = amb;
    ctx.beginPath();
    ctx.arc(CX, CY, R * 2.2, 0, Math.PI * 2);
    ctx.fill();

    /* rings */
    rings.forEach(rg => {
      rg.angle += rg.speed;
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(rg.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, rg.rx, rg.ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = rg.color + "0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
      /* ring glow dot */
      const gx = Math.cos(t * rg.speed * 80) * rg.rx;
      const gy = Math.sin(t * rg.speed * 80) * rg.ry;
      const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, 5);
      grd.addColorStop(0, rg.color + "0.9)");
      grd.addColorStop(1, rg.color + "0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(gx, gy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    /* triangle */
    const tri = R * 0.72;
    const breathe = 1 + Math.sin(t * 0.035) * 0.05;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(t * 0.004);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * tri * breathe;
      const y = Math.sin(a) * tri * breathe;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(0,212,255,0.55)";
    ctx.lineWidth = 1.2;
    ctx.shadowColor = "rgba(0,212,255,0.8)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();

    /* core orb */
    const pulse = 1 + Math.sin(t * 0.04) * 0.06;
    const core = ctx.createRadialGradient(CX - R * 0.18, CY - R * 0.18, 0, CX, CY, R * pulse);
    core.addColorStop(0,   "rgba(180,240,255,0.95)");
    core.addColorStop(0.25,"rgba(0,200,255,0.85)");
    core.addColorStop(0.6, "rgba(0,80,200,0.6)");
    core.addColorStop(1,   "rgba(0,10,40,0.0)");
    ctx.beginPath();
    ctx.arc(CX, CY, R * pulse, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.shadowColor = "rgba(0,212,255,1)";
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;

    /* particles */
    particles.forEach(p => {
      p.angle  += p.speed;
      p.radius += p.drift;
      if (p.radius < R * 1.2 || p.radius > R * 2.7) p.drift *= -1;
      const x = CX + Math.cos(p.angle) * p.radius;
      const y = CY + Math.sin(p.angle) * p.radius;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,212,255,${p.alpha * (0.5 + 0.5 * Math.sin(t * 0.02 + p.angle))})`;
      ctx.fill();
    });
  }

  function loop() {
    if (hidden) { raf = null; return; }
    t++;
    drawOrb();
    raf = requestAnimationFrame(loop);
  }

  loop();

  window.addEventListener("resize", () => {
    const newSize = Math.min(200, window.innerWidth * 0.46);
    orbCanvas.width  = newSize * DPR;
    orbCanvas.height = newSize * DPR;
    orbCanvas.style.width  = newSize + "px";
    orbCanvas.style.height = newSize + "px";
    ctx.scale(DPR, DPR);
  });
})();

/* ═══════════════════════════════════════════════════════════════
   SYSTEM STATUS
═══════════════════════════════════════════════════════════════ */

function setDot(id, state) {
  const el = document.getElementById("dot-" + id);
  if (!el) return;
  el.className = "status-card__dot " + state;
}

function setVal(id, text) {
  const el = document.getElementById("val-" + id);
  if (el) el.textContent = text;
}

async function fetchStatus() {
  try {
    const res  = await fetch(STATUS_API_URL, { cache: "no-store" });
    const data = await res.json();

    /* Brain */
    const brainOk = data.brain?.status === "active";
    setVal("brain", brainOk ? data.brain.active + " " + data.brain.version : "לא זמין");
    setDot("brain", brainOk ? "ok" : "err");

    /* Memory */
    const memFiles = data.memory?.total_files ?? 0;
    setVal("memory", memFiles + " / " + (data.memory?.files ? Object.keys(data.memory.files).length : 5) + " קבצים");
    setDot("memory", memFiles > 0 ? "ok" : "warn");

    /* Tools */
    const tools   = data.tools || {};
    const toolOk  = Object.values(tools).every(v => v === "active" || v === "depends_on_brain");
    const toolCount = Object.values(tools).filter(v => v === "active").length;
    setVal("tools", toolCount + "/" + Object.keys(tools).length + " פעילים");
    setDot("tools", toolOk ? "ok" : "warn");

    /* Deployment */
    const dep = data.deployment || {};
    setVal("deploy", dep.platform || "—");
    setDot("deploy", dep.platform ? "ok" : "warn");

    /* Orb label */
    if (orbStatus) orbStatus.textContent = data.brain?.active || "OpenAI";

  } catch {
    ["brain","memory","tools","deploy"].forEach(id => {
      setVal(id, "offline");
      setDot(id, "err");
    });
    if (orbStatus) orbStatus.textContent = "מנסה להתחבר...";
  }
}

fetchStatus();
setInterval(fetchStatus, STATUS_INTERVAL);

/* ═══════════════════════════════════════════════════════════════
   QUICK ACTIONS
═══════════════════════════════════════════════════════════════ */

document.querySelectorAll(".qa-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;
    if (!cmd) return;
    commandEl.value = cmd;
    commandEl.scrollIntoView({ behavior: "smooth", block: "center" });
    commandEl.focus();
  });
});

/* ═══════════════════════════════════════════════════════════════
   COMMAND – original logic preserved
═══════════════════════════════════════════════════════════════ */

async function sendCommandToGarvis() {
  const command = commandEl.value.trim();
  if (!command) { alert("כתוב פקודה לג׳רביס לפני השליחה."); return; }

  resultCard.classList.remove("hidden");
  resultEl.className   = "result-text loading-pulse";
  resultEl.textContent = "⚡ ג׳רביס חושב...";
  sendBtn.disabled     = true;

  let fullText  = "";
  let actionUrl = null;

  try {
    const res = await fetch(GARVIS_STREAM_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ command }),
    });

    if (!res.ok || !res.body) {
      // fallback to classic endpoint
      const data = await res.json().catch(() => ({}));
      resultEl.className   = "result-text";
      resultEl.textContent = data.reply || "שגיאה בשרת.";
      return;
    }

    resultEl.className   = "result-text";
    resultEl.textContent = "";

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buf     = "";

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();                // keep partial last line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let msg;
        try { msg = JSON.parse(line.slice(6)); } catch { continue; }

        if (msg.text) {
          fullText            += msg.text;
          resultEl.textContent = fullText;
          resultEl.scrollTop   = resultEl.scrollHeight;
        }
        if (msg.error) {
          resultEl.textContent = "שגיאה: " + msg.error;
          break outer;
        }
        if (msg.done) {
          actionUrl = msg.action_url || null;
          break outer;
        }
      }
    }

    if (fullText) {
      localStorage.setItem("garvis_last_command",  command);
      localStorage.setItem("garvis_last_response", fullText);
    }
    if (actionUrl) setTimeout(() => window.open(actionUrl, "_blank"), 600);

  } catch (err) {
    resultEl.className   = "result-text";
    resultEl.textContent = "שגיאה בחיבור:\n" + err.message;
  } finally {
    sendBtn.disabled = false;
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

sendBtn.addEventListener("click", sendCommandToGarvis);

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultEl.textContent);
    copyBtn.textContent = "הועתק ✓";
    setTimeout(() => copyBtn.textContent = "העתק", 1400);
  } catch {
    alert("לא הצלחתי להעתיק אוטומטית. אפשר לסמן ולהעתיק ידנית.");
  }
});

clearBtn.addEventListener("click", () => {
  commandEl.value = "";
  resultEl.textContent = "";
  resultCard.classList.add("hidden");
});

window.addEventListener("load", () => {
  const last = localStorage.getItem("garvis_last_command");
  if (last) commandEl.value = last;
});
