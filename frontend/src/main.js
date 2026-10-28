import { getAddress } from "viem";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import "./style.css";
import { ClaimRecovery, address, CHAIN_ID } from "./recovery.js";
const recovery = new ClaimRecovery(localStorage);
let walletRevision = 0;

const DEFAULT_CONTRACT = import.meta.env.VITE_CONTRACT_ADDRESS || "";
const EXPLORER = "https://explorer-studio.genlayer.com";

const $ = (id) => document.getElementById(id);
const short = (addr) =>
  addr && addr.length > 13
    ? addr.slice(0, 6) + "…" + addr.slice(-4)
    : addr || "";

let account = null;
let client = null;
let contractAddress = localStorage.getItem("ps_contract") || DEFAULT_CONTRACT;
let allClaims = [];
let currentFilter = "ALL";

const CATEGORY_TEXT = {
  trigger_met: "A loaded source confirms the trigger condition.",
  trigger_not_met: "The sources do not reach the claimed threshold.",
  exclusion_applies: "A policy exclusion covers this event.",
  insufficient_evidence: "The sources do not cover this trigger.",
  source_unreachable: "None of the filed sources could be loaded.",
  policy_unclear: "The filed terms do not settle coverage.",
};

/* ---------- Animated weather map ---------- */

function startWeatherMap() {
  const canvas = $("weathermap");
  if (!canvas) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d");
  let w = (canvas.width = window.innerWidth);
  let h = (canvas.height = window.innerHeight);
  const cells = Array.from({ length: 22 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: 24 + Math.random() * 70,
    vx: 0.08 + Math.random() * 0.22,
    vy: 0.02 + Math.random() * 0.08,
    hue: Math.random() < 0.6 ? 190 : 36,
    a: 0.03 + Math.random() * 0.05,
  }));
  window.addEventListener("resize", () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  });
  (function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 120) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (const c of cells) {
      c.x += c.vx;
      c.y += c.vy;
      if (c.x - c.r > w) c.x = -c.r;
      if (c.y - c.r > h) c.y = -c.r;
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      g.addColorStop(0, `hsla(${c.hue}, 90%, 55%, ${c.a})`);
      g.addColorStop(1, "hsla(190, 90%, 55%, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  })();
}

/* ---------- Proceedings timeline ---------- */

function setStage(stage) {
  const order = ["sign", "sent", "consensus", "final"];
  document.querySelectorAll(".steps li").forEach((li) => {
    const step = li.dataset.step;
    li.classList.remove("active", "done");
    if (stage === "error") return;
    if (order.indexOf(step) < order.indexOf(stage)) li.classList.add("done");
    if (step === stage) li.classList.add("active");
    if (stage === "final" && step === "final") li.classList.add("done");
  });
}

function setTx(text, kind = "", hash = "") {
  const el = $("tx-status");
  el.className = "tx " + kind;
  el.textContent = text;
  if (hash) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copy hash";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(hash);
        btn.textContent = "Copied";
      } catch {
        btn.textContent = hash;
      }
    });
    el.appendChild(btn);
  }
}

function showError(message) {
  const el = $("error");
  el.textContent = message;
  el.hidden = !message;
}

