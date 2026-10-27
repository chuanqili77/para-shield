"""Direct-mode smoke tests for ParaShield, using the real GenVM.

These tests are separate from tests/test_para_shield.py: they
require the genlayer-test direct fixtures, which are only available
in the reproducible environment. They make no network call and no
chain transaction: direct mode runs the contract in-process.

Run only with the reproducible environment, from the project root:
    .venv-repro/bin/python -m pytest tests_direct -v
"""

import json


def test_direct_deploy_and_empty_view(direct_deploy):
    contract = direct_deploy("contracts/para_shield.py")
    assert contract.get_claim_count() == "0"
    assert contract.get_status("missing") == "NOT_FOUND"
    assert contract.get_claim("missing") == ""


def test_direct_file_claim(direct_deploy):
    contract = direct_deploy("contracts/para_shield.py")
    result = contract.file_claim(
        "direct-smoke",
        "Rainfall parametric policy, Al Ain station",
        "On 16 April 2024 heavy rains caused floods across the UAE, with the highest rainfall recorded in the Khatm Al Shakla area in Al Ain.",
        "The policy pays out when the stated trigger condition is met by official meteorological records for the insured event.",
        "24-hour rainfall in the UAE exceeded 200 millimetres during the 16 April 2024 storm.",
        "https://example.org/national-weather-service",
        "",
        "",
    )
    record = json.loads(result)
    assert record["status"] == "FILED"
    assert record["sources"] == ["https://example.org/national-weather-service"]
    assert contract.get_claim_count() == "1"
    assert contract.get_claim_id(0) == "direct-smoke"
    assert contract.get_claim_id(1) == ""
