// Calculadora de crédito hipotecario · Chile (UF)
// Sistema francés de amortización (cuota fija).

const $ = (id) => document.getElementById(id);

const state = {
  ratesData: null,
  amortView: "yearly", // "yearly" | "monthly"
  lastResult: null,
};

// ---------- Formateo (es-CL) ----------
const nfUF = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const nfUFInt = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const nfCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const nfPct = new Intl.NumberFormat("es-CL", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtUF = (v, dec = 2) => `UF ${dec === 0 ? nfUFInt.format(v) : nfUF.format(v)}`;
const fmtCLP = (v) => nfCLP.format(Math.round(v));

// ---------- Cálculo financiero ----------
function monthlyPaymentFrench(principal, annualRatePct, years) {
  const i = annualRatePct / 100 / 12;
  const n = years * 12;
  if (i === 0) return principal / n;
  return (principal * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
}

function buildAmortization(principal, annualRatePct, years, lifeMonthlyPct) {
  const i = annualRatePct / 100 / 12;
  const n = years * 12;
  const M = monthlyPaymentFrench(principal, annualRatePct, years);
  const rows = [];
  let balance = principal;
  let totalInterest = 0;
  let totalLifeInsurance = 0;
  for (let k = 1; k <= n; k++) {
    const interest = balance * i;
    const principalPaid = M - interest;
    balance = Math.max(0, balance - principalPaid);
    const lifeIns = (balance + principalPaid) * (lifeMonthlyPct / 100); // sobre saldo al inicio del mes
    totalInterest += interest;
    totalLifeInsurance += lifeIns;
    rows.push({
      n: k,
      payment: M,
      interest,
      principal: principalPaid,
      balance,
      lifeInsurance: lifeIns,
    });
  }
  return { M, rows, totalInterest, totalLifeInsurance };
}

function aggregateYearly(rows) {
  const yearly = [];
  for (let y = 0; y < rows.length / 12; y++) {
    const slice = rows.slice(y * 12, (y + 1) * 12);
    yearly.push({
      year: y + 1,
      payment: slice.reduce((a, r) => a + r.payment, 0),
      interest: slice.reduce((a, r) => a + r.interest, 0),
      principal: slice.reduce((a, r) => a + r.principal, 0),
      lifeInsurance: slice.reduce((a, r) => a + r.lifeInsurance, 0),
      balance: slice[slice.length - 1].balance,
    });
  }
  return yearly;
}

// CAE aproximada (incluye seguros y gastos operacionales).
// Resuelve la tasa mensual r tal que:
//   (loan - gastos_op) = sum_{k=1..n} (cuota + seguros_promedio) / (1+r)^k
function estimateCAE(loanUf, upfrontCostsUf, monthlyTotalAvgUf, n) {
  const net = loanUf - upfrontCostsUf;
  if (net <= 0) return null;
  let lo = 1e-6;
  let hi = 1.0;
  const pv = (r) => (monthlyTotalAvgUf * (1 - Math.pow(1 + r, -n))) / r;
  for (let it = 0; it < 100; it++) {
    const mid = (lo + hi) / 2;
    const v = pv(mid);
    if (v > net) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-9) break;
  }
  const rMonthly = (lo + hi) / 2;
  return Math.pow(1 + rMonthly, 12) - 1;
}

// ---------- Costos asociados (Chile) ----------
function computeAssociatedCosts(propertyUf, loanUf, params) {
  // Valores típicos de mercado, expresados en UF (aproximados).
  const tasacion = 3;
  const estudioTitulos = 4;
  const gastosNotariales = 3;
  const cbr = propertyUf * (params.cbrPct / 100);
  const stampTax = loanUf * (params.stampTaxPct / 100); // Impuesto al mutuo (Ley de Timbres y Estampillas)
  const items = [
    { label: "Tasación", uf: tasacion, desc: "Pago al perito tasador (varía UF 2,5–4)." },
    { label: "Estudio de títulos", uf: estudioTitulos, desc: "Revisión legal de la propiedad (UF 3–6)." },
    { label: "Gastos notariales", uf: gastosNotariales, desc: "Escritura, copias y autorizaciones (UF 2–5)." },
    {
      label: "Inscripción CBR",
      uf: cbr,
      desc: `Conservador de Bienes Raíces (~${params.cbrPct}% del precio).`,
    },
    {
      label: "Impuesto al mutuo (Ley de Timbres)",
      uf: stampTax,
      desc: `Tope legal 0,8% del crédito; aquí ${params.stampTaxPct}%.`,
    },
  ];
  const total = items.reduce((a, x) => a + x.uf, 0);
  return { items, total };
}

// ---------- UI helpers ----------
function readInputs() {
  const propertyUf = parseFloat($("propertyPrice").value) || 0;
  const downPct = parseFloat($("downPaymentPct").value) || 0;
  const years = parseInt($("years").value, 10) || 25;
  const annualRate = parseFloat($("annualRate").value) || 0;
  const lifeMonthlyPct = parseFloat($("lifeInsuranceMonthlyPct").value) || 0;
  const fireMonthlyPct = parseFloat($("fireInsuranceMonthlyPct").value) || 0;
  const stampTaxPct = parseFloat($("stampTaxPct").value) || 0;
  const cbrPct = parseFloat($("cbrPct").value) || 0;
  const downUf = propertyUf * (downPct / 100);
  const loanUf = propertyUf - downUf;
  return {
    propertyUf,
    downPct,
    downUf,
    loanUf,
    years,
    annualRate,
    lifeMonthlyPct,
    fireMonthlyPct,
    stampTaxPct,
    cbrPct,
  };
}

function syncSliderLabels() {
  const i = readInputs();
  $("downPaymentPctLabel").textContent = `${i.downPct}%`;
  $("yearsLabel").textContent = `${i.years}`;
  $("downPaymentUf").textContent = fmtUF(i.downUf, 0);
  $("loanAmountUf").textContent = fmtUF(i.loanUf, 0);
}

function updateRateHint() {
  const years = parseInt($("years").value, 10);
  const meta = $("ratesMeta");
  if (state.ratesData?.termRates?.[years]) {
    meta.textContent = `Tasa de referencia para ${years} años: ${state.ratesData.termRates[years]}% · actualizado ${state.ratesData.lastUpdated}`;
  } else if (state.ratesData?.lastUpdated) {
    meta.textContent = `Tasas referenciales · actualizado ${state.ratesData.lastUpdated}`;
  }
}

function suggestRateForYears() {
  const years = parseInt($("years").value, 10);
  const r = state.ratesData?.termRates?.[years];
  if (r != null) {
    $("annualRate").value = r;
  }
}

// ---------- Render ----------
function calculateAndRender() {
  const inp = readInputs();
  if (inp.propertyUf <= 0 || inp.loanUf <= 0 || inp.annualRate <= 0) {
    $("results").innerHTML = `<h2>Resultado</h2><p class="placeholder">Revisa los datos: el precio, el crédito y la tasa deben ser mayores a 0.</p>`;
    return;
  }
  const amort = buildAmortization(inp.loanUf, inp.annualRate, inp.years, inp.lifeMonthlyPct);
  const M = amort.M;
  const n = inp.years * 12;

  const monthlyFire = inp.propertyUf * (inp.fireMonthlyPct / 100); // sobre tasación ~ precio
  const lifeInsAvg = amort.totalLifeInsurance / n;
  const monthlyTotalAvg = M + lifeInsAvg + monthlyFire;
  const monthlyTotalInitial = M + amort.rows[0].lifeInsurance + monthlyFire;

  const costs = computeAssociatedCosts(inp.propertyUf, inp.loanUf, inp);
  const cae = estimateCAE(inp.loanUf, costs.total, monthlyTotalAvg, n);

  const totalPaid = M * n;
  const totalInterest = amort.totalInterest;
  const totalLifeIns = amort.totalLifeInsurance;
  const totalFireIns = monthlyFire * n;
  const totalAllIn = totalPaid + totalLifeIns + totalFireIns + costs.total;

  const ufClp = state.ratesData?.ufValueClp || null;
  const inClp = (uf) => (ufClp ? fmtCLP(uf * ufClp) : null);

  state.lastResult = { inp, amort, costs, cae, totalPaid, totalInterest, totalLifeIns, totalFireIns, totalAllIn, monthlyTotalInitial, monthlyTotalAvg, monthlyFire, lifeInsAvg, ufClp };

  renderResults();
}

function renderResults() {
  const r = state.lastResult;
  if (!r) return;
  const { inp, amort, costs, cae, totalPaid, totalInterest, totalLifeIns, totalFireIns, totalAllIn, monthlyTotalInitial, monthlyTotalAvg, monthlyFire, lifeInsAvg, ufClp } = r;
  const inClp = (uf) => (ufClp ? `<div class="sub">${fmtCLP(uf * ufClp)}</div>` : "");

  const yearly = aggregateYearly(amort.rows);
  const showRows = state.amortView === "monthly" ? amort.rows.map((row) => ({
    label: `Mes ${row.n}`,
    payment: row.payment,
    principal: row.principal,
    interest: row.interest,
    balance: row.balance,
  })) : yearly.map((y) => ({
    label: `Año ${y.year}`,
    payment: y.payment,
    principal: y.principal,
    interest: y.interest,
    balance: y.balance,
  }));

  const tableRows = showRows
    .map((row) => {
      const total = row.principal + row.interest;
      const capPct = total > 0 ? (row.principal / total) * 100 : 0;
      const intPct = 100 - capPct;
      return `<tr>
        <td>${row.label}</td>
        <td>${fmtUF(row.payment)}</td>
        <td>${fmtUF(row.principal)}</td>
        <td>${fmtUF(row.interest)}</td>
        <td>${fmtUF(row.balance)}</td>
        <td style="min-width:120px">
          <div class="bar"><div class="seg-capital" style="width:${capPct}%"></div><div class="seg-interest" style="width:${intPct}%"></div></div>
        </td>
      </tr>`;
    })
    .join("");

  const costRows = costs.items
    .map(
      (it) => `
        <div class="row">
          <div>
            <div>${it.label}</div>
            <div class="desc">${it.desc}</div>
          </div>
          <div>${fmtUF(it.uf)}</div>
        </div>`,
    )
    .join("");

  const html = `
    <h2>Resultado</h2>

    <div class="summary-grid">
      <div class="metric highlight">
        <div class="label">Dividendo (cuota base)</div>
        <div class="value">${fmtUF(amort.M)}</div>
        ${inClp(amort.M)}
      </div>
      <div class="metric">
        <div class="label">Cuota total mes 1 (con seguros)</div>
        <div class="value">${fmtUF(monthlyTotalInitial)}</div>
        ${inClp(monthlyTotalInitial)}
      </div>
      <div class="metric">
        <div class="label">Monto del crédito</div>
        <div class="value">${fmtUF(inp.loanUf, 0)}</div>
        ${inClp(inp.loanUf)}
      </div>
      <div class="metric">
        <div class="label">Pie</div>
        <div class="value">${fmtUF(inp.downUf, 0)}</div>
        <div class="sub">${inp.downPct}% del precio</div>
      </div>
      <div class="metric">
        <div class="label">Total intereses</div>
        <div class="value">${fmtUF(totalInterest, 0)}</div>
        <div class="sub">${(totalInterest / inp.loanUf * 100).toFixed(1)}% del crédito</div>
      </div>
      <div class="metric">
        <div class="label">Total a pagar (todo incluido)</div>
        <div class="value">${fmtUF(totalAllIn, 0)}</div>
        ${inClp(totalAllIn)}
      </div>
      <div class="metric">
        <div class="label">Tasa anual</div>
        <div class="value">${inp.annualRate.toFixed(2)}%</div>
        <div class="sub">${inp.years} años · ${inp.years * 12} cuotas</div>
      </div>
      <div class="metric">
        <div class="label">CAE estimada</div>
        <div class="value">${cae != null ? nfPct.format(cae) : "—"}</div>
        <div class="sub">incluye seguros y gastos op.</div>
      </div>
    </div>

    <h3>Costos asociados (al firmar)</h3>
    <div class="cost-list">
      ${costRows}
      <div class="row total">
        <div>Total gastos operacionales</div>
        <div>${fmtUF(costs.total)}</div>
      </div>
    </div>

    <h3>Costos mensuales adicionales (no incluidos en el dividendo base)</h3>
    <div class="cost-list">
      <div class="row">
        <div>
          <div>Seguro de desgravamen</div>
          <div class="desc">${inp.lifeMonthlyPct}% mensual sobre saldo insoluto · promedio mensual</div>
        </div>
        <div>${fmtUF(lifeInsAvg)}</div>
      </div>
      <div class="row">
        <div>
          <div>Seguro de incendio + sismo</div>
          <div class="desc">${inp.fireMonthlyPct}% mensual sobre la tasación</div>
        </div>
        <div>${fmtUF(monthlyFire)}</div>
      </div>
      <div class="row total">
        <div>Cuota total promedio (con seguros)</div>
        <div>${fmtUF(monthlyTotalAvg)}</div>
      </div>
    </div>

    <h3>Tabla de amortización</h3>
    <div class="amort-controls">
      <span>Ver:</span>
      <button data-view="yearly" class="${state.amortView === "yearly" ? "active" : ""}">Por año</button>
      <button data-view="monthly" class="${state.amortView === "monthly" ? "active" : ""}">Mes a mes</button>
    </div>
    <div class="legend">
      <span><span class="dot capital"></span>Capital</span>
      <span><span class="dot interest"></span>Interés</span>
    </div>
    <div class="amort-wrap">
      <table>
        <thead>
          <tr>
            <th>Periodo</th>
            <th>Cuota</th>
            <th>Capital</th>
            <th>Interés</th>
            <th>Saldo</th>
            <th>Composición</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>

    <h3>Supuestos y limitaciones</h3>
    <ul class="notes-list">
      <li>Sistema francés de amortización (cuota fija en UF). En la práctica el dividendo en pesos varía por la inflación reflejada en la UF.</li>
      <li>Los bancos en Chile típicamente financian hasta el <strong>80%</strong> del precio (pie mínimo 20%). Algunos productos especiales bajan a 10% pero con tasa más alta.</li>
      <li>La <strong>tasa anual</strong> es referencial. La oferta real depende del perfil del cliente, plazo, monto y banco.</li>
      <li>Se asume <strong>tasa fija</strong> en UF durante todo el plazo. Existen también tasas variables y mixtas con riesgo distinto.</li>
      <li>El <strong>impuesto al mutuo</strong> (Ley de Timbres y Estampillas) tiene tope legal 0,8% para créditos &gt; 12 meses; primera vivienda DFL2 puede tener exenciones parciales.</li>
      <li>La <strong>inscripción en el CBR</strong> usa una tabla escalonada: aquí se aproxima como ${inp.cbrPct}% del precio.</li>
      <li>Los seguros (desgravamen, incendio + sismo) son obligatorios mientras dure el crédito y suelen contratarse a través del banco. Es posible contratarlos por fuera para reducir el costo.</li>
      <li>La <strong>CAE</strong> mostrada se aproxima resolviendo la tasa interna que iguala el flujo neto recibido (crédito menos gastos op.) con la cuota total promedio. La CAE oficial de cada banco puede diferir levemente.</li>
      <li>No se incluyen: comisión de prepago, comisión de administración del banco (cuando aplica), corretaje (~2% + IVA), ITE (impuesto a la transferencia, hoy no aplica a propiedades habitacionales), ni gastos de mudanza o remodelación.</li>
      <li>El cálculo no representa una oferta. Para una simulación oficial debes solicitar evaluación al banco.</li>
    </ul>
  `;
  $("results").innerHTML = html;

  // bind amortization view buttons
  $("results").querySelectorAll(".amort-controls button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.amortView = btn.dataset.view;
      renderResults();
    });
  });
}

