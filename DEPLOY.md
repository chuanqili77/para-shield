# DEPLOY.md — Deployment

## Canonical deployment (Stable Studionet)

- Network: Stable Studionet, chain 61999, RPC
  `https://studio.genlayer.com/api`.
- Contract: `contracts/para_shield.py`, class `ParaShield`.
- Contract SHA-256 (deployed source):
  `436cdf9629ded0773c27d9529a21795e239f5b3582b33d42411b1142a894968e`
- Contract address: `0xA5241D63222Ed286842538DC786b937ab3f7b54b`
- Explorer:
  https://explorer-studio.genlayer.com/address/0xA5241D63222Ed286842538DC786b937ab3f7b54b
- Deploy transaction:
  `0xda7de05e8ae9a0abda7f276d14002180c59197d5db29b9b6b1fce61eff2412b0`
  (FINALIZED, status 7, `tx_execution_succeeded`).
- Deployed with the `gltest` CLI path from the reproducible
  environment (see TESTING.md). Studio-UI deployment was not
  performed.

## Demo docket on the canonical contract

Both demo claims cite the same source, the Wikipedia article on
the 2024 United Arab Emirates floods
(`https://en.wikipedia.org/wiki/2024_United_Arab_Emirates_floods`),
so the docket shows one met and one unmet trigger side by side.

| Claim | File tx | Assess tx | Result |
| --- | --- | --- | --- |
| `demo-uae-rain-200mm` | `0x8d2a076785f44b98a70c9b09e399d5051b89c1d2168b96129474d27c187dc615` | `0x95698346ff16df88e8bc95ea8581e8610857828b94659a8f2bcea03f5f61d558` | DECIDED / APPROVED / trigger_met |
| `demo-uae-rain-500mm` | `0x56244ac2cd2614fc0b9e5720418d6573f433c6170c83a9abaa0507d5ed92f632` | `0x93e3fb5c9b9267a688ef2b9a30207ec719936174fb7c55746c38b30ecc9bcbb4` | DECIDED / DENIED / trigger_not_met |

All five transactions FINALIZED, status 7, `tx_execution_succeeded`
verified one by one. The filer of both demo claims is the gltest
auto-generated test account
`0xdE53186D1d1CbAa3956f3ad3c14Ea5173F5861E1`. Full records and
summaries are in `evidence/EVIDENCE.md` and
`evidence/studionet_assess.json`.

Framing note: the 200 mm threshold is judged against the UAE-wide
official record (Khatm Al Shakla, Al Ain, 254.8 mm in less than 24
hours, per the National Centre of Meteorology as cited by the
source), not against the Dubai airport gauge alone, which recorded
over 142 mm. The demo wording says "in the UAE" for exactly this
reason.

## Frontend write verification

The frontend's contract-call layer was exercised from Node with a
throwaway generated genlayer-js account (discarded after the run),
filing claim `node-verify-mvr2p0w6`:

- Transaction:
  `0x51a31fa5665478de0cb2b8642295d5c6e51d492fb3edef3467a49202536b6546`
  (receipt status 7).
- Read back: `FILED`, filer
  `0x78bA239C1Cd949f32EFb4e4caeb3C7D0E2350356`.
- Script: `frontend/scripts/verify-frontend-call.mjs`.

At the original frontend verification, the canonical contract held
3 claims (2 DECIDED + 1 FILED). Browser MetaMask writes were not executed by the author;
the same code path was verified with the throwaway account above.

## Demo site

- Source: `frontend/` (Vite + vanilla JS + genlayer-js 1.1.8).
- Contract address injected via `VITE_CONTRACT_ADDRESS` in
  `frontend/.env` before build; the built bundle was verified to
  contain the canonical address.
- Published on GitHub Pages (gh-pages branch, dist output only):
  https://chuanqili77.github.io/para-shield/ (HTTP 200 verified).

## Reproduce the deployment

From the project root, with the reproducible environment:

```
.venv-repro/bin/gltest --network studionet tests_integration -v -s
```

The integration test deploys a fresh instance, files the two demo
claims, assesses both, and writes `evidence/studionet_assess.json`.
It asserts only closed-set membership for verdicts and categories;
the actual demo verdicts on the canonical instance are recorded in
evidence, not forced by the test.

## Transaction recovery release

The transaction recovery frontend is published on the same demo URL.
The docket now includes the additional synthetic recovery test claim
`recovery-mvsfj809` (4 claims observed: 2 DECIDED and 2 FILED).
See [MILESTONE.md](MILESTONE.md) for the source comparison and the
[recovery evidence](evidence/recovery-studionet.json).
