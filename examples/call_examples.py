"""Example calls for ParaShield (documentation only).

These are not executed by the test suites. They show the exact
argument shapes for the contract's write methods on Stable
Studionet (chain 61999). Use the demo site, or genlayer-js, or
the gltest CLI path described in DEPLOY.md, to run them for real.
No key is involved in this file.
"""

CONTRACT_ADDRESS = "0xA5241D63222Ed286842538DC786b937ab3f7b54b"  # see evidence/EVIDENCE.md
SOURCE = "https://en.wikipedia.org/wiki/2024_United_Arab_Emirates_floods"
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

# 1. File a claim whose trigger the source confirms.
file_claim_args = [
    "demo-uae-rain-200mm",
    "UAE April 2024 rainstorm parametric claim",
    EVENT,
    POLICY,
    "24-hour rainfall in the UAE exceeded 200 millimetres during the 16 April 2024 storm.",
    SOURCE,
    "",
    "",
]

# 2. File a claim whose trigger the same source refutes.
file_claim_args_denied = [
    "demo-uae-rain-500mm",
    "UAE April 2024 rainstorm parametric claim",
    EVENT,
    POLICY,
    "24-hour rainfall in the UAE exceeded 500 millimetres during the 16 April 2024 storm.",
    SOURCE,
    "",
    "",
]

# 3. Run the validator assessment (live web fetch + consensus).
assess_claim_args = ["demo-uae-rain-200mm"]

# 4. Read the decided record back.
get_claim_args = ["demo-uae-rain-200mm"]
get_status_args = ["demo-uae-rain-200mm"]

# 5. Enumerate the docket.
get_claim_count_args = []
get_claim_id_args = [0]
