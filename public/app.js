/* Lender Fit Explainer — front end. Plain JS, no build step. */

const state = { config: null, examples: [], focusLenderId: null, requestSeq: 0 };

const el = (id) => document.getElementById(id);

function money(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function pct(fraction) {
  return `${Number((fraction * 100).toFixed(1))}%`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

const verdictClass = (verdict) =>
  ({ Eligible: 'eligible', Borderline: 'borderline', 'Not Eligible': 'not-eligible' }[verdict] ?? '');

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  const [config, examplesPayload, lendersPayload] = await Promise.all([
    fetch('/api/config').then((r) => r.json()),
    fetch('/api/examples').then((r) => r.json()),
    fetch('/api/lenders').then((r) => r.json()),
  ]);

  state.config = config;
  state.examples = examplesPayload.examples;

  el('synthetic-banner').textContent = config.syntheticDataNotice;

  fillSelect(el('propertyType'), config.propertyTypes, false);
  fillSelect(el('projectStage'), config.projectStages, true);

  el('m-loan').textContent = `${config.margins.loanSizeFraction * 100}%`;
  el('m-ltv').textContent = String(config.margins.ltvPoints);
  el('m-exp').textContent = `${config.margins.exposureFraction * 100}%`;

  el('soft-mode').textContent = config.softPass.llmConfigured
    ? `Soft pass: LLM (${config.softPass.model}), deterministic fallback on any failure.`
    : 'Soft pass: deterministic (offline). Set ANTHROPIC_API_KEY to use the LLM pass.';

  renderExamples();
  renderLenders(lendersPayload.lenders);
  loadExample(state.examples[0]);
}

function fillSelect(select, options, includeBlank) {
  select.innerHTML = '';
  if (includeBlank) {
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Not stated';
    select.append(blank);
  }
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.id;
    node.textContent = option.label;
    select.append(node);
  }
}

/* ------------------------------------------------------------------ */
/* examples                                                            */
/* ------------------------------------------------------------------ */

function renderExamples() {
  el('examples').innerHTML = state.examples
    .map(
      (example, index) => `
      <button type="button" class="example" data-index="${index}">
        <strong>${index + 1}. ${escapeHtml(example.title)}</strong>
        <span>${escapeHtml(example.blurb)}</span>
        <span class="expect">Expected: <b>${escapeHtml(example.expect.verdict)}</b> at ${escapeHtml(example.expect.lenderId)}</span>
      </button>`,
    )
    .join('');

  el('examples').addEventListener('click', (event) => {
    const button = event.target.closest('.example');
    if (!button) return;
    const example = state.examples[Number(button.dataset.index)];
    loadExample(example);
    el('deal-form').requestSubmit();
  });
}

function loadExample(example) {
  if (!example) return;
  state.focusLenderId = example.expect.lenderId;
  const form = el('deal-form');
  const deal = example.deal;

  const set = (name, value) => {
    const input = form.elements.namedItem(name);
    if (!input) return;
    if (value === undefined || value === null) {
      input.value = '';
    } else if (typeof value === 'boolean') {
      input.value = String(value);
    } else {
      input.value = value;
    }
  };

  set('name', deal.name);
  set('loanAmount', deal.loanAmount.toLocaleString('en-US'));
  set('ltv', Number((deal.ltv * 100).toFixed(2)));
  set('propertyType', deal.propertyType);
  set('state', deal.state);
  set('projectStage', deal.projectStage ?? '');
  set('occupancyPct', deal.occupancyPct === undefined ? '' : Number((deal.occupancyPct * 100).toFixed(2)));

  const sponsor = deal.sponsor ?? {};
  set('sponsor.yearsExperience', sponsor.yearsExperience);
  set('sponsor.priorDealsSameAssetClass', sponsor.priorDealsSameAssetClass);
  set('sponsor.localToMarket', sponsor.localToMarket);
  set('sponsor.isOwnerOccupant', sponsor.isOwnerOccupant);
  set('sponsor.generalContractorTrackRecord', sponsor.generalContractorTrackRecord ?? '');

  const tenancy = deal.tenancy ?? {};
  set(
    'tenancy.largestTenantSharePct',
    tenancy.largestTenantSharePct === undefined ? '' : Number((tenancy.largestTenantSharePct * 100).toFixed(2)),
  );
  set('tenancy.leaseTermRemainingYears', tenancy.leaseTermRemainingYears);
  set('tenancy.tenantCreditRated', tenancy.tenantCreditRated);
  set(
    'tenancy.rolloverNext24MonthsPct',
    tenancy.rolloverNext24MonthsPct === undefined ? '' : Number((tenancy.rolloverNext24MonthsPct * 100).toFixed(2)),
  );
  set('notes', deal.notes ?? '');
}

