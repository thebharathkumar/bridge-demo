# Lender Fit Explainer

Takes a commercial loan deal's basics, checks it against a set of lender criteria profiles, and returns a
verdict per lender — **Eligible**, **Not Eligible**, or **Borderline** — with the exact criterion that drove
the decision, quoted.

Not a similarity score. Not "overall fit is low." An actual cited reason a human can act on.

> **All lender profiles and deals in this repository are synthetic sample data.** The names are placeholders
> ("Sample Lender A"), the criteria are invented, and the numbers are made-up round figures. Nothing here
> reflects any real lender, any real underwriting standard, or any real portfolio. Do not use it to make a
> financing decision.

---

## Quickstart

```bash
npm install
npm start          # http://localhost:3000
```

```bash
npm test           # 18 offline smoke tests, no API key needed
```

Zero required setup. No API key, no config file, no network. The soft-criteria pass runs through an LLM if
`ANTHROPIC_API_KEY` happens to be set and falls back to a deterministic evaluator if it isn't — so the whole
thing runs and demos fully offline, and the tests never touch the network.

| Environment variable | Effect |
| --- | --- |
| _(none set)_ | Deterministic soft-criteria pass. Everything works. |
| `ANTHROPIC_API_KEY` | Soft-criteria pass goes through the Claude API instead. Falls back to deterministic on any error, refusal, or malformed response. |
| `LENDER_FIT_MODEL` | Override the model for the soft pass. Default `claude-opus-5`. |
| `PORT` | Default `3000`. |

---

## Why this shape

If you are a business trying to finance a property, the matching process is a black box. You submit a deal,
you wait, and you get back a no with no reason attached — or worse, a list of "matches" ranked by a score
nobody will explain. You cannot act on that. You do not learn whether the problem was your loan size, the
state the building is in, the leverage you asked for, or the fact that the lender stopped doing your asset
class last quarter. You cannot tell whether to come back with more equity, a smaller ask, or never. So the
value of a tool like this is not finding a match. Finding matches is the easy part, and a bad match costs you
a phone call. The value is being able to say *"this lender caps out at $15,000,000 and you asked for
$22,000,000"* — one sentence a borrower can immediately do something about — and, just as importantly,
refusing to give a confident answer at all when a deal sits right on a boundary. A deal at 68.5% LTV against
a 70% cap is not a yes and it is not a no. It is a question for a human, and a system that rounds it to
either answer is lying to somebody.

---

## The three worked examples

These are the pitch. They are pinned in `src/data/examples.js`, loaded by the buttons at the top of the demo
UI, and asserted end to end by `npm test`, so this table cannot quietly drift away from what the code does.

| # | The deal | Lender | Verdict | What comes back |
| --- | --- | --- | --- | --- |
| **1** | $22,000,000 · multifamily · TX · 62% LTV · experienced repeat sponsor | Sample Lender A (`SYN-01`) | **Not Eligible** | Cited to **loan size**: `"Loan size: $2,000,000 to $15,000,000."` → *"The request of $22,000,000 is $7,000,000 over the $15,000,000 maximum."* Also surfaces a second, secondary failure (the request would blow their multifamily exposure cap by $10,500,000) without letting it displace the primary citation. |
| **2** | $6,900,000 · industrial/warehouse · AZ · **68.5% LTV** · two-tenant, 4 years of term left | Sample Lender C (`SYN-03`) | **Borderline** | Cited to **LTV**: `"Maximum LTV of 70%."` → *"Requested LTV of 68.5% is 1.5 points under the 70% cap, inside the 2-point margin."* Plus, explicitly: *"This deal breaks none of this lender's stated rules, but it lands close enough to one of their numbers that the answer depends on how they feel on the day. A human needs to make this call."* |
| **3** | $9,500,000 · multifamily · GA · 68% LTV · sponsor with 6 prior repositionings | Sample Lender F (`SYN-06`) | **Eligible** | Cited to a **soft criterion**: `"Expects an operator who has completed at least two similar repositioning projects."` → *"The sponsor has 6 prior deals in this asset class, at or above the 2 this lender looks for."* All five hard criteria are listed as cleared, each with its own margin (e.g. LTV is 12 points under the cap; $22,500,000 of exposure room remains). |

Each example runs against all nine profiles, so you also see the spread. Example 2 is the interesting one: it
returns **two** Borderlines for different reasons — `SYN-03` because of the numeric LTV margin, and `SYN-09`
because of a soft criterion (*"4 years of remaining lease term is short of the 10 this lender prefers"*). Two
paths to the same verdict, each citing what actually caused it.

---

## Architecture

