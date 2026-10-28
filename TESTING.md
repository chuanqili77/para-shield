# TESTING.md — Test suites

All local tests run with the shared reproducible environment
(Python 3.12.3, genlayer-test 0.29.2, genlayer-py 0.16.3,
genvm-linter 0.11.0, pytest 9.1.1; pins in
`requirements.lock.txt`). The environment lives at
`~/workspace/genlayer-ic-candidate/.venv-repro` in the author's
workspace; a clean reproduction is
`python3 -m venv .venv && .venv/bin/pip install -r requirements.lock.txt`.

## Stand-in suite — `tests/` (21 tests)

The real GenLayer SDK is not required. `tests/conftest.py`
installs a small stand-in `genlayer` module implementing exactly
the surface the contract uses, then loads
`contracts/para_shield.py` itself — not a copy of its logic.

Coverage:

- Filing stores a `FILED` record with filer, sources, and count.
- Up to three sources; duplicate ids rejected.
- Input validation: bad id charset, short event/policy/trigger,
  over-long subject, no sources, non-https URL, over-long URL.
- Missing record: `get_claim` returns `""`, `get_status` returns
  `NOT_FOUND`, count `"0"`.
- Assessing a missing claim is rejected.
- `APPROVED` / `trigger_met` on leader-validator agreement.
- Summary wording may differ between leader and validator.
- Verdict disagreement and category disagreement write nothing.
- Malformed LLM output, bad verdict, and short summary write
  nothing.
- All sources failed → `UNVERIFIED` / `source_unreachable`
  without an LLM call.
- Partial fetch still judges the loaded sources.
- `DECIDED` is terminal; re-assessment is rejected.
- Forged prompt tags in the trigger are sanitised; unit tests
  cover `claim`/`source` and `trigger`/`policy` markers.
- Summary parsing truncates to 500 characters; JSON-string
  verdicts are accepted.
- Multiple claims are independent; `get_claim_id` order holds.

Run (separate pytest process — the stand-in replaces the
`genlayer` module in-process):

```
.venv-repro/bin/python -m pytest tests -q
```

## Direct-mode suite — `tests_direct/` (2 tests)

Runs the contract in-process with the real GenVM via the
genlayer-test direct fixtures. No network call, no chain
transaction: deploy-and-empty-view, and file-claim.

Run (separate pytest process from the stand-in suite):

```
.venv-repro/bin/python -m pytest tests_direct -q
```

Direct mode needs a GenVM artifact. If a fresh download fails
(HTTP 404 on the release asset), reuse the genvm-linter cached
tarball under `~/.cache/gltest-direct/`.

## Offline static check — `scripts/check_contract.py`

No network, no keys. Checks the GenVM dependency header, minimal
imports (`genlayer`, `json` only), the 6 public methods and their
view/write kinds and `str` returns, `TreeMap`/`u32` storage,
presence of `gl.nondet.exec_prompt`, `gl.nondet.web.render`, and
`gl.vm.run_nondet_unsafe`, absence of `gl.evm`, and the pinned
Studionet configuration in `network.json`.

## Linter

```
.venv-repro/bin/genvm-lint check contracts/para_shield.py
```

Expected: lint passed, 6 methods (4 view, 2 write).

## Studionet integration — `tests_integration/`

Runs against Stable Studionet (chain 61999) with live validators
and live web fetches. No mocked LLM, no mocked fetch. See
`tests_integration/test_studionet.py` and the recorded evidence in
`evidence/EVIDENCE.md`. The integration test must run through
pytest (the `gltest.config.yaml` only loads under pytest); a plain
script calling `get_contract_factory` fails because the
contracts-dir config is None outside pytest.

```
.venv-repro/bin/gltest --network studionet tests_integration -v -s
```

## Transaction recovery update

From `frontend/`, run `npm ci`, `npm test` and `npm run build`.
`npm run verify:recovery` resumes the recorded public test transaction by
reading `../evidence/recovery-pending.json`; it does not rebroadcast it.
See `MILESTONE.md` for scope, evidence and verification limits.
