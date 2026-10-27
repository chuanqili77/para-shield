# EVIDENCE.md — ParaShield on-chain evidence

All transactions below are on Stable Studionet (chain 61999).
Every transaction was verified individually: FINALIZED, status 7,
`tx_execution_succeeded`. No transaction was resent: each hash
below is the first and only send of its call.

## Canonical contract

- Address: `0xA5241D63222Ed286842538DC786b937ab3f7b54b`
- Explorer:
  https://explorer-studio.genlayer.com/address/0xA5241D63222Ed286842538DC786b937ab3f7b54b
- Contract source SHA-256:
  `436cdf9629ded0773c27d9529a21795e239f5b3582b33d42411b1142a894968e`
  (`contracts/para_shield.py`, unchanged after deployment).
- Deploy tx:
  `0xda7de05e8ae9a0abda7f276d14002180c59197d5db29b9b6b1fce61eff2412b0`

## Local verification (before deployment)

- Stand-in suite `tests/`: 21 passed.
- Direct-mode suite `tests_direct/`: 2 passed.
- Offline check `scripts/check_contract.py`: all passed.
- Linter: passed, 6 methods (4 view, 2 write).

## Demo claims (live validators, live web fetch, no mocks)

Both claims cite the same source:
`https://en.wikipedia.org/wiki/2024_United_Arab_Emirates_floods`.

### demo-uae-rain-200mm — DECIDED / APPROVED / trigger_met

- File tx:
  `0x8d2a076785f44b98a70c9b09e399d5051b89c1d2168b96129474d27c187dc615`
- Assess tx:
  `0x95698346ff16df88e8bc95ea8581e8610857828b94659a8f2bcea03f5f61d558`
- Trigger: "24-hour rainfall in the UAE exceeded 200 millimetres
  during the 16 April 2024 storm."
- Validator summary: "The National Centre of Meteorology recorded
  254.8 mm of rainfall in the Khatm Al Shakla area in less than 24
  hours on 16 April 2024, exceeding the 200 mm trigger."
- Why this is real evidence: the summary quotes the source's own
  figure (254.8 mm, Khatm Al Shakla), which appears only in the
  fetched page — observable proof the validators read the source.

### demo-uae-rain-500mm — DECIDED / DENIED / trigger_not_met

- File tx:
  `0x56244ac2cd2614fc0b9e5720418d6573f433c6170c83a9abaa0507d5ed92f632`
- Assess tx:
  `0x93e3fb5c9b9267a688ef2b9a30207ec719936174fb7c55746c38b30ecc9bcbb4`
- Trigger: "24-hour rainfall in the UAE exceeded 500 millimetres
  during the 16 April 2024 storm."
- Validator summary: "The loaded source cites the UAE National
  Centre of Meteorology and reports the highest 24-hour rainfall was
  254.8 mm at Khatm Al Shakla in Al Ain, not above 500 mm. No loaded
  official meteorological record confirms the 500 mm trigger, so the
  claim is not payable."

### Framing adjustment (recorded honestly)

The original demo sketch said "Dubai, 24-hour rainfall over
200 mm". Checking the source before filing showed the Dubai
airport gauge recorded over 142 mm, while the UAE-wide official
record (Khatm Al Shakla) reached 254.8 mm. The demo wording was
therefore set to "in the UAE" rather than "in Dubai", so the
APPROVED claim is genuinely supported by the cited source. No
claim wording was adjusted after seeing a verdict.

## Frontend write verification (throwaway account)

- Claim: `node-verify-mvr2p0w6`, read back `FILED`.
- Transaction:
  `0x51a31fa5665478de0cb2b8642295d5c6e51d492fb3edef3467a49202536b6546`
  (receipt status 7).
- Filer (throwaway, discarded):
  `0x78bA239C1Cd949f32EFb4e4caeb3C7D0E2350356`.
- Script: `frontend/scripts/verify-frontend-call.mjs`.

The canonical contract holds 3 claims: 2 DECIDED + 1 FILED.

## Integration run

- `tests_integration/test_studionet.py`: 1 passed in 257.00s.
- Machine-readable record: `evidence/studionet_assess.json`.
- Failed attempts in this run: none. The full-flow run deployed,
  filed, and assessed on the first attempt each, with no gateway
  errors and no retries.

## Observed verdict/category combinations (live)

- APPROVED / trigger_met — observed (demo-uae-rain-200mm).
- DENIED / trigger_not_met — observed (demo-uae-rain-500mm).
- UNVERIFIED / source_unreachable — deterministic code path,
  covered by stand-in tests, not observed live.
- DENIED / exclusion_applies, UNVERIFIED / insufficient_evidence,
  UNVERIFIED / policy_unclear — covered by stand-in tests where
  applicable, not observed live. They are untested on-chain, not
  assumed.

## What was not done

- No Studio-UI deployment.
- No Appeal.
- No personal wallet, private key, mnemonic, or real funds used at
  any point. All on-chain callers were gltest auto-generated test
  accounts or a discarded throwaway genlayer-js account.
- No transaction was blindly resent. (None needed resending.)
