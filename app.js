/* ---------- State & persistence ---------- */

const STORAGE_KEY = "financeTracker.v1";

const ACCOUNT_TYPES = [
  { id: "courant", label: "Compte courant", group: "Liquidités" },
  { id: "livret", label: "Livret / Épargne", group: "Liquidités" },
  { id: "compte_a_terme", label: "Compte à terme", group: "Liquidités" },
  { id: "assurance_vie", label: "Assurance-vie", group: "Placements" },
  { id: "pea", label: "PEA", group: "Placements" },
  { id: "cto", label: "Compte-titres", group: "Placements" },
  { id: "epargne_salariale", label: "Épargne salariale (PERCO/FCPE)", group: "Placements" },
  { id: "crypto", label: "Crypto", group: "Placements" },
  { id: "immobilier", label: "Immobilier", group: "Actifs réels" },
  { id: "credit", label: "Crédit / Dette", group: "Dettes" },
  { id: "autre", label: "Autre", group: "Autres" },
];

const RISK_BUCKETS = [
  { id: "securise", label: "Sécurisé", color: "#3ecf8e" },
  { id: "croissance", label: "Croissance", color: "#6c8cff" },
  { id: "performance", label: "Performance", color: "#f2637a" },
];

const DEFAULT_TARGET_ALLOCATION = { securise: 50, croissance: 35, performance: 15 };

// Mapping des catégories d'un relevé de supports (Linxea et assimilés) vers les poches ABC.
// Les catégories non reconnues sont classées en "croissance" par défaut.
const HOLDINGS_CATEGORY_RISK_MAP = {
  "fonds euro": "securise",
  "fonds actions": "croissance",
  "produit structure": "performance",
  "fonds private equity": "performance",
  "fonds obligataire": "securise",
  "fonds diversifie": "croissance",
  "fonds immobilier": "performance",
};

const PLACEMENT_TO_ACCOUNT_TYPE = {
  "assurance vie": "assurance_vie",
  "pea": "pea",
  "pea-pme": "pea",
  "compte-titres": "cto",
  "compte titres": "cto",
};

// Pour les relevés sans colonne "Catégorie" (ex : export de positions PEA/CTO type
// BoursoBank) : les fonds/ETF concentrés sur un secteur, une zone ou une classe
// d'actifs alternative sont classés en Performance ; les fonds larges/diversifiés
// par défaut en Croissance. Classification heuristique, à vérifier ligne à ligne.
const PERFORMANCE_NAME_HINTS = [
  "small cap", "banks", "bank", "emergent", "emerging", "secteur", "sector",
  "technolog", "digital security", "cyber", "immobilier", "reit", "foncier",
  "private equity", "biotech", "crypto", "leverage", "levier", "short",
  "commodit", "matieres premieres", "high yield",
];

function guessRiskBucketFromName(name) {
  const n = normalizeHeader(name || "");
  return PERFORMANCE_NAME_HINTS.some(k => n.includes(normalizeHeader(k))) ? "performance" : "croissance";
}

const DEFAULT_CATEGORIES = [
  { id: "logement", name: "Logement", color: "#6c8cff", keywords: ["loyer", "edf", "engie", "eau", "syndic", "assurance habitation"] },
  { id: "alimentation", name: "Alimentation", color: "#3ecf8e", keywords: ["carrefour", "leclerc", "monoprix", "franprix", "lidl", "auchan", "boulangerie"] },
  { id: "transport", name: "Transport", color: "#f2b84b", keywords: ["sncf", "ratp", "essence", "total", "uber", "navigo", "autoroute"] },
  { id: "restaurants", name: "Restaurants & sorties", color: "#f2637a", keywords: ["restaurant", "deliveroo", "uber eats", "bar", "cafe", "café"] },
  { id: "sante", name: "Santé", color: "#a06cff", keywords: ["pharmacie", "medecin", "médecin", "mutuelle", "dentiste"] },
  { id: "loisirs", name: "Loisirs & shopping", color: "#4bc8f2", keywords: ["amazon", "fnac", "cinema", "cinéma", "netflix", "spotify"] },
  { id: "abonnements", name: "Abonnements", color: "#f28c4b", keywords: ["free mobile", "orange", "sfr", "bouygues", "abonnement"] },
  { id: "revenus", name: "Revenus", color: "#3ecf8e", keywords: ["salaire", "virement recu", "virement reçu", "remboursement"] },
  { id: "autre", name: "Autre", color: "#9aa1b2", keywords: [] },
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      data.settings = { targetAllocation: { ...DEFAULT_TARGET_ALLOCATION, ...(data.settings?.targetAllocation || {}) } };
      data.accounts = (data.accounts || []).map(a => ({
        note: "", riskSplit: { securise: 0, croissance: 0, performance: 0 }, contractNumber: "", holdings: [],
        rate: 0, maturityDate: "", taxable: true, holdingsHistory: [], operations: [], bankAccountNum: "",
        ...a,
        history: (a.history || []).map(h => ({ source: "Import initial", ...h })),
      }));
      data.budget = data.budget || { items: [], analyzedAt: null };
      return data;
    }
  } catch (e) { console.warn("state load failed", e); }
  return {
    accounts: [], transactions: [],
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c, keywords: [...c.keywords] })),
    settings: { targetAllocation: { ...DEFAULT_TARGET_ALLOCATION } },
    budget: { items: [], analyzedAt: null },
  };
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ---------- Utils ---------- */

function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
function formatMoneyPrecise(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function monthKey(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "0000-00";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}
function accountTypeMeta(id) {
  return ACCOUNT_TYPES.find(t => t.id === id) || ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1];
}
function categoryById(id) {
  return state.categories.find(c => c.id === id) || state.categories[state.categories.length - 1];
}
function accountById(id) {
  return state.accounts.find(a => a.id === id);
}

/* ---------- Navigation ---------- */

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

function setView(view) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${view}`));
  renderAll();
}

/* ---------- Theme & sidebar collapse ---------- */

const appRoot = document.getElementById("appRoot");
const themeSwitch = document.getElementById("themeSwitch");
const themeIcon = document.getElementById("themeIcon");

const themeLabel = document.querySelector(".theme-toggle-label .txt");
function applyTheme(theme, rerender) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("financeTracker.theme", theme);
  themeSwitch.classList.toggle("on", theme === "dark");
  themeIcon.textContent = theme === "light" ? "☀️" : "🌙";
  themeLabel.textContent = theme === "light" ? "Mode clair" : "Mode sombre";
  if (rerender) renderDashboard();
}
applyTheme(document.documentElement.dataset.theme || "dark", false);
themeSwitch.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light", true);
});

const sidebarToggle = document.getElementById("sidebarToggle");
function applySidebarCollapsed(collapsed) {
  appRoot.classList.toggle("sidebar-collapsed", collapsed);
  localStorage.setItem("financeTracker.sidebarCollapsed", collapsed ? "1" : "0");
}
applySidebarCollapsed(localStorage.getItem("financeTracker.sidebarCollapsed") === "1");
sidebarToggle.addEventListener("click", () => {
  applySidebarCollapsed(!appRoot.classList.contains("sidebar-collapsed"));
});

/* ---------- Form validation helpers ---------- */

function setFieldError(inputEl, message) {
  const field = inputEl.closest(".field");
  if (!field) return;
  let err = field.querySelector(".field-error");
  if (!err) {
    err = document.createElement("div");
    err.className = "field-error";
    field.appendChild(err);
  }
  err.innerHTML = `⚠ ${escapeHtml(message)}`;
  field.classList.add("has-error");
}
function clearFieldError(inputEl) {
  const field = inputEl.closest(".field");
  if (!field) return;
  field.classList.remove("has-error");
}
function clearAllFieldErrors(root) {
  root.querySelectorAll(".field.has-error").forEach(f => f.classList.remove("has-error"));
}

function setButtonLoading(btn, loading, loadingLabel) {
  if (loading) {
    btn.dataset.originalHtml = btn.innerHTML;
    if (loadingLabel) btn.textContent = loadingLabel;
    btn.classList.add("is-loading");
    btn.disabled = true;
  } else {
    btn.classList.remove("is-loading");
    btn.disabled = false;
    if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
  }
}

async function submitWithFeedback(btn, fn, successMessage) {
  setButtonLoading(btn, true);
  try {
    await fn();
    setButtonLoading(btn, false);
    if (successMessage) toast(successMessage, "success");
    return true;
  } catch (err) {
    setButtonLoading(btn, false);
    toast(err.message || "Une erreur est survenue.", "error");
    return false;
  }
}

/* ---------- Modal helper ---------- */

const modalOverlay = document.getElementById("modalOverlay");
const modalEl = document.getElementById("modal");

function openModal(html, onMount, { large = false } = {}) {
  modalEl.innerHTML = html;
  modalEl.classList.toggle("modal-lg", large);
  modalOverlay.hidden = false;
  if (onMount) onMount(modalEl);
}
function closeModal() {
  modalOverlay.hidden = true;
  modalEl.innerHTML = "";
  modalEl.classList.remove("modal-lg");
}
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

/* ---------- Accounts ---------- */

document.getElementById("btnAddAccount").addEventListener("click", () => openAccountModal());

function openAccountModal(existing) {
  const isEdit = !!existing;
  const split = existing?.riskSplit || { securise: 0, croissance: 0, performance: 0 };
  openModal(`
    <h3>${isEdit ? "Modifier le compte" : "Ajouter un compte"}</h3>
    <div class="field">
      <label>Nom</label>
      <input type="text" id="f-name" value="${existing ? escapeHtml(existing.name) : ""}" placeholder="Ex : Livret A, PEA Boursorama…" />
    </div>
    <div class="field">
      <label>Type</label>
      <select id="f-type">
        ${ACCOUNT_TYPES.map(t => `<option value="${t.id}" ${existing?.type === t.id ? "selected" : ""}>${t.label}</option>`).join("")}
      </select>
    </div>
    <div class="field">
      <label>Solde actuel (€)</label>
      <input type="number" step="0.01" id="f-balance" value="${existing ? existing.balance : ""}" placeholder="0.00" />
    </div>
    <div class="field">
      <label>Taux d'intérêt annuel (%) — laisser à 0 si non rémunéré</label>
      <input type="number" step="0.01" min="0" id="f-rate" value="${existing ? (existing.rate || 0) : 0}" placeholder="1.70" />
    </div>
    <div class="field" id="f-maturity-field" hidden>
      <label>Date d'échéance</label>
      <input type="date" id="f-maturity" value="${existing?.maturityDate || ""}" />
    </div>
    <div class="field" id="f-taxable-field" hidden>
      <label>Intérêts soumis à la flat tax (30%) ?</label>
      <div class="risk-split-row">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text);"><input type="radio" name="f-taxable" id="f-taxable-yes" ${existing?.taxable !== false ? "checked" : ""} style="width:auto;" /> Oui</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text);"><input type="radio" name="f-taxable" id="f-taxable-no" ${existing?.taxable === false ? "checked" : ""} style="width:auto;" /> Non (Livret A, LDDS…)</label>
      </div>
    </div>
    <div class="field">
      <label>Note (optionnel)</label>
      <textarea id="f-note" placeholder="Ex : à ne pas renouveler, contexte du compte…">${existing ? escapeHtml(existing.note || "") : ""}</textarea>
    </div>
    <div class="field">
      <label>Répartition ABC (%) — laisser à 0 si non classé</label>
      <div class="risk-split-row">
        ${RISK_BUCKETS.map(b => `
          <div class="risk-split-cell">
            <span class="risk-split-dot" style="background:${b.color}"></span>
            <input type="number" min="0" max="100" step="1" id="f-risk-${b.id}" value="${split[b.id] || 0}" />
            <label>${b.label}</label>
          </div>
        `).join("")}
      </div>
      <div class="import-note" id="f-risk-total">Total : ${(split.securise || 0) + (split.croissance || 0) + (split.performance || 0)}%</div>
    </div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="f-delete">Supprimer</button>` : ""}
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">${isEdit ? "Enregistrer" : "Ajouter"}</button>
    </div>
  `, (m) => {
    m.querySelector("#f-cancel").onclick = closeModal;
    const typeSelect = m.querySelector("#f-type");
    const maturityField = m.querySelector("#f-maturity-field");
    const taxableField = m.querySelector("#f-taxable-field");
    const toggleTermFields = () => {
      const isTerm = typeSelect.value === "compte_a_terme";
      maturityField.hidden = !isTerm;
      taxableField.hidden = !isTerm;
    };
    typeSelect.addEventListener("change", toggleTermFields);
    toggleTermFields();
    const riskInputs = RISK_BUCKETS.map(b => m.querySelector(`#f-risk-${b.id}`));
    const totalEl = m.querySelector("#f-risk-total");
    const updateTotal = () => {
      const total = riskInputs.reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
      totalEl.textContent = `Total : ${total}%`;
      totalEl.style.color = (total === 0 || total === 100) ? "var(--text-faint)" : "var(--red)";
    };
    riskInputs.forEach(el => el.addEventListener("input", updateTotal));
    if (isEdit) {
      m.querySelector("#f-delete").onclick = () => {
        if (confirm("Supprimer ce compte ? Les dépenses liées resteront mais perdront leur association.")) {
          state.accounts = state.accounts.filter(a => a.id !== existing.id);
          saveState(); closeModal(); renderAll();
        }
      };
    }
    const nameInput = m.querySelector("#f-name");
    nameInput.addEventListener("input", () => clearFieldError(nameInput));
    m.querySelector("#f-save").onclick = async (ev) => {
      clearAllFieldErrors(m);
      const name = nameInput.value.trim();
      const type = typeSelect.value;
      const balance = parseFloat(m.querySelector("#f-balance").value) || 0;
      const rate = parseFloat(m.querySelector("#f-rate").value) || 0;
      const maturityDate = m.querySelector("#f-maturity").value || "";
      const taxable = !m.querySelector("#f-taxable-no").checked;
      const note = m.querySelector("#f-note").value.trim();
      const riskSplit = {};
      RISK_BUCKETS.forEach(b => { riskSplit[b.id] = parseFloat(m.querySelector(`#f-risk-${b.id}`).value) || 0; });
      const riskTotal = riskSplit.securise + riskSplit.croissance + riskSplit.performance;
      if (!name) { setFieldError(nameInput, "Merci de donner un nom au compte."); nameInput.focus(); return; }
      if (riskTotal !== 0 && riskTotal !== 100) { toast("La répartition ABC doit totaliser 0% (non classé) ou 100%.", "error"); return; }
      await submitWithFeedback(ev.currentTarget, () => {
        if (isEdit) {
          existing.name = name; existing.type = type; existing.note = note; existing.riskSplit = riskSplit;
          existing.rate = rate; existing.maturityDate = maturityDate; existing.taxable = taxable;
          if (existing.balance !== balance) {
            existing.balance = balance;
            existing.history.push({ date: new Date().toISOString().slice(0, 10), balance, source: "Saisie manuelle" });
          }
        } else {
          state.accounts.push({
            id: uid(), name, type, balance, note, riskSplit, rate, maturityDate, taxable,
            contractNumber: "", holdings: [], holdingsHistory: [],
            history: [{ date: new Date().toISOString().slice(0, 10), balance, source: "Création du compte" }],
          });
        }
        saveState();
      }, isEdit ? "Compte mis à jour." : "Compte ajouté.");
      closeModal(); renderAll();
    };
  });
}

function updateBalanceQuick(account) {
  const val = prompt(`Nouveau solde pour "${account.name}" (€) :`, account.balance);
  if (val === null) return;
  const n = parseFloat(val.replace(",", "."));
  if (isNaN(n)) { toast("Montant invalide.", "error"); return; }
  account.balance = n;
  account.history.push({ date: new Date().toISOString().slice(0, 10), balance: n, source: "Saisie manuelle" });
  saveState(); renderAll();
  toast("Solde mis à jour.", "success");
}

function computeTermDepositProjection(account) {
  const rate = account.rate || 0;
  const today = new Date();
  const maturity = account.maturityDate ? new Date(account.maturityDate) : null;
  const opened = account.history.length ? new Date(account.history[0].date) : today;
  const msPerYear = 365.25 * 24 * 3600 * 1000;
  const yearsElapsed = Math.max(0, (today - opened) / msPerYear);
  const yearsToMaturity = maturity ? Math.max(0, (maturity - today) / msPerYear) : null;
  const grossGainAtMaturity = maturity ? account.balance * (rate / 100) * ((maturity - opened) / msPerYear) : null;
  const netGainAtMaturity = grossGainAtMaturity !== null ? (account.taxable !== false ? grossGainAtMaturity * 0.7 : grossGainAtMaturity) : null;
  return { rate, maturity, yearsElapsed, yearsToMaturity, grossGainAtMaturity, netGainAtMaturity };
}

function riskSplitBar(split) {
  if (!split) return "";
  const total = (split.securise || 0) + (split.croissance || 0) + (split.performance || 0);
  if (total !== 100) return "";
  return `
    <div class="risk-bar" title="Sécurisé ${split.securise}% · Croissance ${split.croissance}% · Performance ${split.performance}%">
      ${RISK_BUCKETS.map(b => split[b.id] > 0 ? `<span style="width:${split[b.id]}%;background:${b.color}"></span>` : "").join("")}
    </div>
  `;
}

