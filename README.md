# ParaShield — Parametric Event Insurance Claim Adjudication

Parametric insurance pays on a measurable trigger, not on a loss
adjuster's visit: if 24-hour rainfall passes the threshold in the
policy, the claim pays; if it does not, it does not. The idea is
simple, but the argument never is. Was the trigger really met? Did
an exclusion clause apply? Did the filed sources actually show the
number, or did somebody quote a headline and hope nobody checks?

ParaShield moves that argument to a place neither side controls.
Anyone files a claim together with the policy terms, the trigger
condition, and the public sources that should prove it. GenLayer
validators fetch those sources live, on-chain, and must agree
exactly on the verdict and the reason category before the decision
is stored. The decision becomes shared on-chain state instead of
one more email thread with the insurer.

## Verdicts

- **APPROVED** — the trigger condition is confirmed by the sources
  and inside the policy coverage.
- **DENIED** — the trigger condition is not met, or an exclusion
  clause applies.
- **UNVERIFIED** — the sources do not cover the trigger at all, or
  cannot be loaded.

Reason categories (closed list): `trigger_met`, `trigger_not_met`,
`exclusion_applies`, `insufficient_evidence`, `source_unreachable`,
`policy_unclear`.

Lifecycle: `FILED` → `DECIDED`. A decision is terminal; a corrected
claim is filed as a new record.

## Contract

`contracts/para_shield.py` — class `ParaShield`, 6 methods
(4 view / 2 write):

| Method | Type | Purpose |
| --- | --- | --- |
| `file_claim(claim_id, subject, event_description, policy_terms, trigger_condition, source_url_1, source_url_2, source_url_3)` | write | File a claim with 1–3 sources |
| `assess_claim(claim_id)` | write | Run validator consensus and store the verdict |
| `get_claim(claim_id)` | view | Full record JSON, or `""` when missing |
| `get_status(claim_id)` | view | `FILED`, `DECIDED`, or `NOT_FOUND` |
| `get_claim_count()` | view | Number of claims, as a string |
| `get_claim_id(index)` | view | Claim id by creation order, or `""` |

Bounds: id ≤ 64 chars `[A-Za-z0-9_-]`; subject 1–128; event
description 10–500; policy terms 10–1000; trigger condition 10–300;
each source URL ≤ 500 chars, `https://` only, at least one source
required. Empty strings mean "source absent" for slots 2 and 3.

See [MECHANISM.md](MECHANISM.md) for the consensus design,
[TESTING.md](TESTING.md) for the test suites, and
[DEPLOY.md](DEPLOY.md) for deployment. On-chain evidence lives in
[evidence/EVIDENCE.md](evidence/EVIDENCE.md).

## Why GenLayer, not a backend check

Whether a source confirms a trigger is a judgement call, and the
evidence lives on the open web, outside any ordinary contract's
reach. A single backend LLM call is one opinion, and it never
touches the source. ParaShield puts the whole job through validator
consensus: each validator fetches the filed sources live, judges
the trigger, and must agree exactly on verdict and category. The
insurer does not grade its own homework, and neither does the
claimant.

## Try it

1. Open the demo site (link in DEPLOY.md) and connect MetaMask.
   Switch to Stable Studionet (chain 61999) when prompted.
2. The docket lists the two demo claims: one trigger the sources
   confirm, one they refute, both judged against the same source.
3. File your own claim: describe the event, paste the policy terms
   and the trigger condition, add 1–3 source URLs.
4. Run the assessment and watch the verdict land on-chain.

## Sustained use

ParaShield is built to keep being useful after the demo. Every
parametric product — rainfall, wind speed, earthquake magnitude,
flight delay, river level — is the same shape: a number, a
threshold, a public measurement. New claim types need no contract
change, only new filings. The docket is permanent, so a pattern of
denied triggers for one product line becomes visible to everyone,
not just to the insurer's internal reports. That is the point:
parametric insurance only works when both sides trust the
measurement, and a public, consensus-backed record is what makes
the measurement trustworthy.

## Honest limits

- ParaShield adjudicates; it does not pay. No funds move through
  this contract, and a verdict here is not a payout instruction.
- The verdict judges the filed sources only. It does not audit a
  weather station, verify that a source document itself is genuine,
  or detect a forged measurement page: a forged page would fool any
  reader, including validators.
- Fetched page text is truncated to 6000 characters per source, so
  very long reports are judged on their opening sections. Filers
  should link the specific page or section that carries the
  measurement.
- If every source fails to load, the verdict is UNVERIFIED with
  category `source_unreachable`, without an LLM call. A claim whose
  sources are all unreachable therefore cannot be approved, by
  design.
- The demo docket's two claims share one source by design, to show
  one met and one unmet trigger side by side. Live verdicts on other
  claims depend on what their own sources show.
- Studio-UI deployment was not performed; deployment used the
  `gltest` CLI path on Stable Studionet.
- The frontend's MetaMask write path was verified with a throwaway
  genlayer-js account (see evidence), not by the author signing
  with a personal wallet in a browser.
- Not every verdict/category combination has been observed live
  (see evidence for which ones have). Unobserved combinations are
  untested on-chain, not assumed.
- The contract fingerprint is not a cryptographic hash, and the
  summary wording of a verdict is stored as context only: consensus
  covers verdict and category, not prose.
