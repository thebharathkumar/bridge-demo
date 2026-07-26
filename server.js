import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LENDERS, PROPERTY_TYPES, PROJECT_STAGES, SYNTHETIC_DATA_NOTICE } from './src/data/lenders.js';
import { EXAMPLE_DEALS } from './src/data/examples.js';
import { evaluateDeal } from './src/engine/evaluate.js';
import { MARGINS } from './src/engine/hardFilter.js';
import { llmConfigured } from './src/engine/softFilter.js';
import { normalizeDeal, DealValidationError } from './src/engine/normalizeDeal.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(here, 'public')));

app.get('/api/config', (req, res) => {
  res.json({
    syntheticDataNotice: SYNTHETIC_DATA_NOTICE,
    propertyTypes: PROPERTY_TYPES,
    projectStages: PROJECT_STAGES,
    margins: MARGINS,
    softPass: {
      llmConfigured: llmConfigured(),
      model: llmConfigured() ? process.env.LENDER_FIT_MODEL || 'claude-opus-5' : null,
    },
  });
});

app.get('/api/lenders', (req, res) => {
  res.json({ syntheticDataNotice: SYNTHETIC_DATA_NOTICE, lenders: LENDERS });
});

app.get('/api/examples', (req, res) => {
  res.json({ syntheticDataNotice: SYNTHETIC_DATA_NOTICE, examples: EXAMPLE_DEALS });
});

app.post('/api/evaluate', async (req, res) => {
  let deal;
  try {
    deal = normalizeDeal(req.body?.deal ?? req.body);
  } catch (error) {
    if (error instanceof DealValidationError) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }

  const requested = req.body?.softMode;
  const softMode = ['auto', 'deterministic', 'llm'].includes(requested) ? requested : 'auto';

  try {
    const report = await evaluateDeal(deal, { softMode });
    res.json({ syntheticDataNotice: SYNTHETIC_DATA_NOTICE, ...report });
  } catch (error) {
    console.error('[evaluate] unexpected failure', error);
    res.status(500).json({ error: 'Evaluation failed. Check the server log.' });
  }
});

app.listen(PORT, () => {
  const mode = llmConfigured()
    ? `LLM soft pass enabled (${process.env.LENDER_FIT_MODEL || 'claude-opus-5'})`
    : 'offline mode: deterministic soft pass (no ANTHROPIC_API_KEY set)';
  console.log(`Lender Fit Explainer running at http://localhost:${PORT}`);
  console.log(`  ${LENDERS.length} synthetic lender profiles loaded. ${mode}.`);
});