function renderAccounts() {
  const wrap = document.getElementById("accountGroups");
  if (!state.accounts.length) {
    wrap.innerHTML = `<div class="empty-state">${emptyStateHtml({
      icon: "▤", title: "Aucun compte pour l'instant",
      desc: "Ajoutez votre premier compte bancaire, livret, PEA ou assurance-vie pour commencer à suivre votre patrimoine.",
      actionId: "esAddAccount", actionLabel: "+ Ajouter un compte",
    })}</div>`;
    wrap.querySelector("#esAddAccount").addEventListener("click", () => openAccountModal());
    return;
  }
  const groups = {};
  ACCOUNT_TYPES.forEach(t => groups[t.group] = groups[t.group] || []);
  state.accounts.forEach(a => {
    const meta = accountTypeMeta(a.type);
    groups[meta.group] = groups[meta.group] || [];
    groups[meta.group].push(a);
  });
  wrap.innerHTML = Object.entries(groups)
    .filter(([, accs]) => accs.length)
    .map(([group, accs]) => `
      <div>
        <div class="account-group-title">${group} · ${formatMoney(accs.reduce((s, a) => s + (accountTypeMeta(a.type).group === "Dettes" ? -a.balance : a.balance), 0))}</div>
        <div class="account-cards">
          ${accs.map(a => `
            <div class="account-card" data-id="${a.id}" tabindex="0" role="button">
              <div class="a-actions">
                <button class="a-edit" title="Modifier">✎</button>
                <button class="a-balance" title="Mettre à jour le solde">↻</button>
              </div>
              <div class="a-type">${accountTypeMeta(a.type).label}</div>
              <div class="a-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
              <div class="a-balance">${formatMoneyPrecise(a.balance)}</div>
              ${riskSplitBar(a.riskSplit)}
              ${accountTermBadge(a)}
              ${a.note ? `<div class="a-note" title="${escapeHtml(a.note)}">${escapeHtml(a.note)}</div>` : ""}
              ${a.holdings && a.holdings.length ? `<div class="a-composition-hint">▾ ${a.holdings.length} support(s) — voir le détail</div>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");

  wrap.querySelectorAll(".account-card").forEach(card => {
    const acc = accountById(card.dataset.id);
    card.querySelector(".a-edit").addEventListener("click", (e) => { e.stopPropagation(); openAccountModal(acc); });
    card.querySelector(".a-balance").addEventListener("click", (e) => { e.stopPropagation(); updateBalanceQuick(acc); });
    card.addEventListener("click", () => openAccountDetail(acc.id));
    card.addEventListener("keydown", (e) => { if (e.key === "Enter") openAccountDetail(acc.id); });
  });
}

function accountTermBadge(a) {
  if (a.type !== "compte_a_terme") return "";
  const p = computeTermDepositProjection(a);
  const parts = [];
  if (p.rate) parts.push(`Taux ${p.rate}%`);
  if (p.maturity) parts.push(`Échéance ${formatDate(a.maturityDate)}`);
  parts.push(a.taxable !== false ? "Flat tax 30%" : "Non imposable");
  return `<div class="a-term-badge">${parts.map(escapeHtml).join(" · ")}</div>`;
}

/* ---------- Account detail page ---------- */

const HOLDINGS_LIKE_TYPES = ["pea", "cto", "assurance_vie"];
let currentDetailAccountId = null;

function openAccountDetail(accountId) {
  currentDetailAccountId = accountId;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === "accounts"));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-account-detail"));
  renderAccountDetail();
}

function closeAccountDetail() {
  currentDetailAccountId = null;
  setView("accounts");
}

function renderAccountDetail() {
  const account = accountById(currentDetailAccountId);
  const root = document.getElementById("accountDetailRoot");
  if (!account) { closeAccountDetail(); return; }
  const meta = accountTypeMeta(account.type);
  const isHoldingsLike = HOLDINGS_LIKE_TYPES.includes(account.type);
  const isCashLike = CASH_ACCOUNT_TYPES.includes(account.type);
  const isTerm = account.type === "compte_a_terme";

  root.innerHTML = `
    <div class="detail-back"><button class="btn btn-ghost btn-sm" id="detailBack">‹ Comptes & placements</button></div>
    <header class="view-header detail-header">
      <div>
        <div class="a-type">${escapeHtml(meta.label)}</div>
        <h1>${escapeHtml(account.name)}</h1>
        <p class="subtitle">${account.note ? escapeHtml(account.note) : "Aucune note pour ce compte."}</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-ghost" id="detailEdit">✎ Modifier les infos</button>
        <button class="btn btn-ghost" id="detailQuickBalance">↻ Mettre à jour le solde</button>
        ${isHoldingsLike ? `<label class="btn btn-primary" for="detailImportFile">⇪ Mettre à jour via import CSV</label><input type="file" id="detailImportFile" accept=".csv,.xlsx,.xls" hidden />` : ""}
        ${isCashLike ? `<label class="btn btn-primary" for="detailImportOperations">⇪ Importer un historique d'opérations (CSV)</label><input type="file" id="detailImportOperations" accept=".csv,.xlsx,.xls" hidden />` : ""}
      </div>
    </header>

    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-label">Solde actuel</div>
        <div class="kpi-value">${formatMoneyPrecise(account.balance)}</div>
        <div class="kpi-sub">Mis à jour le ${formatDate(account.history[account.history.length - 1]?.date)}</div>
      </div>
      ${isTerm ? termKpiCards(account) : cashKpiCards(account)}
    </div>

    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-header"><h2>Évolution du solde</h2></div>
      <div class="chart-wrap"><canvas id="chartAccountHistory"></canvas></div>
    </div>

    ${!isHoldingsLike ? renderProjectionCalculator(account) : ""}
    ${isHoldingsLike ? renderHoldingsSection(account) : ""}
    ${isCashLike ? renderOperationsSection(account) : ""}

    <div class="panel">
      <div class="panel-header"><h2>Historique des mises à jour</h2></div>
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Date</th><th class="num">Solde</th><th>Source</th></tr></thead>
          <tbody>
            ${[...account.history].reverse().map(h => `
              <tr>
                <td>${formatDate(h.date)}</td>
                <td class="num">${formatMoneyPrecise(h.balance)}</td>
                <td><span class="cat-pill">${escapeHtml(h.source || "—")}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  root.querySelector("#detailBack").addEventListener("click", closeAccountDetail);
  root.querySelector("#detailEdit").addEventListener("click", () => openAccountModal(account));
  root.querySelector("#detailQuickBalance").addEventListener("click", () => { updateBalanceQuick(account); renderAccountDetail(); });
  root.querySelector("#detailImportFile")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await handleImportedFile(file, "holdings", account.id);
    e.target.value = "";
  });
  root.querySelector("#detailImportOperations")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await handleImportedFile(file, "operations", account.id);
    e.target.value = "";
  });

  renderAccountHistoryChart(account);
  if (!isHoldingsLike) wireProjectionCalculator(account);
  if (isHoldingsLike) wireHoldingsSection(account);
}

function renderOperationsSection(account) {
  const ops = account.operations || [];
  if (!ops.length) return "";
  return `
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-header"><h2>Historique des opérations (${ops.length})</h2></div>
      <div class="import-note" style="margin-bottom:10px;">Importé depuis un relevé bancaire — solde après chaque opération tel que fourni par la banque.</div>
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Date</th><th>Libellé</th><th class="num">Montant</th><th class="num">Solde après</th></tr></thead>
          <tbody>
            ${[...ops].reverse().map(o => `
              <tr>
                <td>${formatDate(o.date)}</td>
                <td class="truncate-cell"><span class="truncate" title="${escapeHtml(o.label)}">${escapeHtml(o.label)}</span></td>
                <td class="num ${o.amount < 0 ? "amount-neg" : "amount-pos"}">${formatMoneyPrecise(o.amount)}</td>
                <td class="num">${o.balance !== null && o.balance !== undefined ? formatMoneyPrecise(o.balance) : "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function cashKpiCards(account) {
  const rate = account.rate || 0;
  const annualEstimate = account.balance * (rate / 100);
  return `
    <div class="kpi-card">
      <div class="kpi-label">Taux annuel</div>
      <div class="kpi-value">${rate ? rate + " %" : "—"}</div>
      <div class="kpi-sub">${rate ? "Modifiable via « Modifier les infos »" : "Non renseigné"}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Revenu estimé sur 12 mois</div>
      <div class="kpi-value">${rate ? formatMoney(annualEstimate) : "—"}</div>
      <div class="kpi-sub">Au solde et taux actuels, hors versements</div>
    </div>
  `;
}

function termKpiCards(account) {
  const p = computeTermDepositProjection(account);
  return `
    <div class="kpi-card">
      <div class="kpi-label">Taux garanti</div>
      <div class="kpi-value">${p.rate} %</div>
      <div class="kpi-sub">${account.taxable !== false ? "Soumis à la flat tax 30%" : "Non imposable"}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Échéance</div>
      <div class="kpi-value">${account.maturityDate ? formatDate(account.maturityDate) : "—"}</div>
      <div class="kpi-sub">${p.yearsToMaturity !== null ? `Dans ${Math.round(p.yearsToMaturity * 12)} mois` : "Non renseignée"}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Gain net prévu à l'échéance</div>
      <div class="kpi-value">${p.netGainAtMaturity !== null ? formatMoney(p.netGainAtMaturity) : "—"}</div>
      <div class="kpi-sub">${p.grossGainAtMaturity !== null ? `Brut : ${formatMoney(p.grossGainAtMaturity)}` : "Renseignez le taux et l'échéance"}</div>
    </div>
  `;
}

function renderAccountHistoryChart(account) {
  destroyChart("accountHistory");
  const ctx = document.getElementById("chartAccountHistory");
  setChartEmpty("chartAccountHistory", account.history.length < 2, "📈", "L'historique se construit à chaque mise à jour du solde.");
  if (account.history.length < 2) return;
  const gradient = ctx.getContext("2d").createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, "rgba(108,140,255,0.22)");
  gradient.addColorStop(1, "rgba(108,140,255,0)");
  charts.accountHistory = new Chart(ctx, {
    type: "line",
    data: {
      labels: account.history.map(h => formatDate(h.date)),
      datasets: [{
        data: account.history.map(h => h.balance),
        borderColor: "#6c8cff", backgroundColor: gradient,
        fill: true, tension: 0.42, cubicInterpolationMode: "monotone",
        borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: "#6c8cff", pointHoverBorderColor: chartBg(), pointHoverBorderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => formatMoney(c.parsed.y) } } },
      scales: {
        x: { ticks: { color: chartText() }, grid: { display: false } },
        y: { ticks: { color: chartText(), callback: v => formatMoney(v) }, grid: { color: chartGrid() } },
      },
    },
  });
}

function renderProjectionCalculator(account) {
  return `
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-header"><h2>Estimation des revenus &amp; scénarios</h2></div>
      <p class="subtitle" style="margin-bottom:14px;">Simulation simplifiée à taux constant, à partir du solde et du taux actuels.</p>
      <div class="projection-grid">
        <div class="field">
          <label>Taux annuel (%)</label>
          <input type="number" step="0.01" min="0" id="proj-rate" value="${account.rate || 0}" />
        </div>
        <div class="field">
          <label>Versement mensuel prévu (€)</label>
          <input type="number" step="10" id="proj-deposit" value="0" />
        </div>
        <div class="field">
          <label>Retrait ponctuel (€)</label>
          <input type="number" step="10" min="0" id="proj-withdraw" value="0" />
        </div>
      </div>
      <div class="projection-result" id="projectionResult"></div>
    </div>
  `;
}

function wireProjectionCalculator(account) {
  const rateInput = document.getElementById("proj-rate");
  const depositInput = document.getElementById("proj-deposit");
  const withdrawInput = document.getElementById("proj-withdraw");
  const resultEl = document.getElementById("projectionResult");

  function compute() {
    const rate = parseFloat(rateInput.value) || 0;
    const monthlyDeposit = parseFloat(depositInput.value) || 0;
    const withdraw = parseFloat(withdrawInput.value) || 0;
    const now = new Date();
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    const monthsRemaining = Math.max(0, (endOfYear - now) / (30.44 * 24 * 3600 * 1000));
    const balanceAfterWithdraw = Math.max(0, account.balance - withdraw);
    const projectedBalance = balanceAfterWithdraw + monthlyDeposit * monthsRemaining;
    const avgBalance = (balanceAfterWithdraw + projectedBalance) / 2;
    const interest = avgBalance * (rate / 100) * (monthsRemaining / 12);
    resultEl.innerHTML = `
      <div class="projection-row"><span>Solde estimé au 31/12</span><strong>${formatMoney(projectedBalance)}</strong></div>
      <div class="projection-row"><span>Intérêts estimés d'ici fin d'année</span><strong class="amount-pos">+${formatMoney(interest)}</strong></div>
      <div class="import-note">Estimation linéaire à taux constant — ne remplace pas le calcul exact de votre banque (intérêts précomptés/composés selon l'établissement).</div>
    `;
  }
  [rateInput, depositInput, withdrawInput].forEach(el => el.addEventListener("input", compute));
  compute();
}

function renderHoldingsSection(account) {
  if (!account.holdings || !account.holdings.length) {
    return `<div class="panel" style="margin-bottom:14px;">${emptyStateHtml({
      icon: "▤", title: "Aucun support importé",
      desc: "Importez un relevé de positions (CSV/Excel) pour voir le détail des supports de ce compte.",
    })}</div>`;
  }
  const total = account.holdings.reduce((s, h) => s + (h.amount || 0), 0);
  return `
    <div class="grid-2">
      <div class="panel">
        <div class="panel-header"><h2>Composition</h2></div>
        <div class="chart-wrap chart-wrap-small"><canvas id="chartHoldingsComposition"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2>Évolution du support sélectionné</h2></div>
        <div class="field" style="margin-bottom:10px;">
          <select id="holdingSelector">
            ${account.holdings.map((h, i) => `<option value="${i}">${escapeHtml(h.name)}</option>`).join("")}
          </select>
        </div>
        <div class="chart-wrap chart-wrap-small"><canvas id="chartHoldingEvolution"></canvas></div>
      </div>
    </div>
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-header"><h2>Détail des supports (${account.holdings.length})</h2></div>
      <div class="import-note" style="margin-bottom:10px;">
        Cours et +/-values proviennent uniquement de vos imports successifs — pas de connexion à un flux de marché en temps réel pour l'instant.
        ${account.contractNumber ? ` Contrat n°${escapeHtml(account.contractNumber)}.` : ""}
      </div>
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Support</th><th>ISIN</th><th>Catégorie</th><th class="num">Poids</th><th class="num">Montant</th><th class="num">+/- value</th></tr></thead>
          <tbody>
            ${account.holdings.map(h => `
              <tr>
                <td class="truncate-cell"><span class="truncate" title="${escapeHtml(h.name)}">${escapeHtml(h.name)}</span></td>
                <td>${escapeHtml(h.isin || "—")}</td>
                <td>${escapeHtml(h.category || "—")}</td>
                <td class="num">${total ? Math.round((h.amount || 0) / total * 1000) / 10 : 0}%</td>
                <td class="num">${formatMoneyPrecise(h.amount)}</td>
                <td class="num ${h.pnl > 0 ? "amount-pos" : h.pnl < 0 ? "amount-neg" : ""}">${h.pnl !== undefined && h.pnl !== null ? formatMoneyPrecise(h.pnl) : "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="import-note">Dernière mise à jour : ${account.holdings[0]?.quoteDate ? formatDate(account.holdings[0].quoteDate) : "—"}.</div>
    </div>
  `;
}

function wireHoldingsSection(account) {
  const total = account.holdings.reduce((s, h) => s + (h.amount || 0), 0);
  const byCategory = {};
  account.holdings.forEach(h => { byCategory[h.category || "Autre"] = (byCategory[h.category || "Autre"] || 0) + (h.amount || 0); });
  const palette = ["#6c8cff", "#3ecf8e", "#f2b84b", "#f2637a", "#a06cff", "#4bc8f2", "#f28c4b"];
  destroyChart("holdingsComposition");
  const compCtx = document.getElementById("chartHoldingsComposition");
  if (compCtx) {
    charts.holdingsComposition = new Chart(compCtx, {
      type: "doughnut",
      data: { labels: Object.keys(byCategory), datasets: [{ data: Object.values(byCategory), backgroundColor: palette, borderColor: chartBg(), borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: chartText(), boxWidth: 10, padding: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: c => `${c.label}: ${formatMoney(c.parsed)} (${Math.round(c.parsed / total * 1000) / 10}%)` } },
        },
      },
    });
  }

  const selector = document.getElementById("holdingSelector");
  function renderHoldingEvolution() {
    const idx = Number(selector.value);
    const holding = account.holdings[idx];
    destroyChart("holdingEvolution");
    const evoCtx = document.getElementById("chartHoldingEvolution");
    const snapshots = (account.holdingsHistory || [])
      .map(snap => ({ date: snap.date, entry: (snap.holdings || []).find(h => h.isin && h.isin === holding.isin) }))
      .filter(s => s.entry);
    setChartEmpty("chartHoldingEvolution", snapshots.length < 2, "🧾", "Réimportez un relevé de supports plus tard pour voir l'évolution de cette ligne.");
    if (snapshots.length < 2) return;
    charts.holdingEvolution = new Chart(evoCtx, {
      type: "line",
      data: {
        labels: snapshots.map(s => formatDate(s.date)),
        datasets: [{
          data: snapshots.map(s => s.entry.amount),
          borderColor: "#3ecf8e", backgroundColor: "rgba(62,207,142,0.12)",
          fill: true, tension: 0.42, cubicInterpolationMode: "monotone",
          borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => formatMoney(c.parsed.y) } } },
        scales: {
          x: { ticks: { color: chartText() }, grid: { display: false } },
          y: { ticks: { color: chartText(), callback: v => formatMoney(v) }, grid: { color: chartGrid() } },
        },
      },
    });
  }
  selector?.addEventListener("change", renderHoldingEvolution);
  renderHoldingEvolution();
}

/* ---------- Categories ---------- */

document.getElementById("btnAddCategory").addEventListener("click", () => openCategoryModal());

function openCategoryModal(existing) {
  const isEdit = !!existing;
  openModal(`
    <h3>${isEdit ? "Modifier la catégorie" : "Nouvelle catégorie"}</h3>
    <div class="field">
      <label>Nom</label>
      <input type="text" id="f-name" value="${existing ? escapeHtml(existing.name) : ""}" />
    </div>
    <div class="field">
      <label>Couleur</label>
      <input type="color" id="f-color" value="${existing ? existing.color : "#6c8cff"}" />
    </div>
    <div class="field">
      <label>Mots-clés (séparés par des virgules, utilisés pour la catégorisation auto)</label>
      <textarea id="f-keywords">${existing ? existing.keywords.join(", ") : ""}</textarea>
    </div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="f-delete">Supprimer</button>` : ""}
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">${isEdit ? "Enregistrer" : "Créer"}</button>
    </div>
  `, m => {
    m.querySelector("#f-cancel").onclick = closeModal;
    if (isEdit) {
      m.querySelector("#f-delete").onclick = () => {
        if (confirm("Supprimer cette catégorie ? Les dépenses associées passeront en \"Autre\".")) {
          state.transactions.forEach(t => { if (t.category === existing.id) t.category = "autre"; });
          state.categories = state.categories.filter(c => c.id !== existing.id);
          saveState(); closeModal(); renderAll();
        }
      };
    }
    const nameInput = m.querySelector("#f-name");
    nameInput.addEventListener("input", () => clearFieldError(nameInput));
    m.querySelector("#f-save").onclick = async (ev) => {
      clearAllFieldErrors(m);
      const name = nameInput.value.trim();
      const color = m.querySelector("#f-color").value;
      const keywords = m.querySelector("#f-keywords").value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      if (!name) { setFieldError(nameInput, "Merci de donner un nom."); nameInput.focus(); return; }
      await submitWithFeedback(ev.currentTarget, () => {
        if (isEdit) {
          existing.name = name; existing.color = color; existing.keywords = keywords;
        } else {
          state.categories.push({ id: uid(), name, color, keywords });
        }
        saveState();
      }, isEdit ? "Catégorie mise à jour." : "Catégorie créée.");
      closeModal(); renderAll();
      if (isEdit && keywords.length) offerRetroactiveRecategorization(existing, keywords);
    };
  });
}

function offerRetroactiveRecategorization(category, newKeywords) {
  const low = s => s.toLowerCase();
  const matches = state.transactions.filter(t =>
    t.category !== category.id && newKeywords.some(k => low(t.label).includes(k))
  );
  if (!matches.length) return;
  openModal(`
    <h3>Recatégoriser des dépenses existantes ?</h3>
    <p class="subtitle" style="margin-bottom:14px;">
      <strong>${matches.length} dépense(s)</strong> correspondent maintenant aux mots-clés ajoutés à « ${escapeHtml(category.name)} »
      (ex : « ${escapeHtml(matches[0].label)} »).
    </p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="f-skip">Non merci</button>
      <button class="btn btn-primary" id="f-apply">Recatégoriser ${matches.length} dépense(s)</button>
    </div>
  `, m => {
    m.querySelector("#f-skip").onclick = closeModal;
    m.querySelector("#f-apply").onclick = () => {
      matches.forEach(t => { t.category = category.id; });
      saveState(); closeModal(); renderAll();
      toast(`${matches.length} dépense(s) recatégorisée(s) en « ${category.name} ».`, "success");
    };
  });
}

function renderCategories() {
  const body = document.getElementById("categoriesBody");
  body.innerHTML = state.categories.map(c => `
    <tr data-id="${c.id}">
      <td><div class="swatch" style="background:${c.color}"></div></td>
      <td>${escapeHtml(c.name)}</td>
      <td><div class="kw-tags">${c.keywords.length ? c.keywords.map(k => `<span class="kw-tag">${escapeHtml(k)}</span>`).join("") : '<span class="kw-tag">—</span>'}</div></td>
      <td class="row-actions"><button class="c-edit">✎</button></td>
    </tr>
  `).join("");
  body.querySelectorAll("tr").forEach(row => {
    const cat = categoryById(row.dataset.id);
    row.querySelector(".c-edit").addEventListener("click", () => openCategoryModal(cat));
  });
}

/* ---------- Expenses ---------- */

document.getElementById("btnAddExpense").addEventListener("click", () => openExpenseModal());

function openExpenseModal(existing) {
  const isEdit = !!existing;
  openModal(`
    <h3>${isEdit ? "Modifier la dépense" : "Ajouter une dépense"}</h3>
    <div class="field">
      <label>Date</label>
      <input type="date" id="f-date" value="${existing ? existing.date : new Date().toISOString().slice(0,10)}" />
    </div>
    <div class="field">
      <label>Libellé</label>
      <input type="text" id="f-label" value="${existing ? escapeHtml(existing.label) : ""}" placeholder="Ex : Courses Carrefour" />
    </div>
    <div class="field">
      <label>Montant (€) — négatif pour une dépense, positif pour un revenu</label>
      <input type="number" step="0.01" id="f-amount" value="${existing ? existing.amount : ""}" placeholder="-42.50" />
    </div>
    <div class="field">
      <label>Catégorie</label>
      <select id="f-category">
        ${state.categories.map(c => `<option value="${c.id}" ${existing?.category === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
      </select>
    </div>
    <div class="field">
      <label>Compte</label>
      <select id="f-account">
        <option value="">—</option>
        ${state.accounts.map(a => `<option value="${a.id}" ${existing?.accountId === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("")}
      </select>
    </div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="f-delete">Supprimer</button>` : ""}
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">${isEdit ? "Enregistrer" : "Ajouter"}</button>
    </div>
  `, m => {
    m.querySelector("#f-cancel").onclick = closeModal;
    if (isEdit) {
      m.querySelector("#f-delete").onclick = () => {
        state.transactions = state.transactions.filter(t => t.id !== existing.id);
        saveState(); closeModal(); renderAll();
      };
    }
    const dateInput = m.querySelector("#f-date");
    const labelInput = m.querySelector("#f-label");
    const amountInput = m.querySelector("#f-amount");
    [dateInput, labelInput, amountInput].forEach(el => el.addEventListener("input", () => clearFieldError(el)));
    m.querySelector("#f-save").onclick = async (ev) => {
      clearAllFieldErrors(m);
      const date = dateInput.value;
      const label = labelInput.value.trim();
      const amount = parseFloat(amountInput.value);
      const category = m.querySelector("#f-category").value;
      const accountId = m.querySelector("#f-account").value || null;
      let hasError = false;
      if (!date) { setFieldError(dateInput, "Date requise."); hasError = true; }
      if (!label) { setFieldError(labelInput, "Libellé requis."); hasError = true; }
      if (isNaN(amount)) { setFieldError(amountInput, "Montant invalide."); hasError = true; }
      if (hasError) return;
      await submitWithFeedback(ev.currentTarget, () => {
        if (isEdit) {
          Object.assign(existing, { date, label, amount, category, accountId });
        } else {
          state.transactions.push({ id: uid(), date, label, amount, category, accountId });
        }
        saveState();
      }, isEdit ? "Dépense mise à jour." : "Dépense ajoutée.");
      closeModal(); renderAll();
    };
  });
}

function guessCategory(label) {
  const low = label.toLowerCase();
  for (const c of state.categories) {
    if (c.keywords.some(k => k && low.includes(k))) return c.id;
  }
  return "autre";
}

const LABEL_NOISE_PATTERNS = [
  /paiement\s*(par)?\s*carte\s*x?\d*/gi,
  /\bcb\b/gi,
  /\bvir(t)?\b/gi,
  /\bprlv\b/gi,
  /\b\d{1,2}[\/.]\d{1,2}([\/.]\d{2,4})?\b/g,
  /\bx\d{2,}\b/gi,
  /\b\d{4,}\b/g,
  /\b(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\b/gi,
  /\ben votre faveur\b/gi,
  /\bde la part de\b/gi,
];

function extractMerchantKey(label) {
  let s = (label || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  LABEL_NOISE_PATTERNS.forEach(p => { s = s.replace(p, " "); });
  s = s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const words = s.split(" ").filter(w => w.length > 1);
  return words.slice(0, 2).join(" ");
}

function findSimilarTransactions(transaction, excludeCategoryId) {
  const key = extractMerchantKey(transaction.label);
  if (!key) return [];
  return state.transactions.filter(t =>
    t.id !== transaction.id && t.category !== excludeCategoryId && extractMerchantKey(t.label) === key
  );
}

/* ---------- Gamified categorization ---------- */

let gamifyStreak = 0;
let gamifyStartTotal = 0;
let gamifySkipped = new Set();

function updateGamifyBanner() {
  const banner = document.getElementById("gamifyBanner");
  const count = state.transactions.filter(t => t.category === "autre").length;
  banner.hidden = count === 0;
  document.getElementById("gamifyBannerCount").textContent = count;
}

document.getElementById("btnOpenGamify").addEventListener("click", () => openGamifyMode());

function openGamifyMode() {
  gamifyStreak = 0;
  gamifySkipped = new Set();
  gamifyStartTotal = state.transactions.filter(t => t.category === "autre").length;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === "expenses"));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-gamify"));
  renderGamifyCard();
}

function closeGamifyMode() {
  setView("expenses");
}

function nextGamifyTransaction() {
  return state.transactions.find(t => t.category === "autre" && !gamifySkipped.has(t.id));
}

function renderGamifyCard() {
  const root = document.getElementById("gamifyRoot");
  const remaining = state.transactions.filter(t => t.category === "autre" && !gamifySkipped.has(t.id)).length;
  const progress = gamifyStartTotal ? Math.round(((gamifyStartTotal - remaining) / gamifyStartTotal) * 100) : 100;
  const transaction = nextGamifyTransaction();

  if (!transaction) {
    root.innerHTML = `
      <div class="gamify-wrap">
        <div class="gamify-done">
          <div class="gd-emoji">🎉</div>
          <h2>Toutes les dépenses sont classées !</h2>
          <p>${gamifyStartTotal} dépense(s) triée(s) cette session${gamifyStreak > 1 ? ` — série de ${gamifyStreak} d'affilée` : ""}.</p>
          <button class="btn btn-primary" id="gamifyBackToExpenses">Retour aux dépenses</button>
        </div>
      </div>
    `;
    root.querySelector("#gamifyBackToExpenses").addEventListener("click", closeGamifyMode);
    return;
  }

  const a = transaction.accountId ? accountById(transaction.accountId) : null;
  root.innerHTML = `
    <div class="gamify-wrap">
      <div class="gamify-topbar">
        <span class="gamify-streak">${gamifyStreak > 0 ? `🔥 ${gamifyStreak}` : ""}</span>
        <div class="gamify-progress-bar"><div class="gamify-progress-fill" style="width:${progress}%"></div></div>
        <button class="gamify-exit" id="gamifyExit">Quitter ✕</button>
      </div>
      <div class="gamify-card">
        <div class="gamify-card-date">${formatDate(transaction.date)}</div>
        <div class="gamify-card-label">${escapeHtml(transaction.label)}</div>
        <div class="gamify-card-amount ${transaction.amount < 0 ? "amount-neg" : "amount-pos"}">${formatMoneyPrecise(transaction.amount)}</div>
        ${a ? `<div class="gamify-card-account">${escapeHtml(a.name)}</div>` : ""}
        <div class="gamify-cat-grid">
          ${state.categories.filter(c => c.id !== "autre").map(c => `
            <button class="gamify-cat-btn" data-cat="${c.id}">
              <span class="gc-dot" style="background:${c.color}"></span>${escapeHtml(c.name)}
            </button>
          `).join("")}
        </div>
        <button class="btn btn-ghost btn-sm gamify-skip" id="gamifySkip">Passer cette dépense →</button>
      </div>
    </div>
  `;
  root.querySelector("#gamifyExit").addEventListener("click", closeGamifyMode);
  root.querySelector("#gamifySkip").addEventListener("click", () => {
    gamifySkipped.add(transaction.id);
    gamifyStreak = 0;
    renderGamifyCard();
  });
  root.querySelectorAll(".gamify-cat-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const newCategoryId = btn.dataset.cat;
      const newCategory = categoryById(newCategoryId);
      const similar = findSimilarTransactions(transaction, newCategoryId);
      const key = extractMerchantKey(transaction.label);
      transaction.category = newCategoryId;
      let count = 1;
      if (similar.length) { similar.forEach(t => { t.category = newCategoryId; count++; }); }
      if (key && !newCategory.keywords.some(k => key.includes(k) || k.includes(key))) newCategory.keywords.push(key);
      gamifyStreak++;
      saveState();
      toast(count > 1 ? `+${count} dépenses classées en « ${newCategory.name} ».` : `Classée en « ${newCategory.name} ».`, "success");
      renderGamifyCard();
      updateGamifyBanner();
    });
  });
}

function populateExpenseFilters() {
  const months = [...new Set(state.transactions.map(t => monthKey(t.date)))].sort().reverse();
  const monthSel = document.getElementById("filterMonth");
  const prevMonth = monthSel.value;
  monthSel.innerHTML = `<option value="">Tous les mois</option>` + months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join("");
  if (months.includes(prevMonth)) monthSel.value = prevMonth;

  const catSel = document.getElementById("filterCategory");
  const prevCat = catSel.value;
  catSel.innerHTML = `<option value="">Toutes catégories</option>` + state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  if (prevCat) catSel.value = prevCat;

  const accSel = document.getElementById("filterAccount");
  const prevAcc = accSel.value;
  accSel.innerHTML = `<option value="">Tous comptes</option>` + state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  if (prevAcc) accSel.value = prevAcc;
}

["filterMonth", "filterCategory", "filterAccount", "filterSearch", "filterInternal"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => { expensesPage = 1; renderExpenses(); });
});

const INTERNAL_TRANSFER_PATTERNS = [
  "epargne programmee", "epargne programmée", "virement interne",
  "virement depuis", "virement vers", "vir depuis", "vir vers", "vir inst vers", "vir inst depuis",
];

function looksLikeInternalTransfer(label) {
  const low = normalizeHeader(label || "");
  return INTERNAL_TRANSFER_PATTERNS.some(p => low.includes(normalizeHeader(p)));
}

document.getElementById("btnDetectInternal").addEventListener("click", () => {
  const candidates = state.transactions.filter(t => !t.internal && looksLikeInternalTransfer(t.label));
  if (!candidates.length) { toast("Aucun mouvement interne détecté parmi les dépenses non marquées.", "success"); return; }
  openModal(`
    <h3>Mouvements internes détectés</h3>
    <p class="subtitle" style="margin-bottom:14px;">
      <strong>${candidates.length} dépense(s)</strong> ressemblent à des virements entre vos propres comptes
      (ex : « ${escapeHtml(candidates[0].label)} »). Les marquer comme mouvements internes les exclura des totaux de dépenses sans les supprimer.
    </p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="f-skip">Annuler</button>
      <button class="btn btn-primary" id="f-apply">Marquer ${candidates.length} dépense(s)</button>
    </div>
  `, m => {
    m.querySelector("#f-skip").onclick = closeModal;
    m.querySelector("#f-apply").onclick = () => {
      candidates.forEach(t => { t.internal = true; });
      saveState(); closeModal(); renderAll();
      toast(`${candidates.length} dépense(s) marquée(s) comme mouvement interne.`, "success");
    };
  });
});

let expensesSort = { key: "date", dir: "desc" };
let expensesPage = 1;
const EXPENSES_PAGE_SIZE = 20;
let expensesSelection = new Set();
let openRowMenu = null;

document.querySelectorAll("#expensesTable th.sortable").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (expensesSort.key === key) expensesSort.dir = expensesSort.dir === "asc" ? "desc" : "asc";
    else expensesSort = { key, dir: "asc" };
    expensesPage = 1;
    renderExpenses();
  });
});

document.getElementById("selectAllExpenses").addEventListener("change", (e) => {
  const rows = document.querySelectorAll("#expensesBody tr[data-id]");
  rows.forEach(row => {
    if (e.target.checked) expensesSelection.add(row.dataset.id);
    else expensesSelection.delete(row.dataset.id);
  });
  renderExpenses();
});

document.getElementById("bulkClear").addEventListener("click", () => { expensesSelection.clear(); renderExpenses(); });
document.getElementById("bulkDelete").addEventListener("click", () => {
  if (!expensesSelection.size) return;
  if (!confirm(`Supprimer ${expensesSelection.size} dépense(s) ? Cette action est irréversible.`)) return;
  state.transactions = state.transactions.filter(t => !expensesSelection.has(t.id));
  const count = expensesSelection.size;
  expensesSelection.clear();
  saveState(); renderAll();
  toast(`${count} dépense(s) supprimée(s).`, "success");
});
document.getElementById("bulkMarkInternal").addEventListener("click", () => {
  if (!expensesSelection.size) return;
  const count = expensesSelection.size;
  state.transactions.forEach(t => { if (expensesSelection.has(t.id)) t.internal = true; });
  expensesSelection.clear();
  saveState(); renderAll();
  toast(`${count} dépense(s) marquée(s) comme mouvement interne.`, "success");
});
document.getElementById("bulkSetAccount").addEventListener("click", () => {
  if (!expensesSelection.size) return;
  openModal(`
    <h3>Associer à un compte (${expensesSelection.size} dépense(s))</h3>
    <div class="field">
      <label>Compte</label>
      <select id="f-bulk-account">
        <option value="">— Aucun —</option>
        ${state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-confirm">Appliquer</button>
    </div>
  `, m => {
    m.querySelector("#f-cancel").onclick = closeModal;
    m.querySelector("#f-confirm").onclick = async (ev) => {
      const accountId = m.querySelector("#f-bulk-account").value || null;
      await submitWithFeedback(ev.currentTarget, () => {
        state.transactions.forEach(t => { if (expensesSelection.has(t.id)) t.accountId = accountId; });
        saveState();
      }, "Compte mis à jour.");
      expensesSelection.clear();
      closeModal(); renderAll();
    };
  });
});
document.getElementById("bulkRecategorize").addEventListener("click", () => {
  if (!expensesSelection.size) return;
  openModal(`
    <h3>Changer la catégorie (${expensesSelection.size} dépense(s))</h3>
    <div class="field">
      <label>Nouvelle catégorie</label>
      <select id="f-bulk-category">${state.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-confirm">Appliquer</button>
    </div>
  `, m => {
    m.querySelector("#f-cancel").onclick = closeModal;
    m.querySelector("#f-confirm").onclick = async (ev) => {
      const category = m.querySelector("#f-bulk-category").value;
      await submitWithFeedback(ev.currentTarget, () => {
        state.transactions.forEach(t => { if (expensesSelection.has(t.id)) t.category = category; });
        saveState();
      }, "Catégorie mise à jour.");
      expensesSelection.clear();
      closeModal(); renderAll();
    };
  });
});

function closeRowMenu() {
  if (openRowMenu) { openRowMenu.classList.remove("show"); openRowMenu = null; }
}
let openCatPicker = null;
function closeCategoryPicker() {
  if (openCatPicker) { openCatPicker.innerHTML = ""; openCatPicker.classList.remove("show"); openCatPicker = null; }
}
document.addEventListener("click", (e) => {
  if (openRowMenu && !e.target.closest(".row-actions")) closeRowMenu();
  if (openCatPicker && !e.target.closest(".cat-cell")) closeCategoryPicker();
});

function toggleCategoryPicker(row, transaction) {
  const picker = row.querySelector(".cat-picker");
  const willOpen = openCatPicker !== picker;
  closeCategoryPicker();
  closeRowMenu();
  if (!willOpen) return;
  picker.innerHTML = state.categories.map(c => `
    <button data-cat="${c.id}" class="${c.id === transaction.category ? "active" : ""}">
      <span class="cat-dot" style="background:${c.color}"></span>${escapeHtml(c.name)}
    </button>
  `).join("");
  picker.classList.add("show");
  openCatPicker = picker;
  picker.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      closeCategoryPicker();
      reassignTransactionCategory(transaction, btn.dataset.cat);
    });
  });
}

function reassignTransactionCategory(transaction, newCategoryId) {
  const oldCategoryId = transaction.category;
  if (newCategoryId === oldCategoryId) return;
  const newCategory = categoryById(newCategoryId);
  const similar = findSimilarTransactions(transaction, newCategoryId);
  const key = extractMerchantKey(transaction.label);
  const alreadyKeyword = key && newCategory.keywords.some(k => key.includes(k) || k.includes(key));

  transaction.category = newCategoryId;

  if (!similar.length && (alreadyKeyword || !key)) {
    saveState(); renderAll();
    toast(`Dépense classée dans « ${newCategory.name} ».`, "success");
    return;
  }

  openModal(`
    <h3>Catégoriser « ${escapeHtml(newCategory.name)} »</h3>
    <p class="subtitle" style="margin-bottom:14px;">« ${escapeHtml(transaction.label)} » a été classée dans <strong>${escapeHtml(newCategory.name)}</strong>. On peut aller plus loin :</p>
    ${similar.length ? `
      <label class="field" style="display:flex;align-items:flex-start;gap:10px;">
        <input type="checkbox" id="f-apply-similar" checked style="width:auto;margin-top:3px;" />
        <span>Catégoriser aussi <strong>${similar.length} dépense(s) similaire(s)</strong> vers « ${escapeHtml(newCategory.name)} » (ex : « ${escapeHtml(similar[0].label)} »)</span>
      </label>
    ` : ""}
    ${key && !alreadyKeyword ? `
      <label class="field" style="display:flex;align-items:flex-start;gap:10px;">
        <input type="checkbox" id="f-add-keyword" checked style="width:auto;margin-top:3px;" />
        <span>Ajouter « ${escapeHtml(key)} » comme mot-clé de « ${escapeHtml(newCategory.name)} » pour catégoriser automatiquement les prochains imports</span>
      </label>
    ` : ""}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="f-skip">Non merci</button>
      <button class="btn btn-primary" id="f-apply">Appliquer</button>
    </div>
  `, m => {
    m.querySelector("#f-skip").onclick = () => { saveState(); closeModal(); renderAll(); toast(`Dépense classée dans « ${newCategory.name} ».`, "success"); };
    m.querySelector("#f-apply").onclick = () => {
      let count = 0;
      if (m.querySelector("#f-apply-similar")?.checked) {
        similar.forEach(t => { t.category = newCategoryId; count++; });
      }
      if (m.querySelector("#f-add-keyword")?.checked) {
        newCategory.keywords.push(key);
      }
      saveState(); closeModal(); renderAll();
      toast(count ? `${count + 1} dépense(s) classées dans « ${newCategory.name} ».` : `Dépense classée dans « ${newCategory.name} ».`, "success");
    };
  });
}

function getSortedFilteredExpenses() {
  const month = document.getElementById("filterMonth").value;
  const cat = document.getElementById("filterCategory").value;
  const acc = document.getElementById("filterAccount").value;
  const search = document.getElementById("filterSearch").value.trim().toLowerCase();
  const internalFilter = document.getElementById("filterInternal").value;

  let list = [...state.transactions];
  if (month) list = list.filter(t => monthKey(t.date) === month);
  if (cat) list = list.filter(t => t.category === cat);
  if (acc) list = list.filter(t => t.accountId === acc);
  if (search) list = list.filter(t => t.label.toLowerCase().includes(search));
  if (internalFilter === "hide") list = list.filter(t => !t.internal);
  if (internalFilter === "only") list = list.filter(t => t.internal);

  const dir = expensesSort.dir === "asc" ? 1 : -1;
  const valueFor = (t, key) => {
    if (key === "category") return categoryById(t.category).name.toLowerCase();
    if (key === "account") return t.accountId ? accountById(t.accountId)?.name.toLowerCase() || "" : "";
    if (key === "label") return t.label.toLowerCase();
    if (key === "amount") return t.amount;
    return t.date;
  };
  list.sort((a, b) => {
    const va = valueFor(a, expensesSort.key), vb = valueFor(b, expensesSort.key);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
  return list;
}

function renderExpenses() {
  closeRowMenu();
  document.querySelectorAll("#expensesTable th.sortable").forEach(th => {
    th.classList.toggle("sort-asc", th.dataset.sort === expensesSort.key && expensesSort.dir === "asc");
    th.classList.toggle("sort-desc", th.dataset.sort === expensesSort.key && expensesSort.dir === "desc");
  });

  const list = getSortedFilteredExpenses();
  const totalPages = Math.max(1, Math.ceil(list.length / EXPENSES_PAGE_SIZE));
  expensesPage = Math.min(expensesPage, totalPages);
  const pageList = list.slice((expensesPage - 1) * EXPENSES_PAGE_SIZE, expensesPage * EXPENSES_PAGE_SIZE);

  const body = document.getElementById("expensesBody");
  const emptyEl = document.getElementById("expensesEmpty");
  const table = document.getElementById("expensesTable");
  emptyEl.hidden = list.length !== 0;
  table.hidden = list.length === 0;
  if (!list.length) {
    const hasAnyTransactions = state.transactions.length > 0;
    emptyEl.innerHTML = emptyStateHtml(hasAnyTransactions ? {
      icon: "🔍", title: "Aucun résultat",
      desc: "Aucune dépense ne correspond à ces filtres. Essayez d'élargir votre recherche.",
    } : {
      icon: "▾", title: "Aucune dépense pour l'instant",
      desc: "Importez un extrait de compte (CSV/Excel) ou ajoutez une dépense manuellement pour commencer.",
      actionId: "esAddExpense", actionLabel: "+ Ajouter manuellement",
    });
    if (!hasAnyTransactions) emptyEl.querySelector("#esAddExpense").addEventListener("click", () => openExpenseModal());
  }

  body.innerHTML = pageList.map(t => {
    const c = categoryById(t.category);
    const a = t.accountId ? accountById(t.accountId) : null;
    const checked = expensesSelection.has(t.id);
    return `
      <tr data-id="${t.id}" class="${checked ? "row-selected" : ""} ${t.internal ? "row-internal" : ""}">
        <td class="chk-col"><input type="checkbox" class="row-chk" ${checked ? "checked" : ""} aria-label="Sélectionner cette dépense" /></td>
        <td>${formatDate(t.date)}</td>
        <td class="truncate-cell">
          <span class="truncate" title="${escapeHtml(t.label)}">${escapeHtml(t.label)}</span>
          ${t.internal ? `<span class="internal-badge" title="Mouvement interne entre vos comptes — exclu des totaux de dépenses">⇄ Interne</span>` : ""}
        </td>
        <td class="cat-cell" style="position:relative;">
          <button class="cat-pill cat-pill-btn" title="Changer la catégorie">
            <span class="cat-dot" style="background:${c.color}"></span>${escapeHtml(c.name)} <span class="cat-pill-caret">▾</span>
          </button>
          <div class="cat-picker"></div>
        </td>
        <td class="truncate-cell">${a ? `<span class="truncate" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>` : "—"}</td>
        <td class="num ${t.internal ? "" : (t.amount < 0 ? "amount-neg" : "amount-pos")}">${formatMoneyPrecise(t.amount)}</td>
        <td class="row-actions">
          <button class="t-menu-btn" title="Actions">⋮</button>
          <div class="row-menu">
            <button class="t-edit">✎ Modifier</button>
            <button class="t-toggle-internal">${t.internal ? "↩ Retirer le marquage interne" : "⇄ Marquer comme mouvement interne"}</button>
            <button class="t-duplicate">⧉ Dupliquer</button>
            <button class="t-delete danger">🗑 Supprimer</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll("tr[data-id]").forEach(row => {
    const t = state.transactions.find(x => x.id === row.dataset.id);
    row.querySelector(".row-chk").addEventListener("change", (e) => {
      if (e.target.checked) expensesSelection.add(t.id); else expensesSelection.delete(t.id);
      renderExpenses();
    });
    row.querySelector(".cat-pill-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleCategoryPicker(row, t); });
    row.querySelector(".t-edit").addEventListener("click", () => { closeRowMenu(); openExpenseModal(t); });
    row.querySelector(".t-toggle-internal").addEventListener("click", () => {
      closeRowMenu();
      t.internal = !t.internal;
      saveState(); renderAll();
      toast(t.internal ? "Marquée comme mouvement interne." : "Marquage interne retiré.", "success");
    });
    row.querySelector(".t-duplicate").addEventListener("click", () => {
      closeRowMenu();
      state.transactions.push({ ...t, id: uid() });
      saveState(); renderAll();
      toast("Dépense dupliquée.", "success");
    });
    row.querySelector(".t-delete").addEventListener("click", () => {
      closeRowMenu();
      if (!confirm("Supprimer cette dépense ?")) return;
      state.transactions = state.transactions.filter(x => x.id !== t.id);
      expensesSelection.delete(t.id);
      saveState(); renderAll();
      toast("Dépense supprimée.", "success");
    });
    const menuBtn = row.querySelector(".t-menu-btn");
    const menu = row.querySelector(".row-menu");
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = openRowMenu !== menu;
      closeRowMenu();
      if (willOpen) { menu.classList.add("show"); openRowMenu = menu; }
    });
  });

  document.getElementById("selectAllExpenses").checked = pageList.length > 0 && pageList.every(t => expensesSelection.has(t.id));

  const bulkToolbar = document.getElementById("bulkToolbar");
  bulkToolbar.classList.toggle("show", expensesSelection.size > 0);
  document.getElementById("bulkCount").textContent = expensesSelection.size;

  renderExpensesPagination(list.length, totalPages);
  updateGamifyBanner();
}

function renderExpensesPagination(total, totalPages) {
  const el = document.getElementById("expensesPagination");
  if (!total) { el.innerHTML = ""; return; }
  const start = (expensesPage - 1) * EXPENSES_PAGE_SIZE + 1;
  const end = Math.min(expensesPage * EXPENSES_PAGE_SIZE, total);
  let pageBtns = "";
  let lastWasEllipsis = false;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - expensesPage) <= 1) {
      pageBtns += `<button data-page="${p}" class="${p === expensesPage ? "active" : ""}">${p}</button>`;
      lastWasEllipsis = false;
    } else if (!lastWasEllipsis) {
      pageBtns += `<span style="padding:0 2px;color:var(--text-faint)">…</span>`;
      lastWasEllipsis = true;
    }
  }
  el.innerHTML = `
    <div class="pg-info">${start}–${end} sur ${total}</div>
    <div class="pg-controls">
      <button id="pgPrev" ${expensesPage === 1 ? "disabled" : ""} title="Page précédente">‹</button>
      ${pageBtns}
      <button id="pgNext" ${expensesPage === totalPages ? "disabled" : ""} title="Page suivante">›</button>
    </div>
  `;
  el.querySelector("#pgPrev").addEventListener("click", () => { expensesPage--; renderExpenses(); });
  el.querySelector("#pgNext").addEventListener("click", () => { expensesPage++; renderExpenses(); });
  el.querySelectorAll("button[data-page]").forEach(b => b.addEventListener("click", () => { expensesPage = Number(b.dataset.page); renderExpenses(); }));
}

/* ---------- Import (CSV / Excel) ---------- */

document.getElementById("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await handleImportedFile(file, "expenses");
  e.target.value = "";
});

function parseImportFile(file) {
  return new Promise((resolve, reject) => {
    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
    if (isCsv) {
      reader.onload = () => {
        try { resolve(parseCsv(reader.result)); } catch (e) { reject(e); }
      };
      reader.readAsText(file, "utf-8");
    } else {
      reader.onload = () => {
        try {
          if (typeof XLSX === "undefined") throw new Error("Le lecteur Excel n'a pas pu être chargé (connexion internet requise pour ce format). Essayez d'exporter en CSV.");
          const wb = XLSX.read(reader.result, { type: "array", cellDates: true });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: "yyyy-mm-dd" });
          resolve(rows);
        } catch (e) { reject(e); }
      };
      reader.readAsArrayBuffer(file);
    }
  });
}

function parseCsv(text) {
  const delim = (text.split("\n")[0].split(";").length > text.split("\n")[0].split(",").length) ? ";" : ",";
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  return lines.map(line => {
    const cells = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delim && !inQuotes) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

const DATE_HEADERS = ["date", "date operation", "date opération", "date valeur", "date comptable"];
const LABEL_HEADERS = ["libelle", "libellé", "label", "description", "operation", "opération", "détail", "detail", "libellé operation"];
const AMOUNT_HEADERS = ["montant", "amount", "valeur"];
const DEBIT_HEADERS = ["debit", "débit"];
const CREDIT_HEADERS = ["credit", "crédit"];

function normalizeHeader(h) {
  return (h || "").toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function detectColumns(headerRow) {
  const norm = headerRow.map(normalizeHeader);
  const find = (candidates) => norm.findIndex(h => candidates.some(c => h === normalizeHeader(c) || h.includes(normalizeHeader(c))));
  return {
    date: find(DATE_HEADERS),
    label: find(LABEL_HEADERS),
    amount: find(AMOUNT_HEADERS),
    debit: find(DEBIT_HEADERS),
    credit: find(CREDIT_HEADERS),
    accountNum: find(OPERATIONS_HEADERS.accountNum),
    accountLabel: find(OPERATIONS_HEADERS.accountLabel),
  };
}

// Tente de retrouver le compte source d'un fichier importé (dépenses ou opérations)
// à partir des colonnes accountNum/accountLabel présentes dans les exports bancaires
// façon Budget Insight (BoursoBank, Crédit Agricole…). Retourne l'id du compte ou null.
function matchAccountFromFileColumns(accountNum, accountLabel) {
  if (accountNum) {
    const byNum = state.accounts.find(a => a.bankAccountNum && a.bankAccountNum === accountNum);
    if (byNum) return byNum;
  }
  if (accountLabel) {
    const normLabel = normalizeHeader(accountLabel);
    const byName = state.accounts.find(a => {
      const n = normalizeHeader(a.name);
      return n === normLabel || normLabel.includes(n) || n.includes(normLabel);
    });
    if (byName) return byName;
    const ALIASES = [
      { tokens: ["developpement durable", "ldds"], match: a => normalizeHeader(a.name).includes("ldds") || normalizeHeader(a.name).includes("developpement durable") },
      { tokens: ["livret a"], match: a => normalizeHeader(a.name) === "livret a" || normalizeHeader(a.name).includes("livret a") },
      { tokens: ["compte courant", "compte de depot"], match: a => a.type === "courant" },
    ];
    for (const alias of ALIASES) {
      if (alias.tokens.some(t => normLabel.includes(normalizeHeader(t)))) {
        const found = state.accounts.find(alias.match);
        if (found) return found;
      }
    }
  }
  return null;
}

// Export "opérations" façon Crédit Agricole / banques en ligne : historique brut
// des mouvements d'un compte, avec le solde après chaque opération.
const OPERATIONS_HEADERS = {
  date: ["dateop", "date operation", "date opération"],
  label: ["label", "libelle"],
  amount: ["amount", "montant"],
  balance: ["accountbalance", "solde"],
  accountNum: ["accountnum", "numero de compte", "n de compte"],
  accountLabel: ["accountlabel", "libelle du compte"],
};

function detectOperationsColumns(headerRow) {
  const norm = headerRow.map(normalizeHeader);
  const find = (candidates) => norm.findIndex(h => candidates.some(c => h === normalizeHeader(c) || h.includes(normalizeHeader(c))));
  const cols = {};
  Object.entries(OPERATIONS_HEADERS).forEach(([key, candidates]) => { cols[key] = find(candidates); });
  return cols;
}

function parseAmount(str) {
  if (str === undefined || str === null || str === "") return NaN;
  let s = String(str).trim().replace(/[€\s]/g, "");
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  return parseFloat(s);
}

function parseDateCell(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

// Détecte si un fichier importé (quel que soit le bouton utilisé) est un relevé de
// dépenses ou un relevé de supports/placements, pour pouvoir rediriger l'utilisateur
// vers le bon onglet plutôt que d'échouer silencieusement.
function detectFileKind(headerRow) {
  const norm = headerRow.map(normalizeHeader);
  const matches = candidates => norm.some(h => candidates.some(c => h === normalizeHeader(c) || h.includes(normalizeHeader(c))));
  if (matches(OPERATIONS_HEADERS.balance) && matches(OPERATIONS_HEADERS.date)) return "operations";
  if (matches(["isin"]) || (matches(HOLDINGS_HEADERS.name) && matches(HOLDINGS_HEADERS.amount))) return "holdings";
  if (matches(LABEL_HEADERS) && (matches(AMOUNT_HEADERS) || matches(DEBIT_HEADERS) || matches(CREDIT_HEADERS))) return "expenses";
  return null;
}

async function handleImportedFile(file, expectedKind, accountIdHint) {
  openModal(`<div class="import-loading"><span class="spinner"></span> Lecture de « ${escapeHtml(file.name)} »…</div>`);
  let rows;
  try {
    rows = await parseImportFile(file);
  } catch (err) {
    console.error(err);
    closeModal();
    toast("Impossible de lire ce fichier : " + err.message, "error");
    return;
  }
  if (!rows.length) { closeModal(); toast("Fichier vide.", "error"); return; }
  const kind = detectFileKind(rows[0]);
  if (!kind) {
    closeModal();
    toast("Format de fichier non reconnu : ce n'est ni un relevé de dépenses, ni un relevé de supports/placements, ni un historique d'opérations.", "error");
    return;
  }
  const KIND_META = {
    holdings: { view: "accounts", label: "Comptes & placements", desc: "un relevé de supports/placements" },
    operations: { view: "accounts", label: "Comptes & placements", desc: "un historique d'opérations de compte" },
    expenses: { view: "expenses", label: "Dépenses", desc: "un relevé de dépenses" },
  };
  if (kind !== expectedKind) {
    const meta = KIND_META[kind];
    toast(`Ce fichier ressemble à ${meta.desc} → redirection vers l'onglet ${meta.label}.`);
    document.querySelector(`[data-view="${meta.view}"]`).click();
  }
  if (kind === "holdings") showHoldingsImportPreview(rows, accountIdHint);
  else if (kind === "operations") showOperationsImportPreview(rows, accountIdHint);
  else showImportPreview(rows);
}

let pendingImportRows = [];

function showImportPreview(rows) {
  if (!rows.length) { closeModal(); toast("Fichier vide.", "error"); return; }
  const headerRow = rows[0];
  const cols = detectColumns(headerRow);
  const dataRows = rows.slice(1);

  const parsed = dataRows.map(r => {
    const date = cols.date >= 0 ? parseDateCell(r[cols.date]) : null;
    const label = cols.label >= 0 ? String(r[cols.label] || "").trim() : "";
    let amount = NaN;
    if (cols.amount >= 0) amount = parseAmount(r[cols.amount]);
    else if (cols.debit >= 0 || cols.credit >= 0) {
      const debit = cols.debit >= 0 ? parseAmount(r[cols.debit]) : NaN;
      const credit = cols.credit >= 0 ? parseAmount(r[cols.credit]) : NaN;
      if (!isNaN(credit) && credit !== 0) amount = Math.abs(credit);
      else if (!isNaN(debit) && debit !== 0) amount = -Math.abs(debit);
    }
    return { date, label, amount, category: label ? guessCategory(label) : "autre", include: !!(date && label && !isNaN(amount)) };
  }).filter(r => r.date || r.label || !isNaN(r.amount));

  pendingImportRows = parsed;

  const fileAccountNum = cols.accountNum >= 0 ? String(dataRows[0]?.[cols.accountNum] || "").trim() : "";
  const fileAccountLabel = cols.accountLabel >= 0 ? String(dataRows[0]?.[cols.accountLabel] || "").trim() : "";
  const matchedAccount = matchAccountFromFileColumns(fileAccountNum, fileAccountLabel);

  const accountOptions = `<option value="">—</option>` + state.accounts.map(a => `<option value="${a.id}" ${matchedAccount?.id === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");
  const validCount = parsed.filter(r => r.include).length;

  openModal(`
    <h3>Aperçu de l'import (${parsed.length} lignes, ${validCount} valides)</h3>
    <div class="field">
      <label>Associer au compte</label>
      <select id="f-import-account">${accountOptions}</select>
      ${fileAccountLabel ? `<div class="import-note">Compte détecté dans le fichier : « ${escapeHtml(fileAccountLabel)} »${matchedAccount ? "" : " — aucun compte correspondant trouvé, sélectionnez-le manuellement."}</div>` : ""}
    </div>
    <div class="import-preview-table">
      <table class="table">
        <thead><tr><th></th><th>Date</th><th>Libellé</th><th class="num">Montant</th><th>Catégorie</th></tr></thead>
        <tbody>
          ${parsed.slice(0, 200).map((r, i) => `
            <tr>
              <td><input type="checkbox" data-idx="${i}" class="import-chk" ${r.include ? "checked" : ""} /></td>
              <td>${r.date ? formatDate(r.date) : '<span style="color:var(--red)">?</span>'}</td>
              <td>${escapeHtml(r.label) || '<span style="color:var(--red)">?</span>'}</td>
              <td class="num">${isNaN(r.amount) ? '<span style="color:var(--red)">?</span>' : formatMoneyPrecise(r.amount)}</td>
              <td>${categoryById(r.category).name}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${parsed.length > 200 ? `<div class="import-note">Aperçu limité aux 200 premières lignes ; toutes les lignes valides seront importées.</div>` : ""}
    <div class="import-note">Les lignes en rouge n'ont pas pu être détectées automatiquement et seront ignorées.</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-confirm">Importer ${validCount} dépense(s)</button>
    </div>
  `, m => {
    m.querySelector("#f-cancel").onclick = () => { pendingImportRows = []; closeModal(); };
    m.querySelectorAll(".import-chk").forEach(chk => {
      chk.addEventListener("change", () => { pendingImportRows[chk.dataset.idx].include = chk.checked; });
    });
    m.querySelector("#f-confirm").onclick = () => {
      const accountId = m.querySelector("#f-import-account").value || null;
      if (accountId && fileAccountNum) {
        const acc = accountById(accountId);
        if (acc && !acc.bankAccountNum) acc.bankAccountNum = fileAccountNum;
      }
      let count = 0;
      pendingImportRows.forEach(r => {
        if (!r.include || !r.date || !r.label || isNaN(r.amount)) return;
        state.transactions.push({ id: uid(), date: r.date, label: r.label, amount: r.amount, category: r.category, accountId, internal: looksLikeInternalTransfer(r.label) });
        count++;
      });
      pendingImportRows = [];
      saveState(); closeModal(); renderAll();
      toast(`${count} dépense(s) importée(s).`);
    };
  }, { large: true });
}

/* ---------- Import d'un relevé de supports (assurance-vie, PEA…) ---------- */

// Couvre à la fois les exports "tous comptes" façon Linxea (colonnes en français,
// avec Catégorie / N° Contrat / Produit) et les exports de positions façon BoursoBank
// (colonnes courtes, souvent en anglais, sans Catégorie ni regroupement par contrat).
const HOLDINGS_HEADERS = {
  placement: ["placement"],
  contract: ["n° contrat", "no contrat", "numero contrat", "n contrat"],
  product: ["produit"],
  category: ["categorie"],
  subcategory: ["sous-categorie", "sous categorie"],
  name: ["nom du support", "name"],
  isin: ["isin"],
  units: ["nbre de parts", "nombre de parts", "quantity", "quantite"],
  lastQuote: ["derniere cotation", "lastprice", "last price"],
  quoteDate: ["date"],
  amount: ["somme en compte", "amount"],
  pnl: ["plus ou moins value", "amountvariation", "amount variation"],
  pru: ["prix de revient moyen", "buyingprice", "buying price"],
};

function detectHoldingsColumns(headerRow) {
  const norm = headerRow.map(normalizeHeader);
  // Passe 1 : correspondance exacte (évite qu'un candidat court comme "amount"
  // matche par erreur une colonne "amountVariation"). Passe 2 : sous-chaîne, en repli.
  const find = (candidates) => {
    const normCandidates = candidates.map(normalizeHeader);
    let idx = norm.findIndex(h => normCandidates.includes(h));
    if (idx === -1) idx = norm.findIndex(h => normCandidates.some(c => h.includes(c)));
    return idx;
  };
  const cols = {};
  Object.entries(HOLDINGS_HEADERS).forEach(([key, candidates]) => { cols[key] = find(candidates); });
  return cols;
}

function riskBucketForCategory(category) {
  const key = normalizeHeader(category || "");
  return HOLDINGS_CATEGORY_RISK_MAP[key] || "croissance";
}

function riskSplitFromHoldings(holdings) {
  const total = holdings.reduce((s, h) => s + (h.amount || 0), 0);
  const split = { securise: 0, croissance: 0, performance: 0 };
  if (total <= 0) return split;
  holdings.forEach(h => { split[h.riskBucket || riskBucketForCategory(h.category)] += (h.amount || 0) / total * 100; });
  RISK_BUCKETS.forEach(b => { split[b.id] = Math.round(split[b.id] * 10) / 10; });
  // Correct rounding drift so the total is exactly 100.
  const drift = 100 - (split.securise + split.croissance + split.performance);
  split.croissance = Math.round((split.croissance + drift) * 10) / 10;
  return split;
}

document.getElementById("importHoldingsFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await handleImportedFile(file, "holdings");
  e.target.value = "";
});

let pendingHoldingsGroups = [];

function showHoldingsImportPreview(rows, accountIdHint) {
  if (rows.length < 2) { closeModal(); toast("Fichier vide ou format non reconnu.", "error"); return; }
  const headerRow = rows[0];
  const cols = detectHoldingsColumns(headerRow);
  if (cols.name < 0 || cols.amount < 0) {
    closeModal();
    toast("Ce fichier ne ressemble pas à un relevé de supports (colonnes \"Nom du support\" / \"Somme en Compte\" introuvables).", "error");
    return;
  }
  const dataRows = rows.slice(1).filter(r => r[cols.name]);
  const hasCategoryColumn = cols.category >= 0;

  const holdings = dataRows.map(r => {
    const category = hasCategoryColumn ? String(r[cols.category] || "").trim() : "";
    const name = String(r[cols.name] || "").trim();
    const riskBucket = category ? riskBucketForCategory(category) : guessRiskBucketFromName(name);
    return {
      placement: cols.placement >= 0 ? String(r[cols.placement] || "").trim() : "",
      contractNumber: cols.contract >= 0 ? String(r[cols.contract] || "").trim() : "",
      product: cols.product >= 0 ? String(r[cols.product] || "").trim() : "",
      category: category || `Non fourni — estimé "${RISK_BUCKETS.find(b => b.id === riskBucket).label}" d'après le nom`,
      categoryGuessed: !category,
      subcategory: cols.subcategory >= 0 ? String(r[cols.subcategory] || "").trim() : "",
      name,
      isin: cols.isin >= 0 ? String(r[cols.isin] || "").trim() : "",
      units: cols.units >= 0 ? parseAmount(r[cols.units]) : null,
      lastQuote: cols.lastQuote >= 0 ? parseAmount(r[cols.lastQuote]) : null,
      quoteDate: cols.quoteDate >= 0 ? parseDateCell(r[cols.quoteDate]) : null,
      amount: parseAmount(r[cols.amount]),
      pnl: cols.pnl >= 0 ? parseAmount(r[cols.pnl]) : null,
      pru: cols.pru >= 0 ? parseAmount(r[cols.pru]) : null,
      riskBucket,
    };
  }).filter(h => h.name && !isNaN(h.amount));

  // Sans colonne Contrat/Produit (ex : export de positions BoursoBank), le fichier
  // représente un seul portefeuille : tout regrouper au lieu d'une ligne par support.
  const hasGroupingInfo = holdings.some(h => h.contractNumber || h.product);
  const groupKey = h => (hasGroupingInfo ? (h.contractNumber || h.product || "__misc__") : "__single__");
  const groups = {};
  holdings.forEach(h => { (groups[groupKey(h)] = groups[groupKey(h)] || []).push(h); });

  pendingHoldingsGroups = Object.entries(groups).map(([key, hs]) => {
    const first = hs[0];
    const total = hs.reduce((s, h) => s + h.amount, 0);
    const guessedType = PLACEMENT_TO_ACCOUNT_TYPE[normalizeHeader(first.placement)]
      || (!hasGroupingInfo && state.accounts.filter(a => a.type === "pea").length ? "pea" : "autre");
    const matchingAccount = (accountIdHint && accountById(accountIdHint))
      || state.accounts.find(a => a.contractNumber && a.contractNumber === first.contractNumber)
      || (first.product && state.accounts.find(a => a.name.toLowerCase() === first.product.toLowerCase()))
      || (!hasGroupingInfo && state.accounts.filter(a => a.type === "pea").length === 1 ? state.accounts.find(a => a.type === "pea") : null);
    return { key, holdings: hs, total, type: guessedType, product: first.product, contractNumber: first.contractNumber, targetAccountId: matchingAccount ? matchingAccount.id : "" };
  });

  const anyGuessed = pendingHoldingsGroups.some(g => g.holdings.some(h => h.categoryGuessed));

  openModal(`
    <h3>Relevé de supports — ${pendingHoldingsGroups.length} portefeuille(s) détecté(s)</h3>
    ${pendingHoldingsGroups.map((g, gi) => `
      <div class="field" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <strong>${escapeHtml(g.product || (g.targetAccountId ? accountById(g.targetAccountId).name : "Portefeuille importé"))}</strong>
          <span>${formatMoneyPrecise(g.total)}</span>
        </div>
        <div class="import-note" style="margin-bottom:8px;">${g.holdings.length} support(s)${g.contractNumber ? ` · Contrat n°${escapeHtml(g.contractNumber)}` : ""}</div>
        <div class="import-preview-table" style="max-height:180px;margin-bottom:8px;">
          <table class="table">
            <thead><tr><th>Support</th><th>ISIN</th><th>Catégorie</th><th class="num">Montant</th></tr></thead>
            <tbody>
              ${g.holdings.map(h => `
                <tr>
                  <td>${escapeHtml(h.name)}</td>
                  <td>${escapeHtml(h.isin || "—")}</td>
                  <td${h.categoryGuessed ? ' style="color:var(--amber)"' : ""}>${escapeHtml(h.category)}</td>
                  <td class="num">${formatMoneyPrecise(h.amount)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <label>Voulez-vous créer un nouveau compte ou mettre à jour un compte existant ?</label>
        <select data-group="${gi}" class="f-holdings-target">
          <option value="__new__" ${!g.targetAccountId ? "selected" : ""}>+ Créer un nouveau compte</option>
          ${state.accounts.map(a => `<option value="${a.id}" ${g.targetAccountId === a.id ? "selected" : ""}>↻ Mettre à jour « ${escapeHtml(a.name)} » (solde actuel : ${formatMoneyPrecise(a.balance)})</option>`).join("")}
        </select>
      </div>
    `).join("")}
    <div class="import-note">La répartition Sécurisé/Croissance/Performance de chaque compte sera recalculée automatiquement à partir des catégories du relevé (Fonds Euro → Sécurisé, Fonds Actions → Croissance, Produit Structuré / Private Equity → Performance).${anyGuessed ? ' Les lignes en orange n\'avaient pas de catégorie dans le fichier : la poche ABC a été estimée à partir du nom du support — à vérifier.' : ""}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-confirm">Importer</button>
    </div>
  `, m => {
    m.querySelector("#f-cancel").onclick = () => { pendingHoldingsGroups = []; closeModal(); };
    m.querySelectorAll(".f-holdings-target").forEach(sel => {
      sel.addEventListener("change", () => { pendingHoldingsGroups[sel.dataset.group].targetAccountId = sel.value === "__new__" ? "" : sel.value; });
    });
    m.querySelector("#f-confirm").onclick = () => {
      const todayIso = new Date().toISOString().slice(0, 10);
      pendingHoldingsGroups.forEach(g => {
        const riskSplit = riskSplitFromHoldings(g.holdings);
        let account = g.targetAccountId ? accountById(g.targetAccountId) : null;
        if (!account) {
          account = {
            id: uid(), name: g.product || g.key, type: g.type, balance: 0,
            note: "", riskSplit: { securise: 0, croissance: 0, performance: 0 },
            contractNumber: g.contractNumber, holdings: [], history: [],
          };
          state.accounts.push(account);
        }
        account.contractNumber = g.contractNumber || account.contractNumber;
        account.holdings = g.holdings;
        account.riskSplit = riskSplit;
        account.holdingsHistory = account.holdingsHistory || [];
        account.holdingsHistory.push({ date: todayIso, holdings: g.holdings.map(h => ({ isin: h.isin, name: h.name, amount: h.amount, pnl: h.pnl })) });
        if (account.balance !== g.total) {
          account.balance = g.total;
          account.history.push({ date: todayIso, balance: g.total, source: "Import CSV" });
        }
      });
      pendingHoldingsGroups = [];
      saveState(); closeModal(); renderAll();
      toast("Relevé de supports importé.", "success");
      if (currentDetailAccountId) renderAccountDetail();
    };
  }, { large: true });
}

/* ---------- Import d'un historique d'opérations (relevé façon banque en ligne) ---------- */

const CASH_ACCOUNT_TYPES = ["courant", "livret", "compte_a_terme"];
let pendingOperations = null;

function operationSignature(op) {
  return `${op.date}|${op.label}|${op.amount}`;
}

function showOperationsImportPreview(rows, accountIdHint) {
  const headerRow = rows[0];
  const cols = detectOperationsColumns(headerRow);
  if (cols.date < 0 || cols.amount < 0) {
    closeModal();
    toast("Ce fichier ne ressemble pas à un historique d'opérations (colonnes date/montant introuvables).", "error");
    return;
  }
  const dataRows = rows.slice(1).filter(r => r[cols.date]);
  const operations = dataRows.map(r => ({
    date: parseDateCell(r[cols.date]),
    label: cols.label >= 0 ? String(r[cols.label] || "").trim() : "",
    amount: parseAmount(r[cols.amount]),
    balance: cols.balance >= 0 ? parseAmount(r[cols.balance]) : null,
  })).filter(o => o.date && !isNaN(o.amount))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!operations.length) {
    closeModal();
    toast("Aucune opération valide trouvée dans ce fichier.", "error");
    return;
  }

  const accountNum = cols.accountNum >= 0 ? String(dataRows[0]?.[cols.accountNum] || "").trim() : "";
  const accountLabel = cols.accountLabel >= 0 ? String(dataRows[0]?.[cols.accountLabel] || "").trim() : "";
  const matchingAccount = (accountIdHint && accountById(accountIdHint))
    || (accountNum && state.accounts.find(a => a.bankAccountNum && a.bankAccountNum === accountNum))
    || null;

  pendingOperations = { operations, accountNum, accountLabel, targetAccountId: matchingAccount ? matchingAccount.id : "" };

  const first = operations[0], last = operations[operations.length - 1];
  const cashAccounts = state.accounts.filter(a => CASH_ACCOUNT_TYPES.includes(a.type));

  openModal(`
    <h3>Historique d'opérations — ${operations.length} mouvement(s)</h3>
    <div class="import-note" style="margin-bottom:10px;">
      Du ${formatDate(first.date)} au ${formatDate(last.date)}${accountLabel ? ` · Compte source : « ${escapeHtml(accountLabel)} »` : ""}${last.balance !== null ? ` · Dernier solde connu : ${formatMoneyPrecise(last.balance)}` : ""}
    </div>
    <div class="field">
      <label>Voulez-vous créer un nouveau compte ou mettre à jour un compte existant ?</label>
      <select id="f-operations-target">
        <option value="__new__" ${!matchingAccount ? "selected" : ""}>+ Créer un nouveau compte</option>
        ${cashAccounts.map(a => `<option value="${a.id}" ${matchingAccount?.id === a.id ? "selected" : ""}>↻ Mettre à jour « ${escapeHtml(a.name)} » (solde actuel : ${formatMoneyPrecise(a.balance)})</option>`).join("")}
      </select>
    </div>
    <div class="import-preview-table">
      <table class="table">
        <thead><tr><th>Date</th><th>Libellé</th><th class="num">Montant</th><th class="num">Solde après</th></tr></thead>
        <tbody>
          ${[...operations].reverse().slice(0, 200).map(o => `
            <tr>
              <td>${formatDate(o.date)}</td>
              <td class="truncate-cell"><span class="truncate" title="${escapeHtml(o.label)}">${escapeHtml(o.label)}</span></td>
              <td class="num ${o.amount < 0 ? "amount-neg" : "amount-pos"}">${formatMoneyPrecise(o.amount)}</td>
              <td class="num">${o.balance !== null ? formatMoneyPrecise(o.balance) : "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${operations.length > 200 ? `<div class="import-note">Aperçu limité aux 200 mouvements les plus récents ; tous les mouvements valides seront importés.</div>` : ""}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-confirm">Importer</button>
    </div>
  `, m => {
    m.querySelector("#f-cancel").onclick = () => { pendingOperations = null; closeModal(); };
    m.querySelector("#f-confirm").onclick = () => {
      const targetId = m.querySelector("#f-operations-target").value;
      let account = targetId !== "__new__" ? accountById(targetId) : null;
      if (!account) {
        account = {
          id: uid(), name: accountLabel || "Compte importé", type: "livret", balance: 0,
          note: "", riskSplit: { securise: 100, croissance: 0, performance: 0 }, rate: 0,
          maturityDate: "", taxable: false, contractNumber: "", holdings: [], holdingsHistory: [],
          operations: [], history: [],
        };
        state.accounts.push(account);
      }
      account.operations = account.operations || [];
      if (accountNum) account.bankAccountNum = accountNum;
      const existingSigs = new Set(account.operations.map(operationSignature));
      const newlyAdded = [];
      operations.forEach(op => {
        const sig = operationSignature(op);
        if (!existingSigs.has(sig)) { account.operations.push(op); existingSigs.add(sig); newlyAdded.push(op); }
      });
      account.operations.sort((a, b) => a.date.localeCompare(b.date));
      const added = newlyAdded.length;

      // Reflète aussi ces mouvements dans l'onglet Dépenses (compte + catégorie taggés),
      // pour garder une vue unique — les virements internes sont pré-marqués comme tels.
      const existingTxSigs = new Set(
        state.transactions.filter(t => t.accountId === account.id).map(t => `${t.date}|${t.label}|${t.amount}`)
      );
      newlyAdded.forEach(op => {
        const sig = `${op.date}|${op.label}|${op.amount}`;
        if (existingTxSigs.has(sig)) return;
        state.transactions.push({
          id: uid(), date: op.date, label: op.label, amount: op.amount,
          category: guessCategory(op.label), accountId: account.id,
          internal: looksLikeInternalTransfer(op.label),
        });
        existingTxSigs.add(sig);
      });

      // Reconstruit l'historique de solde à partir des soldes post-opération du relevé :
      // une entrée par date (le solde de la dernière opération connue de ce jour-là).
      const byDate = {};
      account.operations.forEach(op => { if (op.balance !== null) byDate[op.date] = op.balance; });
      const rebuiltHistory = Object.entries(byDate)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, balance]) => ({ date, balance, source: "Import CSV (historique d'opérations)" }));
      if (rebuiltHistory.length) {
        const manualEntries = (account.history || []).filter(h => h.source !== "Import CSV (historique d'opérations)");
        account.history = [...rebuiltHistory, ...manualEntries].sort((a, b) => a.date.localeCompare(b.date));
        account.balance = account.history[account.history.length - 1].balance;
      }

      pendingOperations = null;
      saveState(); closeModal(); renderAll();
      toast(added ? `${added} nouvelle(s) opération(s) importée(s).` : "Aucune nouvelle opération (déjà à jour).", "success");
      if (currentDetailAccountId) renderAccountDetail();
    };
  }, { large: true });
}

/* ---------- Settings: export / import / reset ---------- */

document.getElementById("btnExportJson").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `patrimoine-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("importJson").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.accounts || !data.transactions || !data.categories) throw new Error("Format invalide");
      if (confirm("Remplacer toutes les données actuelles par cette sauvegarde ?")) {
        state = data;
        saveState(); renderAll();
        toast("Sauvegarde restaurée.", "success");
      }
    } catch (err) {
      toast("Fichier de sauvegarde invalide.", "error");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

function initTargetAllocationForm() {
  RISK_BUCKETS.forEach(b => {
    const input = document.getElementById(`target-${b.id}`);
    if (input) input.value = state.settings.targetAllocation[b.id];
  });
}
document.getElementById("btnSaveTargetAllocation")?.addEventListener("click", () => {
  const values = {};
  RISK_BUCKETS.forEach(b => { values[b.id] = parseFloat(document.getElementById(`target-${b.id}`).value) || 0; });
  const total = values.securise + values.croissance + values.performance;
  if (total !== 100) { toast("La cible doit totaliser 100%.", "error"); return; }
  state.settings.targetAllocation = values;
  saveState(); renderAll();
  toast("Allocation cible mise à jour.", "success");
});

document.getElementById("btnResetAll").addEventListener("click", () => {
  if (confirm("Cette action supprime définitivement toutes vos données locales. Continuer ?")) {
    if (confirm("Êtes-vous vraiment sûr ? Cette action est irréversible.")) {
      localStorage.removeItem(STORAGE_KEY);
      state = loadState();
      renderAll();
    }
  }
});

/* ---------- Dashboard & charts ---------- */

let charts = {};
function destroyChart(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function chartText() { return cssVar("--text-dim"); }
function chartGrid() { return cssVar("--border"); }
function chartBg() { return cssVar("--bg-elev"); }

function computeNetWorth() {
  return state.accounts.reduce((sum, a) => {
    const meta = accountTypeMeta(a.type);
    return sum + (meta.group === "Dettes" ? -a.balance : a.balance);
  }, 0);
}

function computeLiquid() {
  return state.accounts.filter(a => accountTypeMeta(a.type).group === "Liquidités").reduce((s, a) => s + a.balance, 0);
}
function computeInvested() {
  return state.accounts.filter(a => ["Placements", "Actifs réels"].includes(accountTypeMeta(a.type).group)).reduce((s, a) => s + a.balance, 0);
}

function renderKpis() {
  const netWorth = computeNetWorth();
  document.getElementById("kpiNetWorth").textContent = formatMoney(netWorth);
  document.getElementById("sidebarNetWorth").textContent = formatMoney(netWorth);
  document.getElementById("kpiLiquid").textContent = formatMoney(computeLiquid());
  document.getElementById("kpiInvested").textContent = formatMoney(computeInvested());

  const now = new Date();
  const curMonth = monthKey(now.toISOString());
  const curExpenses = state.transactions.filter(t => monthKey(t.date) === curMonth && t.amount < 0 && !t.internal).reduce((s, t) => s + t.amount, 0);
  document.getElementById("kpiExpenses").textContent = formatMoney(Math.abs(curExpenses));
  document.getElementById("kpiExpensesSub").textContent = monthLabel(curMonth);

  // net worth delta vs previous history point
  const allHistory = state.accounts.flatMap(a => a.history.map(h => ({ ...h, type: a.type })));
  const dates = [...new Set(allHistory.map(h => h.date))].sort();
  const delta = document.getElementById("kpiNetWorthDelta");
  if (dates.length >= 2) {
    const netAt = (date) => state.accounts.reduce((sum, a) => {
      const points = a.history.filter(h => h.date <= date);
      const bal = points.length ? points[points.length - 1].balance : 0;
      return sum + (accountTypeMeta(a.type).group === "Dettes" ? -bal : bal);
    }, 0);
    const first = netAt(dates[0]);
    const diff = netWorth - first;
    delta.textContent = `${diff >= 0 ? "+" : ""}${formatMoney(diff)} depuis le ${formatDate(dates[0])}`;
    delta.className = "kpi-delta " + (diff >= 0 ? "pos" : "neg");
  } else {
    delta.textContent = "Historique en construction";
    delta.className = "kpi-delta";
  }
}

function setChartEmpty(canvasId, empty, icon, text) {
  const canvas = document.getElementById(canvasId);
  const wrap = canvas.parentElement;
  canvas.style.visibility = empty ? "hidden" : "visible";
  let el = wrap.querySelector(".chart-empty");
  if (empty) {
    if (!el) {
      el = document.createElement("div");
      el.className = "chart-empty";
      wrap.appendChild(el);
    }
    el.innerHTML = `<div class="ce-icon">${icon}</div><div class="ce-text">${escapeHtml(text)}</div>`;
  } else if (el) {
    el.remove();
  }
}

function renderNetWorthChart() {
  const allDates = [...new Set(state.accounts.flatMap(a => a.history.map(h => h.date)))].sort();
  const ctx = document.getElementById("chartNetWorth");
  destroyChart("netWorth");
  setChartEmpty("chartNetWorth", !allDates.length, "📈", "L'historique apparaîtra ici au fil des mises à jour de vos comptes.");
  if (!allDates.length) return;
  const data = allDates.map(date => state.accounts.reduce((sum, a) => {
    const points = a.history.filter(h => h.date <= date);
    const bal = points.length ? points[points.length - 1].balance : 0;
    return sum + (accountTypeMeta(a.type).group === "Dettes" ? -bal : bal);
  }, 0));
  const gradient = ctx.getContext("2d").createLinearGradient(0, 0, 0, ctx.parentElement.clientHeight || 260);
  gradient.addColorStop(0, "rgba(108,140,255,0.22)");
  gradient.addColorStop(1, "rgba(108,140,255,0)");
  charts.netWorth = new Chart(ctx, {
    type: "line",
    data: {
      labels: allDates.map(formatDate),
      datasets: [{
        data, borderColor: "#6c8cff", backgroundColor: gradient,
        fill: true, tension: 0.42, cubicInterpolationMode: "monotone",
        borderWidth: 2.5, pointRadius: 0, pointHitRadius: 14,
        pointHoverRadius: 5, pointHoverBackgroundColor: "#6c8cff",
        pointHoverBorderColor: chartBg(), pointHoverBorderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => formatMoney(c.parsed.y) } },
      },
      scales: {
        x: { ticks: { color: chartText() }, grid: { display: false } },
        y: { ticks: { color: chartText(), callback: v => formatMoney(v) }, grid: { color: chartGrid() } },
      },
    },
  });
}

function renderAllocationChart() {
  const ctx = document.getElementById("chartAllocation");
  destroyChart("allocation");
  const positive = state.accounts.filter(a => accountTypeMeta(a.type).group !== "Dettes" && a.balance > 0);
  setChartEmpty("chartAllocation", !positive.length, "▤", "Ajoutez un compte pour voir la répartition par type.");
  if (!positive.length) return;
  const byType = {};
  positive.forEach(a => { const l = accountTypeMeta(a.type).label; byType[l] = (byType[l] || 0) + a.balance; });
  const palette = ["#6c8cff", "#3ecf8e", "#f2b84b", "#f2637a", "#a06cff", "#4bc8f2", "#f28c4b"];
  charts.allocation = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(byType),
      datasets: [{ data: Object.values(byType), backgroundColor: palette, borderColor: chartBg(), borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: chartText(), boxWidth: 10, padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.label}: ${formatMoney(c.parsed)}` } },
      },
    },
  });
}

function renderExpensesByCategoryChart() {
  const ctx = document.getElementById("chartExpensesByCategory");
  destroyChart("expCat");
  const now = new Date();
  const curMonth = monthKey(now.toISOString());
  const expenses = state.transactions.filter(t => monthKey(t.date) === curMonth && t.amount < 0 && !t.internal);
  setChartEmpty("chartExpensesByCategory", !expenses.length, "🧾", "Aucune dépense ce mois-ci pour l'instant.");
  if (!expenses.length) return;
  const byCat = {};
  expenses.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + Math.abs(t.amount); });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  charts.expCat = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: entries.map(([id]) => categoryById(id).name),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([id]) => categoryById(id).color), borderColor: chartBg(), borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: chartText(), boxWidth: 10, padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.label}: ${formatMoney(c.parsed)}` } },
      },
    },
  });
}

function renderMonthlyExpensesChart() {
  const ctx = document.getElementById("chartMonthlyExpenses");
  destroyChart("monthly");
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const data = months.map(m => Math.abs(state.transactions.filter(t => monthKey(t.date) === m && t.amount < 0 && !t.internal).reduce((s, t) => s + t.amount, 0)));
  charts.monthly = new Chart(ctx, {
    type: "bar",
    data: { labels: months.map(monthLabel), datasets: [{ data, backgroundColor: "#6c8cff", borderRadius: 6, maxBarThickness: 28 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => formatMoney(c.parsed.y) } } },
      scales: {
        x: { ticks: { color: chartText() }, grid: { display: false } },
        y: { ticks: { color: chartText(), callback: v => formatMoney(v) }, grid: { color: chartGrid() } },
      },
    },
  });
}

function computeRiskAllocation() {
  const totals = { securise: 0, croissance: 0, performance: 0 };
  let unclassified = 0;
  state.accounts.forEach(a => {
    if (accountTypeMeta(a.type).group === "Dettes") return;
    const split = a.riskSplit || { securise: 0, croissance: 0, performance: 0 };
    const sum = split.securise + split.croissance + split.performance;
    if (sum !== 100) { unclassified += a.balance; return; }
    RISK_BUCKETS.forEach(b => { totals[b.id] += a.balance * (split[b.id] / 100); });
  });
  return { totals, unclassified };
}

function renderRiskAllocationChart() {
  const ctx = document.getElementById("chartRiskAllocation");
  destroyChart("riskAllocation");
  const { totals, unclassified } = computeRiskAllocation();
  const classified = totals.securise + totals.croissance + totals.performance;
  const note = document.getElementById("riskAllocationNote");
  setChartEmpty("chartRiskAllocation", classified <= 0, "✦", "Classez vos comptes en Sécurisé/Croissance/Performance pour voir l'allocation ABC.");
  if (classified <= 0) {
    if (note) note.textContent = "Aucun compte classé dans une allocation ABC pour le moment.";
    return;
  }
  const target = state.settings.targetAllocation;
  const realValues = RISK_BUCKETS.map(b => Math.round((totals[b.id] / classified) * 1000) / 10);
  const targetValues = RISK_BUCKETS.map(b => target[b.id]);

  const barValueLabelPlugin = {
    id: "barValueLabel",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = "600 10px Inter, sans-serif";
      ctx.fillStyle = chartText();
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.85;
      chart.data.datasets.forEach((dataset, i) => {
        chart.getDatasetMeta(i).data.forEach((bar, index) => {
          const value = dataset.data[index];
          if (value == null) return;
          ctx.fillText(`${value}%`, bar.x, bar.y - 6);
        });
      });
      ctx.restore();
    },
  };

  charts.riskAllocation = new Chart(ctx, {
    type: "bar",
    plugins: [barValueLabelPlugin],
    data: {
      labels: RISK_BUCKETS.map(b => b.label),
      datasets: [
        {
          label: "Cible",
          data: targetValues,
          backgroundColor: "rgba(154,161,178,0.35)",
          borderRadius: 6, maxBarThickness: 26,
        },
        {
          label: "Réel",
          data: realValues,
          backgroundColor: RISK_BUCKETS.map(b => b.color),
          borderRadius: 6, maxBarThickness: 26,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 16 } },
      plugins: {
        legend: { position: "bottom", labels: { color: chartText(), boxWidth: 10, padding: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: c => `${c.dataset.label}: ${c.parsed.y}%`,
            afterLabel: c => {
              if (c.dataset.label !== "Réel") return "";
              const delta = Math.round((realValues[c.dataIndex] - targetValues[c.dataIndex]) * 10) / 10;
              if (delta === 0) return "Conforme à la cible";
              return `${delta > 0 ? "+" : ""}${delta} pt vs cible`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: chartText() }, grid: { display: false } },
        y: { ticks: { color: chartText(), callback: v => v + "%" }, grid: { color: chartGrid() }, suggestedMax: 100 },
      },
    },
  });
  if (note) {
    note.textContent = unclassified > 0
      ? `${formatMoney(unclassified)} non classés (hors calcul ci-dessus) — à répartir depuis la fiche du compte.`
      : "";
  }
}

function renderDashboard() {
  renderKpis();
  renderNetWorthChart();
  renderAllocationChart();
  renderRiskAllocationChart();
  renderExpensesByCategoryChart();
  renderMonthlyExpensesChart();
}

/* ---------- Misc ---------- */

let toastTimer = null;
function toast(message, type) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span>`;
  el.className = "toast show" + (type === "error" ? " toast-error" : type === "success" ? " toast-success" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), type === "error" ? 4500 : 3000);
}