/* ------------------------------------------------------------------ */
/* submit                                                             */
/* ------------------------------------------------------------------ */

function readForm() {
  const data = new FormData(el('deal-form'));
  const get = (key) => {
    const value = data.get(key);
    return value === null || String(value).trim() === '' ? undefined : String(value).trim();
  };

  return {
    name: get('name'),
    loanAmount: get('loanAmount'),
    propertyType: get('propertyType'),
    state: get('state'),
    ltv: get('ltv'),
    projectStage: get('projectStage'),
    occupancyPct: get('occupancyPct'),
    sponsor: {
      yearsExperience: get('sponsor.yearsExperience'),
      priorDealsSameAssetClass: get('sponsor.priorDealsSameAssetClass'),
      localToMarket: get('sponsor.localToMarket'),
      isOwnerOccupant: get('sponsor.isOwnerOccupant'),
      generalContractorTrackRecord: get('sponsor.generalContractorTrackRecord'),
    },
    tenancy: {
      largestTenantSharePct: get('tenancy.largestTenantSharePct'),
      leaseTermRemainingYears: get('tenancy.leaseTermRemainingYears'),
      tenantCreditRated: get('tenancy.tenantCreditRated'),
      rolloverNext24MonthsPct: get('tenancy.rolloverNext24MonthsPct'),
    },
    notes: get('notes'),
  };
}

el('deal-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = el('submit-btn');
  const errorBox = el('error');
  errorBox.hidden = true;
  button.disabled = true;
  button.textContent = 'Checking…';

  // Clicking through the example buttons quickly can leave an earlier request in
  // flight. If it resolves after a newer one, rendering it would pair stale
  // verdicts with the newer example's highlighted lender. Only the latest wins.
  const seq = ++state.requestSeq;

  try {
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal: readForm() }),
    });
    const payload = await response.json();
    if (seq !== state.requestSeq) return;
    if (!response.ok) throw new Error(payload.error || 'Evaluation failed.');
    renderResults(payload);
  } catch (error) {
    if (seq !== state.requestSeq) return;
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    if (seq === state.requestSeq) {
      button.disabled = false;
      button.textContent = 'Check against all lenders';
    }
  }
});

/* ------------------------------------------------------------------ */
/* results                                                            */
/* ------------------------------------------------------------------ */

function renderResults(payload) {
  el('results-panel').hidden = false;

  el('counts').innerHTML = [
    `<span class="count"><b>${payload.counts.eligible}</b> Eligible</span>`,
    `<span class="count"><b>${payload.counts.borderline}</b> Borderline</span>`,
    `<span class="count"><b>${payload.counts.notEligible}</b> Not Eligible</span>`,
    `<span class="count">soft pass: ${payload.softMode.used.join(' + ') || 'not run'}</span>`,
  ].join('');

  const focus = state.focusLenderId
    ? payload.results.find((r) => r.lenderId === state.focusLenderId)
    : null;
  const noteBox = el('focus-note');
  if (focus) {
    noteBox.hidden = false;
    noteBox.innerHTML =
      `<b>${escapeHtml(focus.lenderName)}</b> is the lender this worked example is about: ` +
      `<b>${escapeHtml(focus.verdict)}</b>, driven by ${escapeHtml(focus.driver.label.toLowerCase())}.`;
  } else {
    noteBox.hidden = true;
  }

  el('results').innerHTML = payload.results.map(renderResult).join('');
}