```
  deal in  (loan size · property type · geography · LTV · sponsor · tenancy · free-text narrative)
     │
     ▼
  ┌────────────────────────────────────────────────────────┐
  │  normalize + validate                                  │
  │  accepts "68.5" or "0.685", "$6,900,000" or 6900000     │
  │  rejects unknown property types and malformed states    │
  └────────────────────────────────────────────────────────┘
     │
     ├──────────────────► for each of the 9 lender profiles ──────────────────┐
     │                                                                        │
     ▼                                                                        │
  ┌────────────────────────────────────────────────────────┐                  │
  │  1. HARD FILTER          deterministic, in code        │                  │
  │     loan size range · property type / industry         │                  │
  │     geography · LTV cap · exposure cap per type        │                  │
  │     No LLM. This is arithmetic and set membership.     │                  │
  └────────────────────────────────────────────────────────┘                  │
     │                                                                        │
     ├── any failure ─────────────────►  NOT ELIGIBLE                          │
     │                                  + the failed criterion, quoted        │
     │                                  + the numbers that failed it          │
     │                                  (soft pass never runs — no judgment    │
     │                                   is spent on a disqualified deal)      │
     ▼ all pass                                                               │
  ┌────────────────────────────────────────────────────────┐                  │
  │  2. MARGIN CHECK         deterministic, in code        │                  │
  │     within 10% of a loan-size bound?                   │                  │
  │     within 2 points of the LTV cap?                    │                  │
  │     within 10% of the exposure cap?                    │                  │
  └────────────────────────────────────────────────────────┘                  │
     │                                                                        │
     ├── any hit ─────────────────────►  BORDERLINE                            │
     │                                  + the specific number that is close   │
     │                                  + why it needs a human                │
     │                                  VERDICT LOCKED. The soft pass still   │
     │                                  runs, but only as context — it cannot │
     │                                  argue the deal off the boundary.      │
     ▼ clear of every boundary                                                │
  ┌────────────────────────────────────────────────────────┐                  │
  │  3. SOFT FILTER          judgment, not arithmetic      │                  │
  │     operator experience · risk appetite language       │                  │
  │                                                        │                  │
  │     ANTHROPIC_API_KEY set  →  LLM pass                 │                  │
  │     no key, or any failure →  deterministic evaluators  │                  │
  │     (both return the same shape; the verdict logic      │                  │
  │      does not know which one ran)                       │                  │
  └────────────────────────────────────────────────────────┘                  │
     │                                                                        │
     ├── any concern ─────────────────►  BORDERLINE                            │
     │                                  + the preference, quoted              │
     │                                  + the fact that ran against it        │
     │                                  (never Not Eligible — see below)      │
     ▼ reads clean                                                            │
                                        ELIGIBLE                              │
                                        + the criterion it satisfies, quoted  │
                                        + all five hard criteria cleared,     │
                                          each with its margin                │
                                                                              │
     ◄────────────────────────────────────────────────────────────────────────┘
     ▼
  verdict per lender, sorted Eligible → Borderline → Not Eligible
```

### Three rules the code enforces, not just documents

**Hard criteria never go to a model.** Whether $22,000,000 exceeds $15,000,000, and whether `AZ` is in a list
of states, are not matters of opinion. A model that got those right 99% of the time would make the whole tool
untrustworthy, because you would never know which 1% you were looking at. `src/engine/hardFilter.js` contains
no LLM call and never will.

**Borderline is hard to talk your way out of.** A margin hit locks the verdict before the soft pass is even
consulted. There is a test for this (`a soft read cannot talk a deal out of Borderline once it is on a
boundary`) that takes the Borderline example, makes every soft signal read as favourably as the data model
allows — 25 prior deals, 99% occupancy, a glowing narrative — and asserts the verdict is still Borderline.
The thing that makes the deal borderline is the boundary, not the story.

**A soft read can never produce Not Eligible.** It can move a deal from Eligible to Borderline, and that is
its ceiling. "The operator looks thin for this business plan" is a reason to put a human on a file, not a
reason to hand a borrower a confident no on the strength of a judgment call. Also tested.

One smaller decision worth naming: **missing data reads as neutral, never as a concern.** If a submission
says nothing about the sponsor's track record, that is an incomplete form, not a red flag, and the tool says
`"Not assessed: no prior-deal count given for the sponsor"` rather than quietly counting it against the deal.

---

## Data model

Nine synthetic profiles in `src/data/lenders.js`, each carrying:

- **Loan size range** — min and max
- **Property types / industries covered**, and an explicit **excluded** list (the excluded list is checked
  first and cited differently from "not covered", because being on a lender's exclusion list and simply
  being outside their focus are different conversations)
- **Geography served** — either an explicit state list or nationwide-minus-exclusions
- **LTV cap**
- **Max exposure per property type**, plus how much is *already committed* to each type, so the check is
  against remaining capacity rather than a headline number
- **One or two soft criteria in plain language** — e.g. *"Prefers experienced operators, with at least three
  completed projects in the same asset class"*, *"Cautious on ground-up construction; prefers stabilized or
  lightly repositioned business plans"*

Every criterion stores its plain-language `text` alongside the machine-readable values, and the engine quotes
that `text` verbatim. The citation is the product, so it is authored prose rather than something assembled
from field names at render time.

Each soft criterion also carries a machine-checkable `signal` (`{kind: 'min-prior-deals', min: 3}`). That is
what makes offline mode a real evaluator instead of a stub: the deterministic path checks the actual signal
rather than guessing from keywords, and there is a test asserting every signal kind in the data has an
evaluator, so offline mode can't silently develop holes.

