# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""ParaShield: parametric event insurance claim adjudication on GenLayer.

Parametric insurance pays on a measurable trigger, not on a loss
adjuster's visit: if 24-hour rainfall passes the threshold in the
policy, the claim pays; if it does not, it does not. The idea is
simple, but the argument never is. Was the trigger really met? Did
an exclusion clause apply? Did the filed sources actually show the
number, or did somebody quote a headline and hope nobody checks?

Today those questions are settled by the insurer's own claims desk,
which is also the party that pays. ParaShield moves the argument
to a place neither side controls. Anyone files a claim together
with the policy terms, the trigger condition, and the public
sources that should prove it: a national meteorological record,
an official disaster report, a reputable news measurement. GenLayer
validators then fetch those sources live, on-chain, and judge what
they actually show. The decision becomes shared on-chain state
instead of one more email thread with the insurer.

Why this needs GenLayer
-----------------------
Whether a source confirms a trigger is a judgement call, not a
computation, and the evidence itself lives on the open web, outside
any ordinary contract's reach. A single backend LLM call is one
opinion, and it never touches the source. ParaShield puts the whole
job through validator consensus:

1. Deterministic code owns everything that can be decided exactly:
   input bounds, claim identity, lifecycle transitions, and
   storage. No LLM output can file a claim, change a filer, or move
   a record to a state the lifecycle forbids.
2. Each validator independently fetches the filed source URLs live
   (gl.nondet.web.render, text mode) and reads what they show.
   Fetched page text is never stored and never compared: pages
   change, and validators may legitimately see slightly different
   bytes. Consensus is on the decision, not on the page.
3. The LLM judges exactly one decision: the verdict (APPROVED /
   DENIED / UNVERIFIED) and a reason category from a closed
   list. Its summary is stored as context only and never drives a
   transition.
4. Equivalence principle: a validator re-runs the same assessment
   and must agree exactly on the two decision fields, verdict and
   category. Summary wording is deliberately not compared, because
   models phrase the same judgement differently. A validator that
   reaches a different verdict or category disagrees, and a
   malformed leader output is rejected, never agreed on.
5. State is written only after consensus, in deterministic code.

How sources and terms are weighed (prompt rule, not code)
----------------------------------------------------------
Official, meteorological, and registry sources (national weather
services, official disaster reports, established measurement
records) outweigh self-statements by any interested party. A
trigger counts as met only when at least one loaded source
confirms it. A policy exclusion, when it applies, takes precedence
over a satisfied trigger: a met trigger inside an excluded event
is DENIED, not APPROVED. DENIED is for triggers that fail or are
excluded; UNVERIFIED is reserved for sources that do not cover
the trigger at all, or that cannot be loaded.

Lifecycle
---------
FILED -> DECIDED (verdict APPROVED, DENIED or UNVERIFIED).
DECIDED is terminal: a corrected claim is filed as a new record
instead of rewriting history, so the docket stays an honest public
record of what was claimed and what the sources showed.

Scope and limits (see README.md and MECHANISM.md)
-------------------------------------------------
* Claim ids are at most 64 characters, [A-Za-z0-9_-]; subjects are
  1-128 characters; event descriptions are 10-500 characters;
  policy terms are 10-1000 characters; trigger conditions are
  10-300 characters; each claim files 1-3 source URLs, each at most
  500 characters, https only.
* The verdict judges the filed sources only. It does not audit a
  weather station, verify that a source document itself is genuine,
  or pay out any funds: ParaShield is the adjudication layer, not
  the insurer's treasury. A forged measurement page would fool any
  reader, including validators.
* Fetched page text is truncated to 6000 characters per source
  before it reaches the prompt, so very long reports are judged on
  their opening sections. Filers should link the specific page or
  section that carries the measurement, not a report homepage.
* If every source fails to load, the verdict is UNVERIFIED with
  category source_unreachable, without an LLM call. If only some
  sources load, the verdict is judged on the ones that did.