function renderResult(result) {
  const isFocus = result.lenderId === state.focusLenderId;
  const driver = result.driver;

  const alsoFails = result.alsoFails?.length
    ? `<details class="sub">
         <summary>Also fails ${result.alsoFails.length} other criteri${result.alsoFails.length === 1 ? 'on' : 'a'}</summary>
         <ul>${result.alsoFails
           .map((f) => `<li><b>${escapeHtml(f.label)}.</b> <q>${escapeHtml(f.quote)}</q> ${escapeHtml(f.detail)}</li>`)
           .join('')}</ul>
       </details>`
    : '';

  const otherMargins = (result.margins ?? []).slice(1);
  const marginsBlock = otherMargins.length
    ? `<details class="sub">
         <summary>${otherMargins.length} other boundar${otherMargins.length === 1 ? 'y' : 'ies'} also close</summary>
         <ul>${otherMargins
           .map((m) => `<li><b>${escapeHtml(m.label)}.</b> ${escapeHtml(m.detail)}</li>`)
           .join('')}</ul>
       </details>`
    : '';

  const softBlock = result.soft.assessments?.length
    ? `<details class="sub">
         <summary>Soft-criteria read${result.soft.determinative === false ? ' (context only)' : ''}</summary>
         <ul>${result.soft.assessments
           .map(
             (a) =>
               `<li><span class="tag ${a.assessment}">${a.assessment}</span> <q>${escapeHtml(a.text)}</q> ${escapeHtml(a.reason)}</li>`,
           )
           .join('')}</ul>
         <p class="source-note">Source: ${escapeHtml(result.soft.source)}${
           result.soft.note ? `. ${escapeHtml(result.soft.note)}` : ''
         }</p>
       </details>`
    : `<p class="source-note">${escapeHtml(result.soft.reason ?? '')}</p>`;

  const clearedBlock = result.hardChecks?.length
    ? `<details class="sub">
         <summary>Hard criteria cleared (${result.hardChecks.length})</summary>
         <ul>${result.hardChecks
           .map((c) => `<li><b>${escapeHtml(c.label)}.</b> ${escapeHtml(c.detail)}</li>`)
           .join('')}</ul>
       </details>`
    : '';

  return `
    <article class="result ${isFocus ? 'focus' : ''}">
      <div class="result-head">
        <h3>
          ${escapeHtml(result.lenderName)} <span class="muted">${escapeHtml(result.lenderId)}</span>
          <span class="arch">${escapeHtml(result.lenderArchetype)}</span>
        </h3>
        <span class="badge ${verdictClass(result.verdict)}">${escapeHtml(result.verdict)}</span>
      </div>

      <div class="driver">
        <div class="driver-label">Driven by: ${escapeHtml(driver.label)}</div>
        <blockquote>${escapeHtml(driver.quote)}</blockquote>
        <p class="detail">${escapeHtml(driver.detail)}</p>
        ${driver.whyHuman ? `<p class="why-human">${escapeHtml(driver.whyHuman)}</p>` : ''}
      </div>

      ${alsoFails}
      ${marginsBlock}
      ${softBlock}
      ${clearedBlock}
    </article>`;
}

/* ------------------------------------------------------------------ */
/* lender profiles                                                    */
/* ------------------------------------------------------------------ */

function renderLenders(lenders) {
  el('lenders').innerHTML = lenders
    .map(
      (lender) => `
      <div class="lender">
        <h3>${escapeHtml(lender.name)} <code>${escapeHtml(lender.id)}</code></h3>
        <p class="arch">${escapeHtml(lender.archetype)}</p>
        <dl>
          <dt>Size</dt><dd>${money(lender.loanSize.min)} – ${money(lender.loanSize.max)}</dd>
          <dt>LTV cap</dt><dd>${pct(lender.ltv.cap)}</dd>
          <dt>Types</dt><dd>${lender.propertyTypes.included.map(escapeHtml).join(', ')}</dd>
          <dt>Excludes</dt><dd>${lender.propertyTypes.excluded.map(escapeHtml).join(', ') || '—'}</dd>
          <dt>Geography</dt><dd>${escapeHtml(lender.geography.text)}</dd>
          <dt>Exposure</dt><dd>${money(lender.exposure.capPerPropertyType)} per property type</dd>
        </dl>
        <ul class="soft-list">
          ${lender.soft.map((s) => `<li>${escapeHtml(s.text)}</li>`).join('')}
        </ul>
      </div>`,
    )
    .join('');
}

boot().catch((error) => {
  const box = el('error');
  box.textContent = `Failed to load: ${error.message}`;
  box.hidden = false;
});