function emptyStateHtml({ icon, title, desc, actionId, actionLabel }) {
  return `
    <div class="es-icon">${icon}</div>
    <div class="es-title">${escapeHtml(title)}</div>
    <div class="es-desc">${escapeHtml(desc)}</div>
    ${actionId ? `<button class="btn btn-primary" id="${actionId}">${escapeHtml(actionLabel)}</button>` : ""}
  `;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Budget : détection des flux récurrents ---------- */

const BUDGET_GROUPS = [
  { id: "revenus", label: "Revenus", color: "#3ecf8e" },
  { id: "logement", label: "Logement", color: "#6c8cff" },
  { id: "quotidien", label: "Vie quotidienne", color: "#f2b84b" },
  { id: "abonnements", label: "Abonnements", color: "#f2637a" },
  { id: "epargne", label: "Épargne & investissements", color: "#a06cff" },
  { id: "autre", label: "Autre", color: "#9aa1b2" },
];
function budgetGroupMeta(id) { return BUDGET_GROUPS.find(g => g.id === id) || BUDGET_GROUPS[BUDGET_GROUPS.length - 1]; }

const SUBSCRIPTION_KEYWORDS = [
  "netflix", "spotify", "disney", "canal", "amazon prime", "deezer", "apple",
  "free mobile", "orange", "sfr", "bouygues", "red by sfr", "sosh",
  "assurance", "mutuelle", "abonnement", "salle de sport", "fitness", "gym",
  "edf", "engie", "eau", "internet", "telephone", "téléphone", "presse", "journal",
];
const SAVINGS_KEYWORDS = ["epargne programmee", "epargne programmée", "vers pea", "vers livret", "virement vers", "investissement"];
const RENT_KEYWORDS = ["loyer", "rent"];
// Regroupements nommés pour les revenus : plus fiable qu'une détection par
// "commerçant récurrent", car le libellé d'un virement de salaire change souvent
// de mois en mois (date, référence…) alors que ces mots-clés restent stables.
const INCOME_PATTERNS = [
  { id: "salaire", label: "Salaire", keywords: ["salaire", " paie ", " paye "] },
  { id: "caf", label: "CAF", keywords: ["caf"] },
  { id: "famille", label: "Virements familiaux", keywords: ["parents", "papa", "maman", "famille"] },
  { id: "remboursement", label: "Remboursements", keywords: ["remboursement", "rembours"] },
  { id: "pension", label: "Pension / bourse", keywords: ["pension", "bourse etud"] },
];
// Catégories de dépenses "du quotidien" affichées agrégées par catégorie plutôt
// que dépense par dépense — c'est justement à ça que servent vos catégories.
const QUOTIDIEN_CATEGORY_IDS = ["alimentation", "transport", "restaurants", "loisirs", "sante"];

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Nettoie l'affichage d'un libellé bancaire brut (préfixes de paiement carte,
// "VIR" isolé…) sans le réduire à 2 mots comme extractMerchantKey — on veut
// ici un libellé lisible, pas une clé de regroupement.
const DISPLAY_NOISE_PATTERNS = [
  /paiement\s*(par)?\s*carte\s*x?\d*/gi,
  /\bprlv\b/gi,
];
function cleanLabelForDisplay(label) {
  let s = label || "";
  DISPLAY_NOISE_PATTERNS.forEach(p => { s = s.replace(p, " "); });
  s = s.replace(/\bvir\b/gi, "Virement").replace(/\s{2,}/g, " ").trim();
  return s || label;
}

// Regroupe les dépenses/revenus par "identité" de commerçant/libellé, puis ne garde
// que les groupes qui reviennent sur au moins 2 mois distincts avec un montant stable :
// c'est la signature d'un flux récurrent (loyer, abonnement…).
function detectRecurringCandidates() {
  const groups = {};
  state.transactions.forEach(t => {
    if (t.amount >= 0) return;
    const key = extractMerchantKey(t.label);
    if (!key) return;
    (groups[key] = groups[key] || []).push(t);
  });

  const candidates = [];
  Object.values(groups).forEach(txs => {
    const months = new Set(txs.map(t => monthKey(t.date)));
    if (months.size < 2) return;
    const amounts = txs.map(t => Math.abs(t.amount));
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const spreadPct = avg ? (Math.max(...amounts) - Math.min(...amounts)) / avg : 1;
    const days = txs.map(t => new Date(t.date).getDate());
    const daySpread = Math.max(...days) - Math.min(...days);
    const labelCounts = {};
    txs.forEach(t => { labelCounts[t.label] = (labelCounts[t.label] || 0) + 1; });
    const label = Object.entries(labelCounts).sort((a, b) => b[1] - a[1])[0][0];
    let confidence = "low";
    if (months.size >= 3 && spreadPct <= 0.2 && daySpread <= 6) confidence = "high";
    else if (months.size >= 2 && spreadPct <= 0.35) confidence = "medium";
    candidates.push({
      key: "merchant-" + extractMerchantKey(label),
      label: cleanLabelForDisplay(label), months: months.size, avgAmount: Math.round(median(amounts) * 100) / 100,
      spreadPct, daySpread, confidence, sampleIds: txs.map(t => t.id),
      anyInternal: txs.some(t => t.internal),
    });
  });
  return candidates.sort((a, b) => b.avgAmount - a.avgAmount);
}

// Seuls le loyer, les abonnements et l'épargne restent détectés poste par poste
// (peu nombreux, chacun a du sens pris isolément). Le reste des dépenses du
// quotidien est agrégé par catégorie (voir computeCategoryBudgetItems).
function classifyCandidateGroup(candidate) {
  const low = normalizeHeader(candidate.label);
  if (RENT_KEYWORDS.some(k => low.includes(k))) return "logement";
  if (candidate.anyInternal || SAVINGS_KEYWORDS.some(k => low.includes(k))) return "epargne";
  if (SUBSCRIPTION_KEYWORDS.some(k => low.includes(k))) return "abonnements";
  return null;
}

function computeIncomeBudgetItems() {
  const incomeTx = state.transactions.filter(t => t.amount > 0 && !t.internal);
  const used = new Set();
  const items = [];
  INCOME_PATTERNS.forEach(p => {
    const matches = incomeTx.filter(t => !used.has(t.id) && p.keywords.some(k => normalizeHeader(t.label).includes(normalizeHeader(k))));
    if (!matches.length) return;
    matches.forEach(t => used.add(t.id));
    const months = new Set(matches.map(t => monthKey(t.date)));
    const total = matches.reduce((s, t) => s + t.amount, 0);
    items.push({
      key: "income-" + p.id, label: p.label, avgAmount: Math.round((total / months.size) * 100) / 100,
      months: months.size, confidence: months.size >= 2 ? "high" : "medium", sampleIds: matches.map(t => t.id),
    });
  });
  const rest = incomeTx.filter(t => !used.has(t.id));
  if (rest.length) {
    const months = new Set(rest.map(t => monthKey(t.date)));
    const total = rest.reduce((s, t) => s + t.amount, 0);
    items.push({
      key: "income-autre", label: "Autres revenus", avgAmount: Math.round((total / months.size) * 100) / 100,
      months: months.size, confidence: months.size >= 2 ? "medium" : "low", sampleIds: rest.map(t => t.id),
    });
  }
  return items;
}

// Agrège les dépenses par catégorie existante (moyenne mensuelle réelle),
// en excluant les transactions déjà comptées ailleurs (loyer/abonnement/épargne
// détectés poste par poste) pour ne rien compter deux fois.
function computeCategoryBudgetItems(categoryIds, claimedIds) {
  const items = [];
  categoryIds.forEach(cid => {
    const txs = state.transactions.filter(t => t.category === cid && t.amount < 0 && !t.internal && !claimedIds.has(t.id));
    if (!txs.length) return;
    const months = new Set(txs.map(t => monthKey(t.date)));
    const total = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
    const cat = categoryById(cid);
    items.push({
      key: "category-" + cid, label: cat.name, avgAmount: Math.round((total / months.size) * 100) / 100,
      months: months.size, confidence: months.size >= 2 ? "high" : "medium",
      sampleIds: txs.map(t => t.id), categoryId: cid,
    });
  });
  return items;
}

let lastRecurringCandidates = [];
let selectedBudgetMonth = null;

function renderBudgetMonthSection() {
  const months = [...new Set(state.transactions.map(t => monthKey(t.date)))].sort().reverse();
  if (!months.length) return "";
  if (!selectedBudgetMonth || !months.includes(selectedBudgetMonth)) selectedBudgetMonth = months[0];

  const monthTx = state.transactions.filter(t => monthKey(t.date) === selectedBudgetMonth && !t.internal);
  const income = monthTx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = Math.abs(monthTx.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));

  return `
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-header">
        <h2>Vue mensuelle</h2>
        <select id="budgetMonthSelect">${months.map(m => `<option value="${m}" ${m === selectedBudgetMonth ? "selected" : ""}>${monthLabel(m)}</option>`).join("")}</select>
      </div>
      <div class="kpi-row" style="margin-bottom:14px;">
        <div class="kpi-card"><div class="kpi-label">Revenus réels</div><div class="kpi-value amount-pos">${formatMoney(income)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Dépenses réelles</div><div class="kpi-value amount-neg">${formatMoney(expense)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Solde du mois</div><div class="kpi-value ${income - expense >= 0 ? "amount-pos" : "amount-neg"}">${formatMoney(income - expense)}</div></div>
      </div>
      <div class="chart-wrap chart-wrap-small"><canvas id="chartBudgetMonth"></canvas></div>
    </div>
  `;
}

function wireBudgetMonthSection() {
  const select = document.getElementById("budgetMonthSelect");
  if (!select) return;
  select.addEventListener("change", () => { selectedBudgetMonth = select.value; renderBudget(); });

  const monthTx = state.transactions.filter(t => monthKey(t.date) === selectedBudgetMonth && !t.internal && t.amount < 0);
  destroyChart("budgetMonth");
  const ctx = document.getElementById("chartBudgetMonth");
  setChartEmpty("chartBudgetMonth", !monthTx.length, "🧾", "Aucune dépense ce mois-ci.");
  if (!monthTx.length) return;
  const byCat = {};
  monthTx.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + Math.abs(t.amount); });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  charts.budgetMonth = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: entries.map(([id]) => categoryById(id).name),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([id]) => categoryById(id).color), borderColor: chartBg(), borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: chartText(), boxWidth: 10, padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.label}: ${formatMoney(c.parsed)}` } },
      },
    },
  });
}
let budgetExpanded = new Set();

function runBudgetAnalysis() {
  const candidates = detectRecurringCandidates();
  lastRecurringCandidates = candidates;
  const existingByKey = {};
  state.budget.items.forEach(it => { if (it.source === "auto") existingByKey[it.key] = it; });

  const toItem = (c, type, group) => {
    const prior = existingByKey[c.key];
    return {
      id: prior?.id || uid(), key: c.key, label: c.label, amount: c.avgAmount, type, group: prior?.group || group,
      included: prior ? prior.included : (c.confidence !== "low"), source: "auto",
      confidence: c.confidence, months: c.months, categoryId: c.categoryId || null, sampleIds: c.sampleIds || [],
    };
  };

  const autoItems = [];
  const claimedIds = new Set();

  computeIncomeBudgetItems().forEach(c => autoItems.push(toItem(c, "income", "revenus")));

  candidates.forEach(c => {
    const group = classifyCandidateGroup(c);
    if (!group) return;
    c.sampleIds.forEach(id => claimedIds.add(id));
    autoItems.push(toItem(c, "expense", group));
  });

  computeCategoryBudgetItems(QUOTIDIEN_CATEGORY_IDS, claimedIds).forEach(c => autoItems.push(toItem(c, "expense", "quotidien")));
  computeCategoryBudgetItems(["autre"], claimedIds).forEach(c => autoItems.push(toItem(c, "expense", "autre")));

  const manualItems = state.budget.items.filter(it => it.source === "manual");
  state.budget.items = [...autoItems, ...manualItems];
  state.budget.analyzedAt = new Date().toISOString().slice(0, 10);
  saveState();
}

function budgetHasRent() {
  return state.budget.items.some(it => it.group === "logement" && it.type === "expense" && normalizeHeader(it.label).includes("loyer"));
}

function addManualBudgetItem(group, type, label, amount) {
  state.budget.items.push({
    id: uid(), key: "manual-" + uid(), label, amount, type, group,
    included: true, source: "manual", confidence: null, months: null,
  });
  saveState();
}

function confirmRentFromAmount(amount) {
  const match = lastRecurringCandidates.find(c =>
    !c.isIncome && classifyCandidateGroup(c) !== "epargne" &&
    Math.abs(c.avgAmount - amount) / amount <= 0.12
  );
  if (match) {
    openModal(`
      <h3>Confirmer votre loyer</h3>
      <p class="subtitle" style="margin-bottom:14px;">
        Une dépense récurrente « ${escapeHtml(match.label)} » à ${formatMoney(match.avgAmount)}/mois se rapproche du montant indiqué (${formatMoney(amount)}).
        Est-ce bien votre loyer ?
      </p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="f-no">Non, ajouter ${formatMoney(amount)} séparément</button>
        <button class="btn btn-primary" id="f-yes">Oui, c'est mon loyer</button>
      </div>
    `, m => {
      m.querySelector("#f-no").onclick = () => { addManualBudgetItem("logement", "expense", "Loyer", amount); closeModal(); renderBudget(); };
      m.querySelector("#f-yes").onclick = () => {
        const existing = state.budget.items.find(it => it.key === match.key);
        if (existing) { existing.group = "logement"; existing.included = true; }
        else {
          state.budget.items.push({
            id: uid(), key: match.key, label: match.label, amount: match.avgAmount, type: "expense",
            group: "logement", included: true, source: "auto", confidence: match.confidence, months: match.months,
          });
        }
        saveState(); closeModal(); renderBudget();
      };
    });
  } else {
    addManualBudgetItem("logement", "expense", "Loyer", amount);
    renderBudget();
  }
}

function ribbonPath(x0, y0top, y0bot, x1, y1top, y1bot) {
  const mx = (x0 + x1) / 2;
  return `M${x0},${y0top} C${mx},${y0top} ${mx},${y1top} ${x1},${y1top} L${x1},${y1bot} C${mx},${y1bot} ${mx},${y0bot} ${x0},${y0bot} Z`;
}

function truncateLabel(label, max) {
  return label.length > max ? label.slice(0, max - 1).trim() + "…" : label;
}

function buildBudgetSankey(incomeItems, groupNodes) {
  const totalIncome = incomeItems.reduce((s, it) => s + it.amount, 0);
  const totalExpense = groupNodes.reduce((s, g) => s + g.items.reduce((s2, it) => s2 + it.amount, 0), 0);
  const scaleBasis = Math.max(totalIncome, totalExpense, 1);
  const plotHeight = 420, plotTop = 18, itemGap = 10, groupGap = 22;
  const scale = plotHeight / scaleBasis;
  const nodeW = 12;
  const colX = [16, 230, 440, 650];
  const svgW = 980;

  let svg = "";
  let maxY = plotTop;

  // Colonne 0 : sources de revenus. Colonne 1 : nœud "Budget" unique.
  let cursorIncome = plotTop;
  const incomeSlices = incomeItems.map(it => {
    const h = Math.max(it.amount * scale, 16);
    const slice = { label: it.label, amount: it.amount, y0: cursorIncome, y1: cursorIncome + h };
    cursorIncome += h + itemGap;
    return slice;
  });
  maxY = Math.max(maxY, cursorIncome);
  const budgetH = Math.max(totalIncome * scale, 2);
  const budgetY0 = plotTop, budgetY1 = plotTop + budgetH;
  maxY = Math.max(maxY, budgetY1);

  incomeSlices.forEach(s => {
    svg += `<path d="${ribbonPath(colX[0] + nodeW, s.y0, s.y1, colX[1], s.y0, s.y1)}" fill="${budgetGroupMeta("revenus").color}" opacity="0.28"></path>`;
    svg += `<rect x="${colX[0]}" y="${s.y0}" width="${nodeW}" height="${s.y1 - s.y0}" rx="2" fill="${budgetGroupMeta("revenus").color}"></rect>`;
    svg += `<text x="${colX[0] - 8}" y="${(s.y0 + s.y1) / 2}" text-anchor="end" dominant-baseline="middle" class="sankey-label">${escapeHtml(truncateLabel(s.label, 26))} : ${formatMoney(s.amount)}</text>`;
  });
  svg += `<rect x="${colX[1]}" y="${budgetY0}" width="${nodeW}" height="${budgetH}" rx="2" fill="${chartText()}"></rect>`;
  svg += `<text x="${colX[1] + nodeW / 2}" y="${budgetY0 - 8}" text-anchor="middle" class="sankey-label sankey-label-strong">Budget : ${formatMoney(totalIncome)}</text>`;

  // Colonne 2 : groupes de dépenses. Colonne 3 : postes individuels.
  let cursorGroup = plotTop;
  groupNodes.forEach(g => {
    const groupTotal = g.items.reduce((s, it) => s + it.amount, 0);
    if (groupTotal <= 0) return;
    const gh = Math.max(groupTotal * scale, 2);
    const gy0 = cursorGroup, gy1 = cursorGroup + gh;
    svg += `<path d="${ribbonPath(colX[1] + nodeW, gy0, gy1, colX[2], gy0, gy1)}" fill="${g.color}" opacity="0.28"></path>`;
    svg += `<rect x="${colX[2]}" y="${gy0}" width="${nodeW}" height="${gh}" rx="2" fill="${g.color}"></rect>`;
    svg += `<text x="${colX[2] + nodeW + 8}" y="${gy0 - 8}" class="sankey-label sankey-label-strong">${escapeHtml(truncateLabel(g.label, 30))} : ${formatMoney(groupTotal)}</text>`;

    let cursorItem = gy0;
    g.items.forEach(it => {
      const ih = Math.max(it.amount * scale, 16);
      const iy0 = cursorItem, iy1 = cursorItem + ih;
      svg += `<path d="${ribbonPath(colX[2] + nodeW, iy0, iy1, colX[3], iy0, iy1)}" fill="${g.color}" opacity="0.22"></path>`;
      svg += `<rect x="${colX[3]}" y="${iy0}" width="${nodeW}" height="${ih}" rx="2" fill="${g.color}"></rect>`;
      svg += `<text x="${colX[3] + nodeW + 8}" y="${(iy0 + iy1) / 2}" dominant-baseline="middle" class="sankey-label">${escapeHtml(truncateLabel(it.label, 30))} : ${formatMoney(it.amount)}</text>`;
      cursorItem += ih + 6;
    });
    maxY = Math.max(maxY, cursorItem);
    cursorGroup += Math.max(gh, cursorItem - gy0) + groupGap;
  });
  maxY = Math.max(maxY, cursorGroup);

  const svgH = maxY + 20;
  return `<svg viewBox="0 0 ${svgW} ${svgH}" class="sankey-svg" preserveAspectRatio="xMinYMin meet">${svg}</svg>`;
}

// Pour la lisibilité du diagramme uniquement : au-delà de MAX_ITEMS lignes par
// nœud, les plus petites sont regroupées sous "Autres" (la liste détaillée en
// dessous, elle, continue d'afficher chaque ligne individuellement).
const SANKEY_MAX_ITEMS = 5;
function capForSankey(items, otherLabel) {
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  if (sorted.length <= SANKEY_MAX_ITEMS) return sorted;
  const head = sorted.slice(0, SANKEY_MAX_ITEMS - 1);
  const rest = sorted.slice(SANKEY_MAX_ITEMS - 1);
  const restTotal = rest.reduce((s, it) => s + it.amount, 0);
  return [...head, { label: `${otherLabel} (${rest.length})`, amount: restTotal }];
}

function renderBudgetSankeySection() {
  const included = state.budget.items.filter(it => it.included);
  const incomeItems = capForSankey(included.filter(it => it.type === "income"), "Autres revenus");
  const groupNodes = BUDGET_GROUPS.filter(g => g.id !== "revenus").map(g => ({
    ...g,
    items: capForSankey(included.filter(it => it.type === "expense" && it.group === g.id), "Autres"),
  })).filter(g => g.items.length);

  if (!incomeItems.length && !groupNodes.length) {
    return `<div class="panel" style="margin-bottom:14px;">${emptyStateHtml({
      icon: "↝", title: "Aucune donnée cochée",
      desc: "Cochez au moins un revenu ou une dépense récurrente ci-dessous pour voir le flux de votre budget.",
    })}</div>`;
  }
  return `
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-header"><h2>Flux du budget</h2></div>
      <div class="sankey-wrap">${buildBudgetSankey(incomeItems, groupNodes)}</div>
    </div>
  `;
}

function renderBudgetItemRow(it) {
  const conf = it.confidence === "high" ? "Récurrent confirmé" : it.confidence === "medium" ? "Récurrent probable" : it.confidence === "low" ? "Peu régulier" : "";
  const hasDetail = it.sampleIds && it.sampleIds.length > 0;
  const isExpanded = budgetExpanded.has(it.id);
  const detailTx = hasDetail ? it.sampleIds.map(id => state.transactions.find(t => t.id === id)).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date)) : [];
  return `
    <div class="budget-row-wrap">
      <div class="budget-row" data-id="${it.id}">
        <input type="checkbox" class="budget-chk" ${it.included ? "checked" : ""} />
        ${hasDetail ? `<button class="budget-expand" title="Voir le détail">${isExpanded ? "▾" : "▸"}</button>` : `<span class="budget-expand-spacer"></span>`}
        <span class="budget-row-label" title="${escapeHtml(it.label)}">${escapeHtml(it.label)}</span>
        ${it.source === "auto" ? `<span class="budget-badge" title="${it.months} mois observés">${conf}</span>` : `<span class="budget-badge budget-badge-manual">Manuel</span>`}
        <input type="number" step="0.01" class="budget-amount" value="${it.amount}" />
        <span class="budget-euro">€</span>
        ${it.source === "manual" ? `<button class="budget-delete" title="Supprimer">🗑</button>` : `<span class="budget-delete-spacer"></span>`}
      </div>
      ${isExpanded ? `
        <div class="budget-detail">
          ${detailTx.map(t => `
            <div class="budget-detail-row">
              <span class="budget-detail-date">${formatDate(t.date)}</span>
              <span class="budget-detail-label truncate" title="${escapeHtml(t.label)}">${escapeHtml(cleanLabelForDisplay(t.label))}</span>
              <span class="budget-detail-amount">${formatMoneyPrecise(t.amount)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderBudgetGroupCard(group) {
  const items = state.budget.items.filter(it => it.group === group.id && it.type === (group.id === "revenus" ? "income" : "expense"));
  const total = items.filter(it => it.included).reduce((s, it) => s + it.amount, 0);
  const showRentPrompt = group.id === "logement" && !budgetHasRent();
  return `
    <div class="panel budget-card" data-group="${group.id}">
      <div class="panel-header">
        <h2><span class="budget-group-dot" style="background:${group.color}"></span>${group.label}</h2>
        <strong>${formatMoney(total)}</strong>
      </div>
      ${showRentPrompt ? `
        <div class="rent-prompt">
          <span>Nous n'avons pas détecté votre loyer dans vos dépenses.</span>
          <input type="number" step="1" id="rentAmountInput" placeholder="Montant mensuel (€)" />
          <button class="btn btn-sm btn-primary" id="rentAmountConfirm">Valider</button>
        </div>
      ` : ""}
      ${items.length ? items.map(renderBudgetItemRow).join("") : `<div class="import-note">Rien de détecté pour l'instant dans cette catégorie.</div>`}
      <div class="budget-add-row">
        <button class="btn btn-ghost btn-sm budget-add-btn" data-group="${group.id}">+ Ajouter ${group.id === "revenus" ? "un revenu" : "une dépense"}</button>
      </div>
    </div>
  `;
}

function renderBudget() {
  const root = document.getElementById("budgetRoot");
  if (!state.budget.analyzedAt) {
    root.innerHTML = `<div class="panel">${emptyStateHtml({
      icon: "↝", title: "Analysons votre budget",
      desc: "On va parcourir votre historique de dépenses pour repérer ce qui revient chaque mois : loyer, abonnements, salaire… Rien n'est modifié, vous gardez la main sur ce qui est retenu.",
      actionId: "esAnalyzeBudget", actionLabel: "🔄 Analyser mes dépenses",
    })}</div>`;
    root.querySelector("#esAnalyzeBudget").addEventListener("click", () => { runBudgetAnalysis(); renderBudget(); });
    return;
  }

  const totalIncome = state.budget.items.filter(it => it.included && it.type === "income").reduce((s, it) => s + it.amount, 0);
  const totalExpense = state.budget.items.filter(it => it.included && it.type === "expense" && it.group !== "epargne").reduce((s, it) => s + it.amount, 0);
  const totalSavings = state.budget.items.filter(it => it.included && it.group === "epargne").reduce((s, it) => s + it.amount, 0);
  const reste = totalIncome - totalExpense - totalSavings;

  root.innerHTML = `
    <div class="import-note" style="margin-bottom:14px;">Dernière analyse : ${formatDate(state.budget.analyzedAt)}. Cochez ou décochez les lignes pour ajuster ce qui compte dans votre budget.</div>
    <div class="kpi-row">
      <div class="kpi-card"><div class="kpi-label">Revenus mensuels</div><div class="kpi-value">${formatMoney(totalIncome)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Dépenses récurrentes</div><div class="kpi-value">${formatMoney(totalExpense)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Épargne récurrente</div><div class="kpi-value">${formatMoney(totalSavings)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Reste à vivre estimé</div><div class="kpi-value ${reste >= 0 ? "amount-pos" : "amount-neg"}">${formatMoney(reste)}</div></div>
    </div>
    ${renderBudgetMonthSection()}
    ${renderBudgetSankeySection()}
    <div class="budget-cards-grid">
      ${BUDGET_GROUPS.map(renderBudgetGroupCard).join("")}
    </div>
  `;
  wireBudgetMonthSection();

  root.querySelectorAll(".budget-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      const row = chk.closest(".budget-row");
      const item = state.budget.items.find(it => it.id === row.dataset.id);
      item.included = chk.checked;
      saveState(); renderBudget();
    });
  });
  root.querySelectorAll(".budget-amount").forEach(inp => {
    inp.addEventListener("change", () => {
      const row = inp.closest(".budget-row");
      const item = state.budget.items.find(it => it.id === row.dataset.id);
      item.amount = parseFloat(inp.value) || 0;
      saveState(); renderBudget();
    });
  });
  root.querySelectorAll(".budget-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".budget-row");
      state.budget.items = state.budget.items.filter(it => it.id !== row.dataset.id);
      saveState(); renderBudget();
    });
  });
  root.querySelectorAll(".budget-expand").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".budget-row").dataset.id;
      if (budgetExpanded.has(id)) budgetExpanded.delete(id); else budgetExpanded.add(id);
      renderBudget();
    });
  });
  root.querySelectorAll(".budget-add-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const group = btn.dataset.group;
      const isIncome = group === "revenus";
      openModal(`
        <h3>${isIncome ? "Ajouter un revenu" : "Ajouter une dépense"}</h3>
        <div class="field"><label>Libellé</label><input type="text" id="f-label" placeholder="${isIncome ? "Ex : Freelance" : "Ex : Salle de sport"}" /></div>
        <div class="field"><label>Montant mensuel (€)</label><input type="number" step="0.01" id="f-amount" placeholder="0.00" /></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="f-cancel">Annuler</button>
          <button class="btn btn-primary" id="f-save">Ajouter</button>
        </div>
      `, m => {
        m.querySelector("#f-cancel").onclick = closeModal;
        m.querySelector("#f-save").onclick = () => {
          const label = m.querySelector("#f-label").value.trim();
          const amount = Math.abs(parseFloat(m.querySelector("#f-amount").value) || 0);
          if (!label || !amount) { toast("Merci de renseigner un libellé et un montant.", "error"); return; }
          addManualBudgetItem(group, isIncome ? "income" : "expense", label, amount);
          closeModal(); renderBudget();
        };
      });
    });
  });
  root.querySelector("#rentAmountConfirm")?.addEventListener("click", () => {
    const amount = parseFloat(document.getElementById("rentAmountInput").value);
    if (!amount || amount <= 0) { toast("Montant de loyer invalide.", "error"); return; }
    confirmRentFromAmount(amount);
  });
}

document.getElementById("btnAnalyzeBudget").addEventListener("click", () => { runBudgetAnalysis(); renderBudget(); toast("Analyse terminée.", "success"); });

function renderAll() {
  renderDashboard();
  renderAccounts();
  populateExpenseFilters();
  renderExpenses();
  renderCategories();
  initTargetAllocationForm();
  if (currentDetailAccountId && document.getElementById("view-account-detail")?.classList.contains("active")) {
    renderAccountDetail();
  }
  if (document.getElementById("view-budget")?.classList.contains("active")) {
    renderBudget();
  }
}

renderAll();

/* ---------- Données: dropzone centrale ---------- */

const dataDropzone = document.getElementById("dataDropzone");
const dataDropzoneInput = document.getElementById("dataDropzoneInput");
dataDropzone.addEventListener("click", () => dataDropzoneInput.click());
dataDropzone.addEventListener("keydown", (e) => { if (e.key === "Enter") dataDropzoneInput.click(); });
dataDropzoneInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleDroppedFile(file);
  e.target.value = "";
});
dataDropzone.addEventListener("dragover", (e) => { e.preventDefault(); dataDropzone.classList.add("drag-over"); });
dataDropzone.addEventListener("dragleave", () => dataDropzone.classList.remove("drag-over"));
dataDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dataDropzone.classList.remove("drag-over");
  const file = e.dataTransfer?.files?.[0];
  if (file) handleDroppedFile(file);
});

/* ---------- Glisser-déposer un fichier n'importe où sur la page ---------- */

async function handleDroppedFile(file) {
  openModal(`<div class="import-loading"><span class="spinner"></span> Lecture de « ${escapeHtml(file.name)} »…</div>`);
  let rows;
  try {
    rows = await parseImportFile(file);
  } catch (err) {
    console.error(err);
    closeModal();
    toast("Impossible de lire ce fichier : " + err.message, "error");
    return;
  }
  if (!rows.length) { closeModal(); toast("Fichier vide.", "error"); return; }
  const kind = detectFileKind(rows[0]);
  if (!kind) {
    closeModal();
    toast("Format de fichier non reconnu : ce n'est ni un relevé de dépenses, ni un relevé de supports/placements, ni un historique d'opérations.", "error");
    return;
  }
  document.querySelector(`[data-view="${kind === "expenses" ? "expenses" : "accounts"}"]`).click();
  if (kind === "holdings") showHoldingsImportPreview(rows);
  else if (kind === "operations") showOperationsImportPreview(rows);
  else showImportPreview(rows);
}

let dragDepth = 0;
document.addEventListener("dragover", e => { e.preventDefault(); });
document.addEventListener("dragenter", e => {
  if (!e.dataTransfer?.types?.includes("Files")) return;
  e.preventDefault();
  dragDepth++;
  document.body.classList.add("dragging-file");
});
document.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) document.body.classList.remove("dragging-file");
});
document.addEventListener("drop", e => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove("dragging-file");
  const file = e.dataTransfer?.files?.[0];
  if (file) handleDroppedFile(file);
});
