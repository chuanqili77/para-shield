# MECHANISM.md — How ParaShield decides

## The problem in one paragraph

A parametric claim is a bet on a number: "24-hour rainfall exceeded
200 mm". Both sides can read the same public measurement and still
disagree, because the policy terms, the trigger wording, and the
source quality are all contestable. The insurer grading its own
claims is a conflict of interest; a court is slow and expensive.
ParaShield replaces both with validator consensus over live web
evidence.

## What is deterministic, what is judged

Deterministic code owns everything that can be decided exactly:

- Input bounds (lengths, id charset, `https://` sources, at least
  one source, duplicate-id rejection).
- Claim identity and lifecycle: `FILED` → `DECIDED`, and `DECIDED`
  is terminal. No transition can be forced by an LLM output.
- Storage: records are JSON strings in a `TreeMap`, ids are kept
  in creation order as one newline-joined string under a single
  index key, and the count is a `u32` incremented with
  `u32(int(x) + 1)`. These shapes are the ones verified to work on
  the Studionet validator runtime; `DynArray` storage is not
  assumed to work there.
- The all-sources-failed path: when no filed source loads, the
  verdict is `UNVERIFIED` / `source_unreachable` in deterministic
  code, with no LLM call at all.

The LLM judges exactly one decision: the verdict (`APPROVED` /
`DENIED` / `UNVERIFIED`) and a reason category from a closed list
(`trigger_met`, `trigger_not_met`, `exclusion_applies`,
`insufficient_evidence`, `source_unreachable`, `policy_unclear`).
Its one-or-two-sentence summary is stored as context only and
never drives a transition.

## The assessment flow

1. `assess_claim` loads the record and rejects anything not
   `FILED`.
2. The leader function fetches each filed source with
   `gl.nondet.web.render(url, mode="text")`, truncated to 6000
   characters per source. A failed fetch contributes a
   `FETCH_FAILED` marker for that source.
3. If no source loaded, the deterministic `UNVERIFIED` /
   `source_unreachable` result is returned.
4. Otherwise the leader builds a prompt: a short adjudicator
   instruction, the weighing rules below, the filed subject, event,
   policy terms, and trigger condition (each sanitised, see below),
   and the fetched source sections. `gl.nondet.exec_prompt` returns
   JSON, parsed strictly: verdict and category must be in their
   closed lists, and the summary must be 10–500 characters after
   trimming (longer summaries are truncated, never rejected).
5. `gl.vm.run_nondet_unsafe` hands the leader result to every
   validator, which re-runs the same assessment independently and
   accepts only if its own verdict and category match the leader's
   exactly. Summary wording is deliberately not compared.
6. Only after consensus returns does deterministic code write
   `DECIDED`, the verdict, the category, the summary, and an
   incremented assessment count.

Fetched page text is never stored and never compared. Pages change,
and validators may legitimately see slightly different bytes.
Consensus is on the decision, not on the page.

## Weighing rules (prompt, not code)

- Official, meteorological, and registry sources outweigh
  self-statements by any interested party.
- A trigger counts as met only when at least one loaded source
  confirms it.
- A policy exclusion, when it applies, takes precedence over a
  satisfied trigger: a met trigger inside an excluded event is
  `DENIED` / `exclusion_applies`, not `APPROVED`.
- `DENIED` is for triggers that fail or are excluded.
  `UNVERIFIED` is reserved for sources that do not cover the
  trigger at all, or that cannot be loaded.
- `policy_unclear` is only for filed terms that do not settle
  whether the event is covered; it is not a fallback for weak
  evidence.

## Prompt-boundary sanitisation

Filed texts are data, never instructions. Before they enter the
prompt, any tag whose name (after stripping whitespace, slashes,
and case) is `claim`, `source`, `subject`, `event`, `policy`, or
`trigger` is replaced with `[removed]`, as is any `===...===`
segment whose inner text mentions one of them. Only the prompt copy
is affected; the stored record keeps the original text. The
replacement is shorter than any marker it replaces, so sanitisation
never expands the text.

## What consensus does not guarantee

- That a source document is genuine. Validators read what the URL
  serves; a forged measurement page would fool any reader.
- That the summary prose is identical across validators. Only
  verdict and category are compared.
- That every verdict/category combination has been observed live.
  See evidence/EVIDENCE.md for the combinations actually observed.
