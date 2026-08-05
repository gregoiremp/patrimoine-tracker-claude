/* ---------- State & persistence ---------- */

const STORAGE_KEY = "financeTracker.v1";

const ACCOUNT_TYPES = [
  { id: "courant", label: "Compte courant", group: "Liquidités" },
  { id: "livret", label: "Livret / Épargne", group: "Liquidités" },
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
        note: "", riskSplit: { securise: 0, croissance: 0, performance: 0 }, contractNumber: "", holdings: [], ...a,
      }));
      return data;
    }
  } catch (e) { console.warn("state load failed", e); }
  return {
    accounts: [], transactions: [],
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c, keywords: [...c.keywords] })),
    settings: { targetAllocation: { ...DEFAULT_TARGET_ALLOCATION } },
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
      <label>Note (optionnel)</label>
      <textarea id="f-note" placeholder="Ex : échéance, taux, à ne pas renouveler…">${existing ? escapeHtml(existing.note || "") : ""}</textarea>
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
    m.querySelector("#f-save").onclick = () => {
      const name = m.querySelector("#f-name").value.trim();
      const type = m.querySelector("#f-type").value;
      const balance = parseFloat(m.querySelector("#f-balance").value) || 0;
      const note = m.querySelector("#f-note").value.trim();
      const riskSplit = {};
      RISK_BUCKETS.forEach(b => { riskSplit[b.id] = parseFloat(m.querySelector(`#f-risk-${b.id}`).value) || 0; });
      const riskTotal = riskSplit.securise + riskSplit.croissance + riskSplit.performance;
      if (!name) { alert("Merci de donner un nom au compte."); return; }
      if (riskTotal !== 0 && riskTotal !== 100) { alert("La répartition ABC doit totaliser 0% (non classé) ou 100%."); return; }
      if (isEdit) {
        existing.name = name; existing.type = type; existing.note = note; existing.riskSplit = riskSplit;
        if (existing.balance !== balance) {
          existing.balance = balance;
          existing.history.push({ date: new Date().toISOString().slice(0, 10), balance });
        }
      } else {
        state.accounts.push({
          id: uid(), name, type, balance, note, riskSplit,
          history: [{ date: new Date().toISOString().slice(0, 10), balance }],
        });
      }
      saveState(); closeModal(); renderAll();
    };
  });
}

