"""Studionet integration test for ParaShield (real chain, real validators).

Run ONLY with the reproducible environment, from the project root:
    .venv-repro/bin/gltest --network studionet tests_integration -v -s

Deploys one contract instance on Stable Studionet (61999), files two
demo claims against the same stable public source (the Wikipedia
article on the 2024 United Arab Emirates floods), and runs
live-validator assessments that fetch that source on-chain. No mocked
LLM and no mocked web fetch is used. The test asserts only what the
design guarantees: each assessment completes, the status becomes
DECIDED, and the verdict and category are members of their closed
sets. The actual verdicts are printed as JSON evidence lines and
archived in evidence/, not forced to particular values here, because
live validators judge the fetched sources independently.

Demo claims (both cite the same source on purpose, so the docket
shows one met trigger and one unmet trigger side by side):
- demo-uae-rain-200mm: "24-hour rainfall in the UAE exceeded 200
  millimetres during the 16 April 2024 storm." The source states the
  highest official measurement was 254.8 mm in less than 24 hours,
  so the trigger is met.
- demo-uae-rain-500mm: "24-hour rainfall in the UAE exceeded 500
  millimetres during the 16 April 2024 storm." The same source caps
  the highest measurement at 254.8 mm, so the trigger is not met.

Note on framing: the 200 mm threshold is judged against the UAE-wide
official record (Khatm Al Shakla, Al Ain, 254.8 mm), not against the
Dubai airport gauge alone, which recorded over 142 mm. The demo
wording says "in the UAE" for exactly this reason.

Do NOT run this file against another network without reviewing it
first, and do NOT use it for Appeal.
"""

import json
from pathlib import Path

from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded
from gltest.types import TransactionStatus

SOURCE = "https://en.wikipedia.org/wiki/2024_United_Arab_Emirates_floods"
VERDICTS = ("APPROVED", "DENIED", "UNVERIFIED")
CATEGORIES = (
    "trigger_met",
    "trigger_not_met",
    "exclusion_applies",
    "insufficient_evidence",
    "source_unreachable",
    "policy_unclear",
)
EVENT = (
    "On 16 April 2024 heavy rains caused floods across the UAE, with "
    "the highest rainfall recorded in the Khatm Al Shakla area in Al Ain."
)
POLICY = (
    "The policy pays out when the stated trigger condition is met by "
    "official meteorological records for the insured event. Exclusions: "
    "damage from events outside the policy period, and claims not "
    "supported by at least one official record."
)


def _receipt_info(receipt):
    info = {}
    for key in ("hash", "transaction_hash", "tx_hash", "status",
                "consensus_status", "execution_result", "result",
                "contract_address", "address"):
        try:
            value = receipt.get(key)
        except Exception:
            value = None
        if value is not None:
            info[key] = str(value)
    info["raw_keys"] = sorted(list(receipt.keys())) if hasattr(receipt, "keys") else []
    return info


def test_studionet_full_flow():
    factory = get_contract_factory(contract_file_path="para_shield.py")
    deploy_receipt = factory.deploy_contract_tx(
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    assert tx_execution_succeeded(deploy_receipt), deploy_receipt
    from gltest.utils import extract_contract_address
    address = extract_contract_address(deploy_receipt)
    contract = factory.build_contract(contract_address=address)
    print("\nEVIDENCE_PARA_DEPLOY " + json.dumps({
        "contract_address": str(address),
        "deploy_receipt": _receipt_info(deploy_receipt),
    }, sort_keys=True))

    claims = [
        (
            "demo-uae-rain-200mm",
            "UAE April 2024 rainstorm parametric claim",
            "24-hour rainfall in the UAE exceeded 200 millimetres during the 16 April 2024 storm.",
        ),
        (
            "demo-uae-rain-500mm",
            "UAE April 2024 rainstorm parametric claim",
            "24-hour rainfall in the UAE exceeded 500 millimetres during the 16 April 2024 storm.",
        ),
    ]
    for claim_id, subject, trigger in claims:
        receipt = contract.file_claim(
            args=[claim_id, subject, EVENT, POLICY, trigger, SOURCE, "", ""]
        ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
        assert tx_execution_succeeded(receipt), receipt
        print("EVIDENCE_PARA_FILE " + json.dumps({
            "contract_address": str(address),
            "claim_id": claim_id,
            "file_receipt": _receipt_info(receipt),
        }, sort_keys=True))

    out = {"contract_address": str(address), "claims": {}}
    out["deploy_receipt"] = _receipt_info(deploy_receipt)
    for claim_id, _, _ in claims:
        receipt = contract.assess_claim(
            args=[claim_id]
        ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
        assert tx_execution_succeeded(receipt), receipt
        print("EVIDENCE_PARA_ASSESS " + json.dumps({
            "contract_address": str(address),
            "claim_id": claim_id,
            "assess_receipt": _receipt_info(receipt),
        }, sort_keys=True))
        out["claims"][claim_id] = {"assess_receipt": _receipt_info(receipt)}

    records = {}
    for claim_id, _, _ in claims:
        status = contract.get_status(args=[claim_id]).call()
        record = json.loads(contract.get_claim(args=[claim_id]).call())
        records[claim_id] = record
        print("EVIDENCE_PARA_RECORD " + json.dumps({
            "contract_address": str(address),
            "claim_id": claim_id,
            "status": str(status),
            "record": record,
        }, sort_keys=True))
        assert str(status) == "DECIDED"
        assert record["status"] == "DECIDED"
        assert record["verdict"] in VERDICTS
        assert record["category"] in CATEGORIES
        assert record["assessment_count"] == 1
        out["claims"][claim_id]["record"] = record

    count = contract.get_claim_count().call()
    assert int(count) == 2
    assert contract.get_claim_id(args=[0]).call() == "demo-uae-rain-200mm"
    assert contract.get_claim_id(args=[1]).call() == "demo-uae-rain-500mm"
    out["claim_count"] = int(count)
    path = Path("evidence/studionet_assess.json")
    path.write_text(json.dumps(out, indent=2, sort_keys=True))
    print(f"Wrote {path}")
