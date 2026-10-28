# ParaShield: recoverable and verified claim transactions

Baseline: `52a266727ba2609053544ae2e64eca0caa4b5d8a`.

This update adds a transaction journal and recovery workflow to the existing
claim application. It targets accidental repeated submissions and false success
messages during delayed consensus or RPC failures. The adjudication contract
and its public methods are unchanged.

| Behavior | Baseline | This update |
| --- | --- | --- |
| Tracking timeout or page reload | Transaction ID only shown in the current page | Pending ID stored per chain and contract; resume without broadcasting |
| Repeated clicks | No transaction lock | Lock from wallet prompt through verification |
| Multiple tabs | Independent sends | Web Locks coordinate the same deployment in one browser profile |
| Finalized transaction | Immediately shown as sealed | Execution, consensus and affected claim must all verify |
| RPC read-back outage | No persisted recovery | Retain pending record and block another send |
| Wallet changes | Cached account | Invalidate cached connection and check account plus chain before sending |
| Address handling | User-provided address sent directly | Validate address and use checksum address for RPC writes and claim verification |

## Verification

- `cd frontend && npm ci && npm test`: 11 recovery tests, including wallet
  rejection, double-click locking, disagreement, incomplete receipts, wrong
  recipient, failed reads, storage failure and deployment isolation.
- `VITE_CONTRACT_ADDRESS=0xA5241D63222Ed286842538DC786b937ab3f7b54b npm run build`:
  production build passes. Vite reports the existing SDK bundle over 500 kB.
- [Stable Studionet recovery evidence](evidence/recovery-studionet.json):
  transaction `0x98ad1e91db5c840a33bc156a60d5e3337570b13c43f5c9b20933f83533671e37`,
  claim `recovery-mvsfj809`, chain 61999, zero transferred value. Tracking was
  deliberately interrupted after one broadcast, then resumed with a new
  journal instance. Finality, majority agreement and claim read-back passed.
  This is a controlled client interruption, not evidence of a real RPC outage.
- Browser wallet signing and cross-tab UI execution have not been verified
  live. Unit tests exercise the recovery engine; the network script exercises
  the same engine against an actual transaction. Browser installation was
  unavailable in the verification environment.

## Reproduce the network check

`cd frontend && npm run verify:recovery` reuses the saved test transaction
when `evidence/recovery-pending.json` exists, without signing or broadcasting
again. Removing that record deliberately starts a fresh synthetic test claim
with a newly generated test account. Do not use personal keys. The script never
persists the generated key. It does not assess the synthetic claim.

## Submission text

ParaShield now supports durable transaction recovery and verified claim
confirmation. The previous application lost tracking state on reload and
reported success after finalization alone. The update stores pending writes
per deployment, blocks repeated submissions, coordinates tabs, invalidates
changed wallet connections, and checks execution, validator agreement and the
claim read-back before reporting success. Interrupted tracking resumes the
original transaction without another signature or broadcast. Eleven regression
tests and a finalized Stable Studionet recovery transaction document the change.
