#!/usr/bin/env python3
"""
Generate matching prompts for Tally and Snapshot entries.

Usage:
    python generate_prompts.py

Outputs:
    - prompts/tally_prompts.json - Array of {id, title, prompt} for each tally entry
    - prompts/snapshot_prompts.json - Array of {id, title, prompt} for each snapshot entry (filtered)
"""

import json
import html
import os
import re

# === CONFIGURATION ===
# Adjust these paths to match your project structure
PROPOSAL_FILE = "proposal.json"
TALLY_FILE = "tally_stage.json"
SNAPSHOT_FILE = "snapshot_stage.json"
OUTPUT_DIR = "prompts"

# === PROMPT TEMPLATE ===
PROMPT_TEMPLATE = """You are matching a governance proposal from {source} to its canonical forum proposal from the Arbitrum DAO forum.

## {source} Entry to Match:
- **ID**: {entry_id}
- **Title**: {entry_title}
- **Author**: {entry_author}
- **Description excerpt**: 
{entry_description}

---

## Candidate Forum Proposals ({num_proposals} total):

{proposals_list}

---

## Task:
1. Analyze the {source} entry and find which forum proposal it corresponds to
2. Consider: title similarity, author match, semantic meaning, description content, and any AIP/proposal numbers
3. Return your answer as JSON only (no markdown, no explanation outside the JSON):

{{"proposal_id": "the-matching-uuid-or-null", "confidence": "high|medium|low|none", "reasoning": "Brief explanation of why this matches or why no match exists"}}

**Important notes:**
- Some entries may not have a corresponding forum proposal (e.g., STIP/LTIPP protocol grants, elections, technical actions, test entries)
- If no match exists, return proposal_id: null
- "high" = very certain, "medium" = likely but not 100% sure, "low" = possible but uncertain, "none" = no match found
- Pay attention to specific identifiers like "AIP 6" or "ArbOS 20" - these should match exactly"""


def load_json(filepath):
    """Load JSON file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def clean_html(text):
    """Clean HTML entities from text."""
    if not text:
        return ""
    return html.unescape(text)


def truncate_text(text, max_length=2000):
    """Truncate text to max length."""
    if not text:
        return "No description available"
    text = clean_html(text)
    if len(text) > max_length:
        return text[:max_length] + "...[truncated]"
    return text


def is_skip_snapshot(title):
    """Check if snapshot entry should be skipped (STIP/LTIPP/Elections)."""
    if not title:
        return True
    
    skip_patterns = [
        r'STIP Proposal - Round 1$',
        r'STIP Addendum$',
        r'LTIPP Council Recommended Proposal$',
        r'STIP Bridge Challenge$',
        r'LTIPP \[Post Council Feedback\]$',
        r'Security Council.*Election',
        r'reconfirmation.*council',
        r'D\.A\.O\..*Elections',
        r'Domain Allocator Election',
        r'Council Election',
        r'ARDC.*Election',
        r'Advisor Elections',
        r'Election of.*Members',
        r'Election of.*Manager',
    ]
    
    for pattern in skip_patterns:
        if re.search(pattern, title, re.IGNORECASE):
            return True
    return False


def is_skip_tally(title):
    """Check if tally entry should be skipped (garbage/test data)."""
    if not title:
        return True
    garbage_titles = ['art dra', 'Arcubtang', 'AIP 4']
    return title.strip() in garbage_titles or len(title.strip()) < 3


def build_proposals_list(proposals):
    """Build the proposals list string for the prompt."""
    lines = []
    for p in proposals:
        p_title = clean_html(p['title'])
        lines.append(f"- **ID**: `{p['id']}`")
        lines.append(f"  **Title**: {p_title}")
        lines.append(f"  **Author**: {p['author_name']}")
        lines.append("")
    return "\n".join(lines)


def generate_prompt(entry, source, proposals_list_str, num_proposals):
    """Generate a single prompt for an entry."""
    description_field = 'description' if source == 'Tally' else 'body'
    
    return PROMPT_TEMPLATE.format(
        source=source,
        entry_id=entry['id'],
        entry_title=clean_html(entry.get('title', 'No title')),
        entry_author=entry.get('author_name', 'Unknown'),
        entry_description=truncate_text(entry.get(description_field, '')),
        num_proposals=num_proposals,
        proposals_list=proposals_list_str
    )


def main():
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Load data
    print("Loading data...")
    proposals = load_json(PROPOSAL_FILE)
    tally_entries = load_json(TALLY_FILE)
    snapshot_entries = load_json(SNAPSHOT_FILE)
    
    print(f"  Proposals: {len(proposals)}")
    print(f"  Tally entries: {len(tally_entries)}")
    print(f"  Snapshot entries: {len(snapshot_entries)}")
    
    # Pre-build proposals list (same for all prompts)
    proposals_list_str = build_proposals_list(proposals)
    num_proposals = len(proposals)
    
    # Generate Tally prompts
    print("\nGenerating Tally prompts...")
    tally_prompts = []
    tally_skipped = 0
    
    for entry in tally_entries:
        title = entry.get('title', '')
        
        if is_skip_tally(title):
            tally_skipped += 1
            continue
        
        prompt = generate_prompt(entry, 'Tally', proposals_list_str, num_proposals)
        tally_prompts.append({
            'id': entry['id'],
            'title': clean_html(title),
            'prompt': prompt
        })
    
    print(f"  Generated: {len(tally_prompts)}")
    print(f"  Skipped (garbage): {tally_skipped}")
    
    # Generate Snapshot prompts
    print("\nGenerating Snapshot prompts...")
    snapshot_prompts = []
    snapshot_skipped = 0
    
    for entry in snapshot_entries:
        title = entry.get('title', '')
        
        if is_skip_snapshot(title):
            snapshot_skipped += 1
            continue
        
        prompt = generate_prompt(entry, 'Snapshot', proposals_list_str, num_proposals)
        snapshot_prompts.append({
            'id': entry['id'],
            'title': clean_html(title),
            'prompt': prompt
        })
    
    print(f"  Generated: {len(snapshot_prompts)}")
    print(f"  Skipped (STIP/LTIPP/Elections): {snapshot_skipped}")
    
    # Save outputs
    tally_output_path = os.path.join(OUTPUT_DIR, 'tally_prompts.json')
    snapshot_output_path = os.path.join(OUTPUT_DIR, 'snapshot_prompts.json')
    
    with open(tally_output_path, 'w', encoding='utf-8') as f:
        json.dump(tally_prompts, f, indent=2, ensure_ascii=False)
    
    with open(snapshot_output_path, 'w', encoding='utf-8') as f:
        json.dump(snapshot_prompts, f, indent=2, ensure_ascii=False)
    
    print(f"\nOutputs saved:")
    print(f"  {tally_output_path}")
    print(f"  {snapshot_output_path}")
    
    # Summary
    print(f"\n=== SUMMARY ===")
    print(f"Total prompts to process: {len(tally_prompts) + len(snapshot_prompts)}")
    print(f"  - Tally: {len(tally_prompts)}")
    print(f"  - Snapshot: {len(snapshot_prompts)}")


if __name__ == "__main__":
    main()
