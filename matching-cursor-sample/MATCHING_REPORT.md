# Proposal Matching Report

## Overview

This report documents the matching of `snapshot_stage` and `tally_stage` entries to their canonical `proposal_id` from the `proposal` table in the Arbitrum DAO governance workflow.

## Workflow Context

1. **Forum (proposal table)**: Users write proposals on the forum, creating the canonical `proposal` record
2. **Snapshot (snapshot_stage)**: Proposals that gain acceptance move to off-chain voting on Snapshot
3. **Tally (tally_stage)**: Proposals that pass off-chain voting move to on-chain voting on Tally

## Matching Methodology

### Strategies Used (in priority order)

1. **Manual Overrides** (highest priority)
   - Applied for known edge cases where titles significantly differ
   - Examples: "ArbOS 20" → "ArbOS Version 20 Atlas", "Safeguarding Software Developers" → "Defending Open Source"

2. **Fuzzy Title Matching** (primary method)
   - Full ratio matching for exact/near-exact matches
   - Partial ratio matching for titles with additions (e.g., "[UPDATED]" prefixes)
   - Token set ratio for word order variations
   - Minimum confidence threshold: 75% for Tally, 70% for Snapshot

3. **Forum Link Extraction** (supplementary)
   - Extracts `forum.arbitrum.foundation` links from snapshot body/tally description
   - Matches link slugs against proposal titles
   - Used when title matching doesn't provide a high-confidence match
   - Filters out generic program links (STIP, LTIPP references)

4. **Title Normalization**
   - HTML entity decoding
   - Removal of common prefixes: `[Constitutional]`, `[Non-Constitutional]`, `AIP:`, `RFC:`, `Proposal:`, `#`, `[UPDATED]`
   - Case normalization

### Special Category Handling

- **STIP/LTIPP Protocol Proposals**: Identified by patterns like "STIP Proposal - Round 1", "LTIPP Council Recommended Proposal" - these are protocol-specific grant applications without individual forum proposals
- **Elections**: Identified by patterns like "Security Council Election", "Domain Allocator Election" - these are voting events without forum proposals
- **Internal Votes**: TMC Recommendations, GCP Council votes, etc. - governance decisions without forum proposals

## Results Summary

### Tally Stage (83 total entries)

| Category | Count | Percentage |
|----------|-------|------------|
| ✓ Matched (≥75% confidence) | 78 | 94.0% |
| ⚠ Low confidence (60-74%) | 1 | 1.2% |
| ✗ Unmatched | 4 | 4.8% |

**Unmatched Tally entries** (test/garbage data):
- `art dra` - Test data
- `AIP 4` - Incomplete title
- `Arcubtang` - Test data
- Empty title entry

### Snapshot Stage (399 total entries)

| Category | Count | Percentage |
|----------|-------|------------|
| ✓ Matched by title | 147 | 36.8% |
| ✓ Matched by forum link | 2 | 0.5% |
| ⚠ Low confidence | 14 | 3.5% |
| ○ STIP Round 1 (no forum) | 97 | 24.3% |
| ○ LTIPP (no forum) | 93 | 23.3% |
| ○ STIP Addendum (no forum) | 18 | 4.5% |
| ○ Elections (no forum) | 27 | 6.8% |
| ✗ Other unmatched | 15 | 3.8% |

**Note**: The 51.6% "unmatched" rate is expected - STIP/LTIPP are protocol-specific grant applications submitted directly for voting, and elections are voting events. Neither category has individual forum proposals.

## Output Files

### tally_stage_final.json
- Contains all 83 tally_stage entries
- 78 entries have `proposal_id` populated (94.0%)
- 5 entries remain with `proposal_id: null` (test data + low confidence)

### snapshot_stage_final.json
- Contains all 399 snapshot_stage entries  
- 149 entries have `proposal_id` populated (37.3%)
- 250 entries remain with `proposal_id: null`:
  - 206 STIP/LTIPP protocol proposals (expected)
  - 27 Elections (expected)
  - 14 Low confidence matches
  - 3 Truly unmatched

### review_report_final.json
- Detailed lists of items needing manual review
- Low confidence matches that may need verification
- Unmatched entries for investigation

## Items Requiring Manual Review

### Tally Low Confidence (1 item)
| Score | Tally Title | Matched Proposal |
|-------|-------------|------------------|
| 74 | AIP 6: Security Council Elections Proposed Implementation | Security Council Election Process Improvement |

This is likely a correct match.

### Snapshot "Other" Unmatched (15 items)
These are mostly internal governance votes without forum proposals:
- TMC Recommendations (3)
- GCP Council votes (3)
- GMC/STEP Committee approvals (3)
- GovMonth Sensemaking (2)
- Furucombo's Misuse of Funds (1)
- Grant Request - Curve Finance (1)
- Consolidate Security Proposals (1)
- DeDaub ADPC Advisor Approval (1)

## Recommendations

1. **Tally Stage**: 94.0% match rate is excellent. The 5 unmatched entries are test/garbage data that can be cleaned up.

2. **Snapshot Stage**: 37.3% direct match rate is appropriate given that 51.6% are STIP/LTIPP protocol proposals and 6.8% are elections - neither category should have forum proposals.

3. **Data Quality**: Consider cleaning up test/garbage entries (`art dra`, `Arcubtang`, `AIP 4`) from tally_stage.

4. **Low Confidence Review**: The 14 low-confidence snapshot matches should be manually verified.

## Technical Notes

- Matching script: `match_final.py`
- Uses `rapidfuzz` library for fuzzy string matching
- Forum link extraction parses `forum.arbitrum.foundation/t/{slug}/{topic_id}` patterns
- Manual overrides handle cases where title variations are too significant for fuzzy matching