// ---------- Tasas ----------
async function loadRates() {
  try {
    const res = await fetch("/api/rates");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.ratesData = await res.json();
    suggestRateForYears();
    updateRateHint();
  } catch (e) {
    console.error("No se pudieron cargar las tasas:", e);
  }
}

async function refreshRates() {
  const btn = $("refreshRatesBtn");
  const status = $("refreshStatus");
  btn.disabled = true;
  btn.textContent = "Consultando…";
  status.hidden = false;
  status.className = "refresh-status";
  status.textContent = "Lanzando agente para consultar tasas vigentes en el mercado…";
  try {
    const res = await fetch("/api/rates/refresh", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      status.className = "refresh-status error";
      status.textContent = data.message || data.error || "No se pudo actualizar.";
      if (data.cached) {
        state.ratesData = data.cached;
        suggestRateForYears();
        updateRateHint();
      }
    } else {
      state.ratesData = data.rates;
      suggestRateForYears();
      updateRateHint();
      status.className = "refresh-status success";
      status.textContent = `Tasas actualizadas (${data.rates.lastUpdated}). Fuente: ${data.rates.source || "agente"}`;
    }
  } catch (e) {
    status.className = "refresh-status error";
    status.textContent = `Error de red: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Actualizar tasas";
  }
}

// ---------- Bootstrap ----------
function init() {
  ["propertyPrice", "downPaymentPct", "years"].forEach((id) => {
    $(id).addEventListener("input", () => {
      syncSliderLabels();
      if (id === "years") {
        suggestRateForYears();
        updateRateHint();
      }
    });
  });
  $("calcBtn").addEventListener("click", calculateAndRender);
  $("refreshRatesBtn").addEventListener("click", refreshRates);

  // Allow Enter key to recalc.
  document.querySelectorAll("input").forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") calculateAndRender();
    });
  });

  syncSliderLabels();
  loadRates();
}

document.addEventListener("DOMContentLoaded", init);