* This file is intentionally self-contained for Studio deployment:
  it imports only ``json`` besides the GenLayer SDK, and all pure
  helpers are module-level so they can be unit-tested without a node.
* No chain interaction, payment, or private key is involved in this
  file. Deployment is described in DEPLOY.md; recorded deployments
  are listed in evidence/EVIDENCE.md.
"""

from genlayer import *

import json

MAX_CLAIM_ID_CHARS = 64
MAX_SUBJECT_CHARS = 128
MAX_EVENT_CHARS = 500
MIN_EVENT_CHARS = 10
MAX_POLICY_CHARS = 1000
MIN_POLICY_CHARS = 10
MAX_TRIGGER_CHARS = 300
MIN_TRIGGER_CHARS = 10
MAX_SOURCE_URL_CHARS = 500
MAX_SOURCES = 3
MAX_FETCH_CHARS = 6000
MAX_SUMMARY_CHARS = 500
MIN_SUMMARY_CHARS = 10

VERDICTS = ("APPROVED", "DENIED", "UNVERIFIED")
CATEGORIES = (
    "trigger_met",
    "trigger_not_met",
    "exclusion_applies",
    "insufficient_evidence",
    "source_unreachable",
    "policy_unclear",
)


def _fail(code, detail=""):
    raise gl.vm.UserError(code + (": " + detail if detail else ""))


def _validate_text(value, label, min_chars, max_chars):
    if not isinstance(value, str) or not value.strip():
        _fail("INVALID_INPUT", label + " must be a non-empty string")
    if len(value) < min_chars or len(value) > max_chars:
        _fail(
            "INVALID_INPUT",
            label
            + " must be "
            + str(min_chars)
            + "-"
            + str(max_chars)
            + " characters",
        )


def _validate_claim_id(claim_id):
    if not isinstance(claim_id, str) or not claim_id:
        _fail("INVALID_INPUT", "claim_id must be a non-empty string")
    if len(claim_id) > MAX_CLAIM_ID_CHARS:
        _fail("INVALID_INPUT", "claim_id is too long")
    for ch in claim_id:
        if not (ch.isalnum() or ch in ("-", "_")):
            _fail(
                "INVALID_INPUT",
                "claim_id may only contain letters, digits, - and _",
            )


def _validate_source_url(url, label):
    if not isinstance(url, str) or not url.strip():
        _fail("INVALID_INPUT", label + " must be a non-empty string")
    if len(url) > MAX_SOURCE_URL_CHARS:
        _fail("INVALID_INPUT", label + " is too long")
    if not url.startswith("https://"):
        _fail("INVALID_INPUT", label + " must start with https://")


def _sanitize_prompt_text(text):
    """Remove forged prompt-boundary markers from user-supplied text.

    The filed subject, event, policy, and trigger texts are treated
    as data, never as instructions. A closing tag such as
    ``</claim>`` inside the text must not be able to end the data
    section early, so any tag whose name (after stripping
    whitespace, slashes and case) is ``claim``, ``source``,
    ``subject``, ``event``, ``policy`` or ``trigger`` is replaced
    with ``[removed]``, as is any ``===...===`` segment whose inner
    text mentions one of them. The replacement is shorter than any
    marker it replaces, so sanitisation never expands the text.
    Only the prompt copy is affected; the stored record keeps the
    original text.
    """
    watched = ("claim", "source", "subject", "event", "policy", "trigger")
    out = []
    i = 0
    n = len(text)
    while i < n:
        if text[i] == "<":
            j = text.find(">", i + 1)
            if j != -1:
                raw = text[i + 1 : j].strip().strip("/").strip().lower()
                if raw in watched:
                    out.append("[removed]")
                    i = j + 1
                    continue
            out.append(text[i])
            i += 1
            continue
        if text.startswith("===", i):
            j = text.find("===", i + 3)
            if j != -1:
                inner = text[i + 3 : j].strip().lower()
                if any(word in inner for word in watched):
                    out.append("[removed]")
                    i = j + 3
                    continue
        out.append(text[i])
        i += 1
    return "".join(out)


def _parse_verdict(raw):
    # Accepts the dict returned by response_format="json" or a JSON
    # string. Returns a verdict dict or None. The summary is
    # truncated, never rejected for length: only verdict and
    # category drive consensus, and a long summary must not void
    # an otherwise agreed decision.
    try:
        data = raw if isinstance(raw, dict) else json.loads(raw)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    verdict = data.get("verdict")
    category = data.get("category")
    summary = data.get("summary")
    if verdict not in VERDICTS or category not in CATEGORIES:
        return None
    if not isinstance(summary, str) or len(summary.strip()) < MIN_SUMMARY_CHARS:
        return None
    return {
        "verdict": verdict,
        "category": category,
        "summary": summary.strip()[:MAX_SUMMARY_CHARS],
    }


class ParaShield(gl.Contract):
    claims: TreeMap[str, str]
    id_index: TreeMap[str, str]
    claim_count: u32

    def __init__(self):
        self.claims = TreeMap()
        self.id_index = TreeMap()
        self.claim_count = u32(0)

    def _load(self, claim_id):
        _validate_claim_id(claim_id)
        raw = self.claims.get(claim_id, "")
        if raw == "":
            _fail("NOT_FOUND", "claim does not exist")
        return json.loads(raw)

    def _store(self, record):
        self.claims[record["claim_id"]] = json.dumps(record, sort_keys=True)
        return json.dumps(record, sort_keys=True)

    @gl.public.write
    def file_claim(
        self,
        claim_id,
        subject,
        event_description,
        policy_terms,
        trigger_condition,
        source_url_1,
        source_url_2,
        source_url_3,
    ) -> str:
        _validate_claim_id(claim_id)
        _validate_text(subject, "subject", 1, MAX_SUBJECT_CHARS)
        _validate_text(
            event_description, "event_description", MIN_EVENT_CHARS, MAX_EVENT_CHARS
        )
        _validate_text(policy_terms, "policy_terms", MIN_POLICY_CHARS, MAX_POLICY_CHARS)
        _validate_text(
            trigger_condition, "trigger_condition", MIN_TRIGGER_CHARS, MAX_TRIGGER_CHARS
        )
        sources = []
        for label, url in (
            ("source_url_1", source_url_1),
            ("source_url_2", source_url_2),
            ("source_url_3", source_url_3),
        ):
            if url == "":
                continue
            _validate_source_url(url, label)
            sources.append(url)
        if not sources:
            _fail("INVALID_INPUT", "at least one source URL is required")
        if self.claims.get(claim_id, "") != "":
            _fail("CLAIM_EXISTS", "claim_id already used")
        record = {
            "claim_id": claim_id,
            "subject": subject,
            "event_description": event_description,
            "policy_terms": policy_terms,
            "trigger_condition": trigger_condition,
            "sources": sources,
            "filer": str(gl.message.sender_address),
            "status": "FILED",
            "verdict": "",
            "category": "",
            "summary": "",
            "assessment_count": 0,
        }
        # Claim ids are kept in creation order as one newline-joined
        # string under a single index key. This avoids int-to-string
        # key conversion and list-index arithmetic on the chain
        # runtime; see get_claim_id.
        self.id_index["ids"] = self.id_index.get("ids", "") + claim_id + "\n"
        self.claim_count = u32(int(self.claim_count) + 1)
        return self._store(record)

    @gl.public.write
    def assess_claim(self, claim_id) -> str:
        record = self._load(claim_id)
        if record["status"] != "FILED":
            _fail("INVALID_STATUS", "claim is not awaiting assessment")
        event_description = _sanitize_prompt_text(record["event_description"])
        policy_terms = _sanitize_prompt_text(record["policy_terms"])
        trigger_condition = _sanitize_prompt_text(record["trigger_condition"])
        subject = _sanitize_prompt_text(record["subject"])
        sources = record["sources"]

        def leader_fn():
            sections = []
            loaded = 0
            for index, url in enumerate(sources):
                try:
                    page = gl.nondet.web.render(url, mode="text")
                    text = page[:MAX_FETCH_CHARS] if page else ""
                except Exception:
                    text = ""
                if text.strip():
                    loaded += 1
                    sections.append(
                        "[Source "
                        + str(index + 1)
                        + ": "
                        + url
                        + "]\n"
                        + text
                    )
                else:
                    sections.append(
                        "[Source "
                        + str(index + 1)
                        + ": "
                        + url
                        + "]\nFETCH_FAILED"
                    )
            if loaded == 0:
                return {
                    "verdict": "UNVERIFIED",
                    "category": "source_unreachable",
                    "summary": (
                        "None of the filed sources could be loaded, "
                        "so the trigger cannot be judged from evidence."
                    ),
                }
            prompt = (
                "You are a parametric insurance claim adjudicator. "
                "Judge only what the fetched sources show; do not use "
                "outside knowledge to rescue or condemn the claim. "
                "Weigh official, meteorological, and registry sources "
                "above self-statements by any interested party. A "
                "trigger counts as met only when at least one loaded "
                "source confirms it. A policy exclusion, when it "
                "applies, takes precedence over a satisfied trigger. "
                "Return JSON only with keys verdict, category, summary.\n"
                "verdict: APPROVED if the trigger condition is "
                "confirmed by the sources and inside the policy "
                "coverage; DENIED if the trigger condition is not "
                "met or an exclusion clause applies; UNVERIFIED if "
                "the sources do not cover the trigger at all.\n"
                "category: one of trigger_met, trigger_not_met, "
                "exclusion_applies, insufficient_evidence, "
                "source_unreachable, policy_unclear. Use "
                "trigger_met only when a loaded source confirms the "
                "trigger; use exclusion_applies only when a policy "
                "exclusion in the filed terms clearly covers this "
                "event; use policy_unclear only when the filed terms "
                "do not settle whether the event is covered.\n"
                "summary: one or two sentences, 10 to 500 characters, "
                "saying which sources confirm or fail the trigger and "
                "whether any exclusion applies.\n"
                "<subject>\n" + subject + "\n</subject>\n"
                "<event>\n" + event_description + "\n</event>\n"
                "<policy>\n" + policy_terms + "\n</policy>\n"
                "<trigger>\n" + trigger_condition + "\n</trigger>\n"
                + "\n\n".join(sections)
                + "\n"
            )
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            parsed = _parse_verdict(raw)
            if parsed is None:
                raise gl.vm.UserError("LLM_ERROR: verdict could not be parsed")
            return parsed

        def validator_fn(result):
            if not isinstance(result, gl.vm.Return):
                return False
            leader = result.calldata
            if _parse_verdict(leader) is None:
                return False
            try:
                own = leader_fn()
            except Exception:
                return False
            return (
                leader["verdict"] == own["verdict"]
                and leader["category"] == own["category"]
            )

        consensus = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        if _parse_verdict(consensus) is None:
            _fail("CONSENSUS_RESULT_INVALID", "agreed result is not a verdict")
        record["status"] = "DECIDED"
        record["verdict"] = consensus["verdict"]
        record["category"] = consensus["category"]
        record["summary"] = consensus["summary"]
        record["assessment_count"] += 1
        return self._store(record)

    @gl.public.view
    def get_claim(self, claim_id) -> str:
        raw = self.claims.get(claim_id, "")
        return raw

    @gl.public.view
    def get_status(self, claim_id) -> str:
        raw = self.claims.get(claim_id, "")
        if raw == "":
            return "NOT_FOUND"
        return json.loads(raw)["status"]

    @gl.public.view
    def get_claim_count(self) -> str:
        return str(int(self.claim_count))

    @gl.public.view
    def get_claim_id(self, index) -> str:
        ids = self.id_index.get("ids", "")
        if ids == "":
            return ""
        parts = ids.split("\n")
        if index < 0 or index >= len(parts) - 1:
            return ""
        return parts[index]