---

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/config` | Property types, project stages, margin thresholds, whether the LLM pass is live |
| `GET /api/lenders` | All nine synthetic profiles |
| `GET /api/examples` | The three worked examples with their expected outcomes |
| `POST /api/evaluate` | `{"deal": {...}, "softMode": "auto" \| "deterministic" \| "llm"}` → verdicts |

```bash
curl -s -X POST localhost:3000/api/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"deal":{"loanAmount":"$6,900,000","propertyType":"industrial-warehouse",
       "state":"az","ltv":68.5,"projectStage":"stabilized",
       "sponsor":{"priorDealsSameAssetClass":4},
       "tenancy":{"leaseTermRemainingYears":4,"tenantCreditRated":false}}}'
```

`softMode` is useful for demoing: `"deterministic"` forces the offline path even when a key is set, so you
can show both behaviours side by side.

---

## Testing

```bash
npm test
```

18 tests, `node:test`, no dependencies, no API key, no network. They cover all three required worked examples
end to end (verdict, driver kind, the exact criterion quoted, and the presence of the specific numbers in the
cited reason), plus the invariants above, hard-failure precedence, exposure-cap arithmetic against committed
capital, the margin thresholds at their exact edges (67.9% clears a 70% cap, 68.1% does not), input coercion,
and data hygiene across the profile set.

The tests assert against the same `expect` blocks the README table is built from, which is deliberate: if
someone changes a threshold or a lender's numbers, the tests fail rather than this document becoming wrong.

---

## Honest limitations

**The lender data is synthetic and that is the biggest limitation by far.** Nine invented profiles with round
numbers are enough to demonstrate the mechanism and nothing else. Real criteria are messier, change without
notice, vary by relationship and by loan officer, and frequently are not written down anywhere you can read.
The interesting and unsolved problem is getting real criteria into this shape and keeping them current; this
prototype assumes that problem away entirely.

**The deterministic hard-filter logic will not generalize to arbitrary criteria phrasing without more
structure.** The engine can check five specific criterion types because each one has a known field and a
known comparison. A real lender sheet says things like *"we'll go to 75% but only with a personal guarantee
and 1.30x coverage,"* or *"no rural markets under 50,000 population,"* or *"we'll stretch on size for a
sponsor we've closed with before."* Each of those needs its own structured representation and its own
comparison operator. Bolt on enough of them and the schema stops looking like five fields and starts looking
like a small rules language — which is a real design problem, not a matter of adding cases. Nothing here
parses free-text criteria into checks; the structure is authored by hand.

**Soft-criteria calibration is hand-tuned, not learned.** The margin thresholds — 10% of a loan-size bound,
2 points of LTV, 10% of an exposure cap — are numbers I chose because they felt like the right width for a
demo. They are not derived from any data about how often deals at those distances actually close. The same
goes for the deterministic soft evaluators: the mapping from "4 years of lease term against a 10-year
preference" to `concern` is a threshold I wrote, not a calibration. A real version would need labelled
outcomes to tune against, and would likely find that the right margin differs per lender and per criterion.

**Further, smaller things that are true:**

- The exposure check runs against a **static committed-capital snapshot** in the profile. Real portfolio
  exposure moves daily and would need a live feed; a stale number here produces a confidently wrong citation,
  which is worse than no citation.
- **The LLM soft pass is unevaluated.** Its output is schema-validated and discarded wholesale if any
  criterion is missing or any value is illegal, which protects the verdict logic from malformed responses.
  It does not protect against a response that is well-formed and wrong. There is no eval set here, and the
  two paths can disagree on the same deal with no mechanism to say which was right.
- **One property, one loan, one point in time.** No portfolio deals, no cross-collateralization, no
  construction draw schedules, no pricing, no DSCR, no debt yield, no recourse structure — several of which
  would in practice outrank LTV in deciding whether a deal fits.
- The `narrative-flag` soft evaluator is a **keyword scan** over the deal notes, and is the weakest thing in
  the codebase. It is left in deliberately as the clearest illustration of what the LLM pass is actually for:
  reading a paragraph and noticing that "the whole town works at one plant" means single-demand-driver risk,
  which no keyword list will catch.
- **Verdict precedence is a judgment call.** When a deal fails several hard criteria at once, the tool cites
  the most absolute one first (excluded asset class, then geography, then loan size, then LTV, then
  exposure), on the theory that leverage and exposure are the two most likely to change with more equity or
  with time. The others are listed underneath rather than hidden, but the ordering itself is a defensible
  opinion rather than a fact.

---

## Layout

```
server.js                     Express app, four endpoints
src/data/lenders.js           9 synthetic lender profiles + controlled vocabularies
src/data/examples.js          The 3 worked examples, with their expected outcomes
src/engine/hardFilter.js      Deterministic hard criteria + the margin check
src/engine/softFilter.js      Deterministic evaluators + the optional LLM pass
src/engine/evaluate.js        Verdict assembly and precedence
src/engine/normalizeDeal.js   Input coercion and validation
src/engine/format.js          Money / percentage formatting
public/                       Plain JS + CSS front end, no build step
test/smoke.test.js            18 offline tests
```