function updateBalanceQuick(account) {
  const val = prompt(`Nouveau solde pour "${account.name}" (€) :`, account.balance);
  if (val === null) return;
  const n = parseFloat(val.replace(",", "."));
  if (isNaN(n)) { alert("Montant invalide."); return; }
  account.balance = n;
  account.history.push({ date: new Date().toISOString().slice(0, 10), balance: n });
  saveState(); renderAll();
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
    wrap.innerHTML = `<div class="empty-state">Aucun compte pour l'instant. Cliquez sur "+ Ajouter un compte" pour commencer.</div>`;
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
            <div class="account-card" data-id="${a.id}">
              <div class="a-actions">
                <button class="a-edit" title="Modifier">✎</button>
                <button class="a-balance" title="Mettre à jour le solde">↻</button>
              </div>
              <div class="a-type">${accountTypeMeta(a.type).label}</div>
              <div class="a-name">${escapeHtml(a.name)}</div>
              <div class="a-balance">${formatMoneyPrecise(a.balance)}</div>
              ${riskSplitBar(a.riskSplit)}
              ${a.note ? `<div class="a-note">${escapeHtml(a.note)}</div>` : ""}
              ${a.holdings && a.holdings.length ? `<button class="a-composition">▾ Composition (${a.holdings.length} supports)</button>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");

  wrap.querySelectorAll(".account-card").forEach(card => {
    const acc = accountById(card.dataset.id);
    card.querySelector(".a-edit").addEventListener("click", () => openAccountModal(acc));
    card.querySelector(".a-balance").addEventListener("click", () => updateBalanceQuick(acc));
    card.querySelector(".a-composition")?.addEventListener("click", () => openHoldingsModal(acc));
  });
}

function openHoldingsModal(account) {
  const total = account.holdings.reduce((s, h) => s + (h.amount || 0), 0);
  const byCategory = {};
  account.holdings.forEach(h => { byCategory[h.category || "Autre"] = (byCategory[h.category || "Autre"] || 0) + h.amount; });
  openModal(`
    <h3>Composition — ${escapeHtml(account.name)}</h3>
    <div class="import-note" style="margin-bottom:10px;">
      ${Object.entries(byCategory).map(([cat, amt]) => `${escapeHtml(cat)} : ${Math.round(amt / total * 1000) / 10}%`).join(" · ")}
      ${account.contractNumber ? ` · Contrat n°${escapeHtml(account.contractNumber)}` : ""}
    </div>
    <div class="import-preview-table">
      <table class="table">
        <thead><tr><th>Support</th><th>ISIN</th><th>Catégorie</th><th class="num">Montant</th><th class="num">+/- value</th></tr></thead>
        <tbody>
          ${account.holdings.map(h => `
            <tr>
              <td>${escapeHtml(h.name)}</td>
              <td>${escapeHtml(h.isin || "—")}</td>
              <td>${escapeHtml(h.category || "—")}</td>
              <td class="num">${formatMoneyPrecise(h.amount)}</td>
              <td class="num ${h.pnl > 0 ? "amount-pos" : h.pnl < 0 ? "amount-neg" : ""}">${h.pnl !== undefined && h.pnl !== null ? formatMoneyPrecise(h.pnl) : "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="import-note">Dernière mise à jour : ${account.holdings[0]?.quoteDate ? formatDate(account.holdings[0].quoteDate) : "—"}. Pour rafraîchir, réimportez un relevé de supports à jour depuis l'espace client de l'assureur/courtier (onglet Comptes).</div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="f-close">Fermer</button>
    </div>
  `, m => { m.querySelector("#f-close").onclick = closeModal; }, { large: true });
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
    m.querySelector("#f-save").onclick = () => {
      const name = m.querySelector("#f-name").value.trim();
      const color = m.querySelector("#f-color").value;
      const keywords = m.querySelector("#f-keywords").value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      if (!name) { alert("Merci de donner un nom."); return; }
      if (isEdit) {
        existing.name = name; existing.color = color; existing.keywords = keywords;
      } else {
        state.categories.push({ id: uid(), name, color, keywords });
      }
      saveState(); closeModal(); renderAll();
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
    m.querySelector("#f-save").onclick = () => {
      const date = m.querySelector("#f-date").value;
      const label = m.querySelector("#f-label").value.trim();
      const amount = parseFloat(m.querySelector("#f-amount").value);
      const category = m.querySelector("#f-category").value;
      const accountId = m.querySelector("#f-account").value || null;
      if (!date || !label || isNaN(amount)) { alert("Merci de remplir tous les champs."); return; }
      if (isEdit) {
        Object.assign(existing, { date, label, amount, category, accountId });
      } else {
        state.transactions.push({ id: uid(), date, label, amount, category, accountId });
      }
      saveState(); closeModal(); renderAll();
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

["filterMonth", "filterCategory", "filterAccount", "filterSearch"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderExpenses);
});

function renderExpenses() {
  const month = document.getElementById("filterMonth").value;
  const cat = document.getElementById("filterCategory").value;
  const acc = document.getElementById("filterAccount").value;
  const search = document.getElementById("filterSearch").value.trim().toLowerCase();

  let list = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
  if (month) list = list.filter(t => monthKey(t.date) === month);
  if (cat) list = list.filter(t => t.category === cat);
  if (acc) list = list.filter(t => t.accountId === acc);
  if (search) list = list.filter(t => t.label.toLowerCase().includes(search));

  const body = document.getElementById("expensesBody");
  document.getElementById("expensesEmpty").hidden = list.length !== 0;
  body.innerHTML = list.map(t => {
    const c = categoryById(t.category);
    const a = t.accountId ? accountById(t.accountId) : null;
    return `
      <tr data-id="${t.id}">
        <td>${formatDate(t.date)}</td>
        <td>${escapeHtml(t.label)}</td>
        <td><span class="cat-pill"><span class="cat-dot" style="background:${c.color}"></span>${c.name}</span></td>
        <td>${a ? escapeHtml(a.name) : "—"}</td>
        <td class="num ${t.amount < 0 ? "amount-neg" : "amount-pos"}">${formatMoneyPrecise(t.amount)}</td>
        <td class="row-actions"><button class="t-edit">✎</button></td>
      </tr>
    `;
  }).join("");
  body.querySelectorAll("tr").forEach(row => {
    const t = state.transactions.find(x => x.id === row.dataset.id);
    row.querySelector(".t-edit").addEventListener("click", () => openExpenseModal(t));
  });
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
  };
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
  if (matches(["isin"]) || (matches(HOLDINGS_HEADERS.name) && matches(HOLDINGS_HEADERS.amount))) return "holdings";
  if (matches(LABEL_HEADERS) && (matches(AMOUNT_HEADERS) || matches(DEBIT_HEADERS) || matches(CREDIT_HEADERS))) return "expenses";
  return null;
}

async function handleImportedFile(file, expectedKind) {
  let rows;
  try {
    rows = await parseImportFile(file);
  } catch (err) {
    console.error(err);
    alert("Impossible de lire ce fichier : " + err.message);
    return;
  }
  if (!rows.length) { alert("Fichier vide."); return; }
  const kind = detectFileKind(rows[0]);
  if (!kind) {
    alert("Format de fichier non reconnu : ce n'est ni un relevé de dépenses, ni un relevé de supports/placements.");
    return;
  }
  if (kind !== expectedKind) {
    const targetView = kind === "holdings" ? "accounts" : "expenses";
    const targetLabel = kind === "holdings" ? "Comptes & placements" : "Dépenses";
    toast(`Ce fichier ressemble à ${kind === "holdings" ? "un relevé de supports/placements" : "un relevé de dépenses"} → redirection vers l'onglet ${targetLabel}.`);
    document.querySelector(`[data-view="${targetView}"]`).click();
  }
  if (kind === "holdings") showHoldingsImportPreview(rows);
  else showImportPreview(rows);
}

let pendingImportRows = [];

function showImportPreview(rows) {
  if (!rows.length) { alert("Fichier vide."); return; }
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

  const accountOptions = `<option value="">—</option>` + state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  const validCount = parsed.filter(r => r.include).length;

  openModal(`
    <h3>Aperçu de l'import (${parsed.length} lignes, ${validCount} valides)</h3>
    <div class="field">
      <label>Associer au compte</label>
      <select id="f-import-account">${accountOptions}</select>
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
      let count = 0;
      pendingImportRows.forEach(r => {
        if (!r.include || !r.date || !r.label || isNaN(r.amount)) return;
        state.transactions.push({ id: uid(), date: r.date, label: r.label, amount: r.amount, category: r.category, accountId });
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

function showHoldingsImportPreview(rows) {
  if (rows.length < 2) { alert("Fichier vide ou format non reconnu."); return; }
  const headerRow = rows[0];
  const cols = detectHoldingsColumns(headerRow);
  if (cols.name < 0 || cols.amount < 0) {
    alert("Ce fichier ne ressemble pas à un relevé de supports (colonnes \"Nom du support\" / \"Somme en Compte\" introuvables).");
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
    const matchingAccount = state.accounts.find(a => a.contractNumber && a.contractNumber === first.contractNumber)
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
        <label>Associer à</label>
        <select data-group="${gi}" class="f-holdings-target">
          <option value="__new__" ${!g.targetAccountId ? "selected" : ""}>+ Créer un nouveau compte</option>
          ${state.accounts.map(a => `<option value="${a.id}" ${g.targetAccountId === a.id ? "selected" : ""}>${escapeHtml(a.name)} (mettre à jour)</option>`).join("")}
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
        if (account.balance !== g.total) {
          account.balance = g.total;
          account.history.push({ date: todayIso, balance: g.total });
        }
      });
      pendingHoldingsGroups = [];
      saveState(); closeModal(); renderAll();
      toast("Relevé de supports importé.");
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
        toast("Sauvegarde restaurée.");
      }
    } catch (err) {
      alert("Fichier de sauvegarde invalide.");
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
  if (total !== 100) { alert("La cible doit totaliser 100%."); return; }
  state.settings.targetAllocation = values;
  saveState(); renderAll();
  toast("Allocation cible mise à jour.");
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

const CHART_TEXT = "#9aa1b2";
const CHART_GRID = "#232838";

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
  const curExpenses = state.transactions.filter(t => monthKey(t.date) === curMonth && t.amount < 0).reduce((s, t) => s + t.amount, 0);
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

function renderNetWorthChart() {
  const allDates = [...new Set(state.accounts.flatMap(a => a.history.map(h => h.date)))].sort();
  const ctx = document.getElementById("chartNetWorth");
  destroyChart("netWorth");
  if (!allDates.length) return;
  const data = allDates.map(date => state.accounts.reduce((sum, a) => {
    const points = a.history.filter(h => h.date <= date);
    const bal = points.length ? points[points.length - 1].balance : 0;
    return sum + (accountTypeMeta(a.type).group === "Dettes" ? -bal : bal);
  }, 0));
  charts.netWorth = new Chart(ctx, {
    type: "line",
    data: {
      labels: allDates.map(formatDate),
      datasets: [{
        data, borderColor: "#6c8cff", backgroundColor: "rgba(108,140,255,0.12)",
        fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: "#6c8cff",
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => formatMoney(c.parsed.y) } } },
      scales: {
        x: { ticks: { color: CHART_TEXT }, grid: { color: CHART_GRID } },
        y: { ticks: { color: CHART_TEXT, callback: v => formatMoney(v) }, grid: { color: CHART_GRID } },
      },
    },
  });
}

function renderAllocationChart() {
  const ctx = document.getElementById("chartAllocation");
  destroyChart("allocation");
  const positive = state.accounts.filter(a => accountTypeMeta(a.type).group !== "Dettes" && a.balance > 0);
  if (!positive.length) return;
  const byType = {};
  positive.forEach(a => { const l = accountTypeMeta(a.type).label; byType[l] = (byType[l] || 0) + a.balance; });
  const palette = ["#6c8cff", "#3ecf8e", "#f2b84b", "#f2637a", "#a06cff", "#4bc8f2", "#f28c4b"];
  charts.allocation = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(byType),
      datasets: [{ data: Object.values(byType), backgroundColor: palette, borderColor: "#12151c", borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: CHART_TEXT, boxWidth: 10, padding: 12, font: { size: 11 } } },
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
  const expenses = state.transactions.filter(t => monthKey(t.date) === curMonth && t.amount < 0);
  if (!expenses.length) return;
  const byCat = {};
  expenses.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + Math.abs(t.amount); });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  charts.expCat = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: entries.map(([id]) => categoryById(id).name),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([id]) => categoryById(id).color), borderColor: "#12151c", borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: CHART_TEXT, boxWidth: 10, padding: 12, font: { size: 11 } } },
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
  const data = months.map(m => Math.abs(state.transactions.filter(t => monthKey(t.date) === m && t.amount < 0).reduce((s, t) => s + t.amount, 0)));
  charts.monthly = new Chart(ctx, {
    type: "bar",
    data: { labels: months.map(monthLabel), datasets: [{ data, backgroundColor: "#6c8cff", borderRadius: 6, maxBarThickness: 28 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => formatMoney(c.parsed.y) } } },
      scales: {
        x: { ticks: { color: CHART_TEXT }, grid: { display: false } },
        y: { ticks: { color: CHART_TEXT, callback: v => formatMoney(v) }, grid: { color: CHART_GRID } },
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
  if (classified <= 0) {
    if (note) note.textContent = "Aucun compte classé dans une allocation ABC pour le moment.";
    return;
  }
  const target = state.settings.targetAllocation;
  charts.riskAllocation = new Chart(ctx, {
    type: "bar",
    data: {
      labels: RISK_BUCKETS.map(b => b.label),
      datasets: [
        {
          label: "Cible",
          data: RISK_BUCKETS.map(b => target[b.id]),
          backgroundColor: "rgba(154,161,178,0.35)",
          borderRadius: 6, maxBarThickness: 26,
        },
        {
          label: "Réel",
          data: RISK_BUCKETS.map(b => Math.round((totals[b.id] / classified) * 1000) / 10),
          backgroundColor: RISK_BUCKETS.map(b => b.color),
          borderRadius: 6, maxBarThickness: 26,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: CHART_TEXT, boxWidth: 10, padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y}%` } },
      },
      scales: {
        x: { ticks: { color: CHART_TEXT }, grid: { display: false } },
        y: { ticks: { color: CHART_TEXT, callback: v => v + "%" }, grid: { color: CHART_GRID }, suggestedMax: 100 },
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
function toast(message) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderAll() {
  renderDashboard();
  renderAccounts();
  populateExpenseFilters();
  renderExpenses();
  renderCategories();
  initTargetAllocationForm();
}

renderAll();

/* ---------- Glisser-déposer un fichier n'importe où sur la page ---------- */

async function handleDroppedFile(file) {
  let rows;
  try {
    rows = await parseImportFile(file);
  } catch (err) {
    console.error(err);
    alert("Impossible de lire ce fichier : " + err.message);
    return;
  }
  if (!rows.length) { alert("Fichier vide."); return; }
  const kind = detectFileKind(rows[0]);
  if (!kind) {
    alert("Format de fichier non reconnu : ce n'est ni un relevé de dépenses, ni un relevé de supports/placements.");
    return;
  }
  document.querySelector(`[data-view="${kind === "holdings" ? "accounts" : "expenses"}"]`).click();
  if (kind === "holdings") showHoldingsImportPreview(rows);
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