function readClient() {
  return createClient({ chain: studionet });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function verdictStamp(c) {
  if (c.verdict === "APPROVED") return `<span class="stamp ok">APPROVED ✓</span>`;
  if (c.verdict === "DENIED") return `<span class="stamp bad">DENIED ✗</span>`;
  if (c.verdict === "UNVERIFIED") return `<span class="stamp warn">UNVERIFIED ?</span>`;
  return "";
}

function verdictBadge(c) {
  if (c.verdict === "APPROVED") return `<span class="badge ok">APPROVED</span>`;
  if (c.verdict === "DENIED") return `<span class="badge bad">DENIED</span>`;
  if (c.verdict === "UNVERIFIED") return `<span class="badge warn">UNVERIFIED</span>`;
  return "";
}

function renderCard(c) {
  const canAssess = c.status === "FILED";
  const sources = (c.sources || [])
    .map(
      (u) =>
        `<li><a href="${escapeHtml(u)}" target="_blank" rel="noreferrer">${escapeHtml(
          u
        )}</a></li>`
    )
    .join("");
  return `<article class="claim-card">
    ${verdictStamp(c)}
    <header><h3>${escapeHtml(c.subject)}</h3>
    <span><span class="badge neutral">${escapeHtml(c.status)}</span>${verdictBadge(c)}</span></header>
    <p class="trigger">▸ ${escapeHtml(c.trigger_condition)}</p>
    <p class="event">${escapeHtml(c.event_description)}</p>
    <details><summary>Policy terms</summary><p>${escapeHtml(c.policy_terms)}</p></details>
    <p class="meta">ID <code>${escapeHtml(c.claim_id)}</code> · filed by ${short(
      c.filer
    )} · assessments ×${c.assessment_count}</p>
    <ul class="sources">${sources}</ul>
    ${
      c.summary
        ? `<p class="summary"><strong>Tribunal's reasoning:</strong> ${escapeHtml(
            c.summary
          )}<br><span class="muted">${escapeHtml(
            CATEGORY_TEXT[c.category] || c.category
          )}</span></p>`
        : ""
    }
    ${
      canAssess
        ? `<button class="btn amber" data-assess="${escapeHtml(
            c.claim_id
          )}">Run validator assessment</button>`
        : ""
    }
  </article>`;
}

function renderFiltered() {
  const list = $("claim-list");
  const shown =
    currentFilter === "ALL"
      ? allClaims
      : currentFilter === "FILED"
        ? allClaims.filter((c) => c.status === "FILED")
        : allClaims.filter((c) => c.verdict === currentFilter);
  if (shown.length === 0) {
    list.innerHTML = "<p class='muted'>No claims match this filter.</p>";
    return;
  }
  list.innerHTML = shown.map(renderCard).join("");
  list.querySelectorAll("[data-assess]").forEach((btn) => {
    btn.addEventListener("click", () => onAssess(btn.dataset.assess));
  });
  updateRecovery();
}

function renderLedger() {
  $("count").textContent = String(allClaims.length);
  $("count-approved").textContent = String(
    allClaims.filter((c) => c.verdict === "APPROVED").length
  );
  $("count-denied").textContent = String(
    allClaims.filter((c) => c.verdict === "DENIED").length
  );
  $("count-unverified").textContent = String(
    allClaims.filter((c) => c.verdict === "UNVERIFIED").length
  );
  $("hero-count").textContent = String(allClaims.length);
  $("hero-approved").textContent = String(
    allClaims.filter((c) => c.verdict === "APPROVED").length
  );
  $("hero-denied").textContent = String(
    allClaims.filter((c) => c.verdict === "DENIED").length
  );
}

async function refreshList() {
  const list = $("claim-list");
  if (!contractAddress) {
    list.innerHTML =
      "<p class='muted'>Enter a contract address above to load the docket.</p>";
    return;
  }
  list.innerHTML = "<p class='muted'>Opening the docket…</p>";
  try {
    const c = readClient();
    const countRaw = await c.readContract({
      address: contractAddress,
      functionName: "get_claim_count",
      args: [],
    });
    const count = Number(countRaw);
    if (count === 0) {
      allClaims = [];
      list.innerHTML =
        "<p class='muted'>The docket is empty. File the first claim below.</p>";
      renderLedger();
      return;
    }
    allClaims = [];
    for (let i = count - 1; i >= 0; i--) {
      const id = await c.readContract({
        address: contractAddress,
        functionName: "get_claim_id",
        args: [i],
      });
      const raw = await c.readContract({
        address: contractAddress,
        functionName: "get_claim",
        args: [String(id)],
      });
      allClaims.push(typeof raw === "string" ? JSON.parse(raw) : raw);
    }
    renderLedger();
    renderFiltered();
    updateRecovery();
  } catch (err) {
    list.innerHTML = "<p class='muted'>Could not load the docket.</p>";
    showError("Load failed: " + (err?.message || err));
  }
}

async function ensureWallet() {
  if (!window.ethereum)
    throw new Error("No wallet found. Install MetaMask and try again.");
  if (!account) {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    account = accounts[0];
    $("wallet-btn").textContent = "Connected: " + short(account);
  }
  client = createClient({ chain: studionet, account, provider: window.ethereum });
  await client.connect("studionet");
  return client;
}

function updateRecovery() {
  let pending;
  try {
    pending = contractAddress ? recovery.pending(contractAddress) : null;
    $("pending-note").textContent = pending
      ? `Pending ${pending.method} · ${pending.claimId} · ${pending.hash}. Resume tracking; do not resubmit.`
      : "No saved transaction for this contract.";
  } catch (err) { $("pending-note").textContent = err.message; pending = true; }
  document.querySelectorAll('#create-form button, [data-assess]').forEach(b => b.disabled = recovery.busy || !!pending);
  $("resume-btn").disabled = recovery.busy || !pending;
  document.querySelectorAll('#contract-form button, #contract-address, #wallet-btn, #refresh-btn').forEach(b => b.disabled = recovery.busy);
}
const waitForClaim = hash => readClient().waitForTransactionReceipt({
  hash, status: "FINALIZED", interval: 3000, retries: 20, fullTransaction: true,
});
const readClaim = (target, id) => readClient().readContract({
  address: getAddress(target), functionName: "get_claim", args: [id], transactionHashVariant: "latest-final",
});
async function runTrackedAction(action) {
  showError("");
  try {
    const promise = action();
    updateRecovery();
    const { tx } = await promise;
    setStage("final");
    setTx(`Execution and claim state verified: ${tx.hash}`, "ok", tx.hash);
    await refreshList();
  } catch (err) {
    setStage("error");
    showError((err?.message || String(err)) + " If a transaction was sent, resume tracking instead of sending again.");
    throw err;
  } finally { updateRecovery(); }
}
async function trackAction(action) {
  if (!navigator.locks) throw Error("This browser cannot safely coordinate transactions. Use a current browser with Web Locks support.");
  return navigator.locks.request(`parashield:${CHAIN_ID}:${address(contractAddress)}`, { ifAvailable: true }, async lock => {
    if (!lock) throw Error("Another tab is handling this contract. Finish or resume there first.");
    return runTrackedAction(action);
  });
}
async function send(method, args) {
  if (recovery.busy) throw Error("An action is already running.");
  const target = address(contractAddress);
  // Lock before opening the wallet prompt, including the account request.
  return trackAction(() => recovery.submit(target, method, args, account || "", async () => {
    const c = await ensureWallet();
    const revision = walletRevision;
    const [active] = await window.ethereum.request({ method: "eth_accounts" });
    const chain = await window.ethereum.request({ method: "eth_chainId" });
    if (revision !== walletRevision || active?.toLowerCase() !== account?.toLowerCase() || Number(chain) !== CHAIN_ID)
      throw Error("Wallet changed or wrong network. Reconnect on Stable Studionet.");
    setStage("sign");
    setTx("Waiting for signature…");
    const hash = await c.writeContract({ address: getAddress(target), functionName: method, args, value: 0n });
    setStage("consensus");
    setTx(`Submitted ${hash}. Keep this ID; resume if tracking pauses.`, "", hash);
    return { hash, sender: active };
  }, waitForClaim, readClaim));
}

async function onCreate(ev) {
  ev.preventDefault();
  if (!contractAddress) return showError("Set a contract address first.");
  const id = $("f-id").value.trim();
  const subject = $("f-subject").value.trim();
  const eventDesc = $("f-event").value.trim();
  const policy = $("f-policy").value.trim();
  const trigger = $("f-trigger").value.trim();
  const s1 = $("f-s1").value.trim();
  const s2 = $("f-s2").value.trim();
  const s3 = $("f-s3").value.trim();
  try {
    await send("file_claim", [id, subject, eventDesc, policy, trigger, s1, s2, s3]);
  } catch (err) {
    setStage("error");
    showError("Filing failed: " + (err?.message || err));
  }
}

async function onAssess(cid) {
  if (!contractAddress) return showError("Set a contract address first.");
  try {
    await send("assess_claim", [cid]);
  } catch (err) {
    setStage("error");
    showError("Assessment failed: " + (err?.message || err));
  }
}

$("wallet-btn").addEventListener("click", async () => {
  try {
    await ensureWallet();
  } catch (err) {
    showError(err?.message || err);
  }
});
$("contract-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (recovery.busy) return;
  try { address($("contract-address").value.trim()); } catch (err) { return showError(err.message); }
  contractAddress = $("contract-address").value.trim();
  localStorage.setItem("ps_contract", contractAddress);
  $("explorer-link").href = EXPLORER + "/address/" + contractAddress;
  refreshList();
  updateRecovery();
});
$("create-form").addEventListener("submit", onCreate);
$("refresh-btn").addEventListener("click", refreshList);
document.querySelectorAll("[data-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentFilter = btn.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((b) => {
      b.setAttribute("aria-pressed", b === btn ? "true" : "false");
    });
    renderFiltered();
  });
});
$("demo-btn").addEventListener("click", () => {
  if (recovery.busy) return;
  if (DEFAULT_CONTRACT) {
    contractAddress = DEFAULT_CONTRACT;
    localStorage.setItem("ps_contract", contractAddress);
    $("contract-address").value = contractAddress;
    $("explorer-link").href = EXPLORER + "/address/" + contractAddress;
  }
  refreshList();
  updateRecovery();
});

$("contract-address").value = contractAddress;
$("explorer-link").href = contractAddress
  ? EXPLORER + "/address/" + contractAddress
  : EXPLORER;
$("chain-note").textContent =
  "Stable Studionet · Chain ID 61999 · test network only, no real funds";
startWeatherMap();
refreshList();

$("resume-btn").addEventListener("click", () => {
  trackAction(() => recovery.resume(contractAddress, waitForClaim, readClaim)).catch(err => showError(err.message));
});
for (const event of ["accountsChanged", "chainChanged", "disconnect"]) {
  window.ethereum?.on?.(event, () => {
    walletRevision++;
    account = null;
    client = null;
    $("wallet-btn").textContent = "Reconnect wallet";
  });
}
window.addEventListener("storage", updateRecovery);
updateRecovery();
