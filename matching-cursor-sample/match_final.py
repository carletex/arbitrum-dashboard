#!/usr/bin/env python3
"""
Improved Proposal Matching Script with Forum Link Extraction

Priority order for matching:
1. Forum links extracted from snapshot body -> match by slug similarity to proposal titles
2. Fuzzy title matching (fallback)
3. Manual overrides for edge cases

"""

import json
import re
import html
from collections import defaultdict
from rapidfuzz import fuzz

# Load data
with open('/home/claude/proposal.json', 'r') as f:
    proposals = json.load(f)

with open('/home/claude/snapshot_stage.json', 'r') as f:
    snapshot_stage = json.load(f)

with open('/home/claude/tally_stage.json', 'r') as f:
    tally_stage = json.load(f)

print(f"=" * 80)
print(f"IMPROVED PROPOSAL MATCHING (with Forum Link Extraction)")
print(f"=" * 80)

# Build proposal lookup
proposal_by_id = {p['id']: p for p in proposals}

def normalize_title(title):
    """Normalize title for comparison."""
    if not title:
        return ""
    title = html.unescape(title)
    prefixes = [
        r'^\[?(Non-?Constitutional|Constitutional|RFC|AIP|Draft|DRAFT|NON-CONSTITUTIONAL|FINAL)\]?\s*:?\s*',
        r'^Proposal\s*:?\s*',
        r'^#\s*',
        r'^\[?UPDATED\]?\s*',
        r'^\[?Updated\]?\s*',
    ]
    for prefix in prefixes:
        title = re.sub(prefix, '', title, flags=re.IGNORECASE)
    title = re.sub(r'\s+', ' ', title).strip().lower()
    return title

def title_to_slug(title):
    """Convert title to potential forum slug format."""
    if not title:
        return ""
    title = html.unescape(title).lower()
    # Remove special characters, keep alphanumeric and spaces/hyphens
    title = re.sub(r'[^\w\s-]', '', title)
    # Replace spaces with hyphens
    title = re.sub(r'\s+', '-', title)
    # Remove multiple hyphens
    title = re.sub(r'-+', '-', title)
    return title.strip('-')

def extract_forum_links(text):
    """Extract forum.arbitrum.foundation links from text."""
    if not text:
        return []
    # Pattern to capture slug and optional topic ID
    pattern = r'forum\.arbitrum\.foundation/t/([a-zA-Z0-9_-]+)(?:/(\d+))?'
    matches = re.findall(pattern, text, re.IGNORECASE)
    # Returns list of (slug, topic_id) tuples
    return [(m[0].lower(), m[1] if m[1] else None) for m in matches]

def is_stip_ltipp_protocol(title):
    """Check if this is a STIP/LTIPP protocol-specific proposal."""
    if not title:
        return False
    patterns = [
        r'STIP Proposal - Round 1$',
        r'STIP Addendum$',
        r'LTIPP Council Recommended Proposal$',
        r'STIP Bridge Challenge$',
        r'LTIPP \[Post Council Feedback\]$',
    ]
    return any(re.search(p, title) for p in patterns)

def is_election(title):
    """Check if this is an election proposal."""
    if not title:
        return False
    patterns = [
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
    return any(re.search(p, title, re.IGNORECASE) for p in patterns)

# Build slug -> proposal mapping
proposal_slugs = {}
for p in proposals:
    title = html.unescape(p['title'])
    slug = title_to_slug(title)
    # Store full slug and partial slugs
    proposal_slugs[slug] = p['id']
    # Also store normalized title for matching
    norm_title = normalize_title(title)
    if norm_title:
        proposal_slugs[title_to_slug(norm_title)] = p['id']

print(f"\nBuilt slug index with {len(proposal_slugs)} entries")

def find_proposal_by_slug(slug):
    """Find proposal ID by forum slug using fuzzy matching."""
    if not slug:
        return None, 0
    
    slug = slug.lower()
    
    # Direct match
    if slug in proposal_slugs:
        return proposal_slugs[slug], 100
    
    # Fuzzy match against all slugs
    best_match = None
    best_score = 0
    for p_slug, p_id in proposal_slugs.items():
        score = fuzz.ratio(slug, p_slug)
        if score > best_score:
            best_score = score
            best_match = p_id
    
    if best_score >= 70:
        return best_match, best_score
    return None, best_score

def find_best_title_match(title, min_score=65):
    """Find best matching proposal using title fuzzy matching."""
    if not title:
        return None, None, 0
    
    norm_title = normalize_title(title)
    best_match = None
    best_score = 0
    
    for p in proposals:
        p_norm = normalize_title(p['title'])
        p_title = html.unescape(p['title'])
        
        # Multiple strategies
        score1 = fuzz.ratio(norm_title, p_norm)
        score2 = fuzz.partial_ratio(norm_title, p_norm)
        score3 = fuzz.token_set_ratio(norm_title, p_norm)
        
        combined_score = max(score1, score2 * 0.95, score3 * 0.9)
        
        if combined_score > best_score:
            best_score = combined_score
            best_match = p
    
    if best_score >= min_score:
        return best_match['id'], html.unescape(best_match['title']), best_score
    return None, None, best_score

# Manual overrides
MANUAL_OVERRIDES_TALLY = {
    "ArbOS 20": "8b760c14-6f2b-4069-b326-23653e5c20f9",
    "BoLD + Infura Nova Validator": "4c1d960e-0ff6-47ba-92cf-d0612f84d2f6",
    "Subsidy Fund Proposal from the ADPC": "5b5c2bee-ea99-411a-afbb-a1df3f8d1b11",
    "ArbOS 51": "a952f794-6c33-453b-9e30-83e67dda98e2",
    "Safeguarding Software Developers": "08bc7918-8046-444c-b689-ebea647cb0ee",
}

MANUAL_OVERRIDES_SNAPSHOT = {
    "Safeguarding Software Developers": "08bc7918-8046-444c-b689-ebea647cb0ee",
}

# =============================================================================
# MATCH SNAPSHOT ENTRIES (with forum link extraction)
# =============================================================================

print(f"\n" + "=" * 80)
print("MATCHING SNAPSHOT ENTRIES")
print("=" * 80)

snapshot_results = {
    'matched_by_link': [],
    'matched_by_title': [],
    'low_confidence': [],
    'stip_ltipp': [],
    'elections': [],
    'unmatched': [],
}

for s in snapshot_stage:
    title = s.get('title') or ''
    body = s.get('body') or ''
    
    result = {
        'id': s['id'],
        'title': title,
        'author': s.get('author_name'),
        'proposal_id': None,
        'matched_title': None,
        'score': None,
        'method': None,
        'forum_links': [],
        'category': 'standard',
    }
    
    # Check for special categories first
    if is_stip_ltipp_protocol(title):
        result['category'] = 'stip_ltipp_protocol'
        # Still try to extract links for STIP/LTIPP - they may reference the main program
        forum_links = extract_forum_links(body)
        result['forum_links'] = forum_links
        snapshot_results['stip_ltipp'].append(result)
        continue
    
    if is_election(title):
        result['category'] = 'election'
        snapshot_results['elections'].append(result)
        continue
    
    # Check manual overrides
    for key, proposal_id in MANUAL_OVERRIDES_SNAPSHOT.items():
        if key.lower() in title.lower():
            result['proposal_id'] = proposal_id
            result['method'] = 'manual_override'
            result['score'] = 100
            result['matched_title'] = proposal_by_id[proposal_id]['title'] if proposal_id in proposal_by_id else 'Manual'
            break
    
    if result['proposal_id']:
        snapshot_results['matched_by_title'].append(result)
        continue
    
    # Extract forum links from body for potential use
    forum_links = extract_forum_links(body)
    result['forum_links'] = forum_links
    
    # STRATEGY 1: Try title matching FIRST (more reliable for specific proposals)
    title_match_id, title_match_title, title_score = find_best_title_match(title, min_score=55)
    
    # STRATEGY 2: Try forum link matching
    best_link_match = None
    best_link_score = 0
    best_link_slug = None
    
    if forum_links:
        for slug, topic_id in forum_links:
            # Skip generic program links that are just references
            if 'short-term-incentive' in slug or 'stip' in slug.split('-'):
                continue
            if 'arbitrum-arbos-upgrades' in slug:  # Generic ArbOS reference
                continue
            
            p_id, score = find_proposal_by_slug(slug)
            if score > best_link_score:
                best_link_score = score
                best_link_match = p_id
                best_link_slug = slug
    
    # Decision: Use title match if it's good (>=70), otherwise try link match
    if title_match_id and title_score >= 70:
        result['proposal_id'] = title_match_id
        result['matched_title'] = title_match_title
        result['score'] = title_score
        result['method'] = 'title_fuzzy'
    elif best_link_match and best_link_score >= 70:
        result['proposal_id'] = best_link_match
        result['score'] = best_link_score
        result['method'] = f'forum_link_slug ({best_link_slug[:30]}...)'
        result['matched_title'] = html.unescape(proposal_by_id[best_link_match]['title']) if best_link_match in proposal_by_id else None
    elif title_match_id and title_score >= 55:
        # Use lower-confidence title match
        result['proposal_id'] = title_match_id
        result['matched_title'] = title_match_title
        result['score'] = title_score
        result['method'] = 'title_fuzzy'
    elif best_link_match and best_link_score >= 60:
        # Use lower-confidence link match
        result['proposal_id'] = best_link_match
        result['score'] = best_link_score
        result['method'] = f'forum_link_slug ({best_link_slug[:30]}...)'
        result['matched_title'] = html.unescape(proposal_by_id[best_link_match]['title']) if best_link_match in proposal_by_id else None
    
    # Categorize result
    if result['proposal_id']:
        if result['score'] >= 70:
            if 'forum_link' in str(result.get('method', '')):
                snapshot_results['matched_by_link'].append(result)
            else:
                snapshot_results['matched_by_title'].append(result)
        else:
            result['category'] = 'low_confidence'
            snapshot_results['low_confidence'].append(result)
    else:
        snapshot_results['unmatched'].append(result)

print(f"\nSnapshot Matching Results:")
print(f"  Matched by forum link: {len(snapshot_results['matched_by_link'])}")
print(f"  Matched by title: {len(snapshot_results['matched_by_title'])}")
print(f"  Low confidence: {len(snapshot_results['low_confidence'])}")
print(f"  STIP/LTIPP (protocol-specific): {len(snapshot_results['stip_ltipp'])}")
print(f"  Elections: {len(snapshot_results['elections'])}")
print(f"  Unmatched: {len(snapshot_results['unmatched'])}")

# =============================================================================
# MATCH TALLY ENTRIES
# =============================================================================

print(f"\n" + "=" * 80)
print("MATCHING TALLY ENTRIES")
print("=" * 80)

tally_results = {
    'matched': [],
    'low_confidence': [],
    'unmatched': [],
}

for t in tally_stage:
    title = t.get('title') or ''
    description = t.get('description') or ''
    
    result = {
        'id': t['id'],
        'title': title,
        'author': t.get('author_name'),
        'proposal_id': None,
        'matched_title': None,
        'score': None,
        'method': None,
        'category': 'standard',
    }
    
    if not title or title in ['art dra', 'Arcubtang', 'AIP 4']:
        result['category'] = 'garbage'
        tally_results['unmatched'].append(result)
        continue
    
    # Check manual overrides
    for key, proposal_id in MANUAL_OVERRIDES_TALLY.items():
        if key.lower() in title.lower():
            result['proposal_id'] = proposal_id
            result['method'] = 'manual_override'
            result['score'] = 100
            result['matched_title'] = html.unescape(proposal_by_id[proposal_id]['title']) if proposal_id in proposal_by_id else 'Manual'
            break
    
    if not result['proposal_id']:
        # Try forum link extraction from description
        forum_links = extract_forum_links(description)
        if forum_links:
            for slug, topic_id in forum_links:
                p_id, score = find_proposal_by_slug(slug)
                if p_id and score >= 70:
                    result['proposal_id'] = p_id
                    result['score'] = score
                    result['method'] = f'forum_link_slug'
                    result['matched_title'] = html.unescape(proposal_by_id[p_id]['title']) if p_id in proposal_by_id else None
                    break
    
    if not result['proposal_id']:
        # Fuzzy title matching
        p_id, p_title, score = find_best_title_match(title, min_score=60)
        if p_id:
            result['proposal_id'] = p_id
            result['matched_title'] = p_title
            result['score'] = score
            result['method'] = 'title_fuzzy'
    
    if result['proposal_id']:
        if result['score'] >= 75:
            tally_results['matched'].append(result)
        else:
            result['category'] = 'low_confidence'
            tally_results['low_confidence'].append(result)
    else:
        tally_results['unmatched'].append(result)

print(f"\nTally Matching Results:")
print(f"  Matched (>=75): {len(tally_results['matched'])}")
print(f"  Low confidence (60-74): {len(tally_results['low_confidence'])}")
print(f"  Unmatched: {len(tally_results['unmatched'])}")

# =============================================================================
# CREATE OUTPUT FILES
# =============================================================================

print(f"\n" + "=" * 80)
print("OUTPUT FILES")
print("=" * 80)

# Collect all matches
snapshot_id_to_proposal = {}
for category in ['matched_by_link', 'matched_by_title']:
    for r in snapshot_results[category]:
        snapshot_id_to_proposal[r['id']] = r['proposal_id']

tally_id_to_proposal = {}
for r in tally_results['matched']:
    tally_id_to_proposal[r['id']] = r['proposal_id']

# Update tables
snapshot_stage_updated = []
for s in snapshot_stage:
    s_copy = s.copy()
    if s['id'] in snapshot_id_to_proposal:
        s_copy['proposal_id'] = snapshot_id_to_proposal[s['id']]
    snapshot_stage_updated.append(s_copy)

tally_stage_updated = []
for t in tally_stage:
    t_copy = t.copy()
    if t['id'] in tally_id_to_proposal:
        t_copy['proposal_id'] = tally_id_to_proposal[t['id']]
    tally_stage_updated.append(t_copy)

# Save
with open('/home/claude/tally_stage_final.json', 'w') as f:
    json.dump(tally_stage_updated, f, indent=2)

with open('/home/claude/snapshot_stage_final.json', 'w') as f:
    json.dump(snapshot_stage_updated, f, indent=2)

# Count
tally_with_proposal = sum(1 for t in tally_stage_updated if t.get('proposal_id'))
snapshot_with_proposal = sum(1 for s in snapshot_stage_updated if s.get('proposal_id'))

print(f"\nFinal matched counts:")
print(f"  Tally: {tally_with_proposal}/{len(tally_stage)} ({100*tally_with_proposal/len(tally_stage):.1f}%)")
print(f"  Snapshot: {snapshot_with_proposal}/{len(snapshot_stage)} ({100*snapshot_with_proposal/len(snapshot_stage):.1f}%)")

# =============================================================================
# REVIEW REPORT
# =============================================================================

print(f"\n" + "=" * 80)
print("ITEMS NEEDING MANUAL REVIEW")
print("=" * 80)

print("\n--- SNAPSHOT: Matched by Forum Link (samples) ---")
for r in snapshot_results['matched_by_link'][:5]:
    print(f"  [{r['score']:.0f}] {r['title'][:50]}...")
    print(f"       Method: {r['method']}")
    print(f"       -> {r['matched_title'][:50] if r['matched_title'] else 'N/A'}...")
    print()
if len(snapshot_results['matched_by_link']) > 5:
    print(f"  ... and {len(snapshot_results['matched_by_link']) - 5} more matched by forum link")

print("\n--- SNAPSHOT: Low Confidence ---")
for r in sorted(snapshot_results['low_confidence'], key=lambda x: x['score'] or 0, reverse=True)[:10]:
    print(f"  [{r['score']:.0f}] {r['title'][:50]}...")
    print(f"       -> {r['matched_title'][:50] if r['matched_title'] else 'N/A'}...")
    print()

print("\n--- SNAPSHOT: Unmatched ---")
for r in snapshot_results['unmatched'][:10]:
    print(f"  - {r['title'][:70]}...")
    if r['forum_links']:
        print(f"    Links found: {r['forum_links'][:2]}")

print("\n--- TALLY: Low Confidence ---")
for r in tally_results['low_confidence']:
    print(f"  [{r['score']:.0f}] {r['title'][:50]}...")
    print(f"       -> {r['matched_title'][:50] if r['matched_title'] else 'N/A'}...")

print("\n--- TALLY: Unmatched ---")
for r in tally_results['unmatched']:
    print(f"  - {r['title'][:70]}...")

# Save review report
review_report = {
    'snapshot_matched_by_link': snapshot_results['matched_by_link'],
    'snapshot_matched_by_title': snapshot_results['matched_by_title'],
    'snapshot_low_confidence': snapshot_results['low_confidence'],
    'snapshot_unmatched': snapshot_results['unmatched'],
    'tally_matched': tally_results['matched'],
    'tally_low_confidence': tally_results['low_confidence'],
    'tally_unmatched': tally_results['unmatched'],
}

with open('/home/claude/review_report_final.json', 'w') as f:
    json.dump(review_report, f, indent=2)

# =============================================================================
# FINAL SUMMARY
# =============================================================================

print(f"\n" + "=" * 80)
print("FINAL SUMMARY")
print("=" * 80)

snap_total = len(snapshot_stage)
snap_by_link = len(snapshot_results['matched_by_link'])
snap_by_title = len(snapshot_results['matched_by_title'])
snap_low = len(snapshot_results['low_confidence'])
snap_stip = len(snapshot_results['stip_ltipp'])
snap_elections = len(snapshot_results['elections'])
snap_unmatched = len(snapshot_results['unmatched'])

print(f"\nSNAPSHOT ({snap_total} total):")
print(f"  ✓ Matched by forum link: {snap_by_link} ({100*snap_by_link/snap_total:.1f}%)")
print(f"  ✓ Matched by title: {snap_by_title} ({100*snap_by_title/snap_total:.1f}%)")
print(f"  ⚠ Low confidence: {snap_low} ({100*snap_low/snap_total:.1f}%)")
print(f"  ○ STIP/LTIPP (no forum): {snap_stip} ({100*snap_stip/snap_total:.1f}%)")
print(f"  ○ Elections (no forum): {snap_elections} ({100*snap_elections/snap_total:.1f}%)")
print(f"  ✗ Unmatched: {snap_unmatched} ({100*snap_unmatched/snap_total:.1f}%)")
print(f"  TOTAL MATCHED: {snap_by_link + snap_by_title} ({100*(snap_by_link + snap_by_title)/snap_total:.1f}%)")

tally_total = len(tally_stage)
tally_matched = len(tally_results['matched'])
tally_low = len(tally_results['low_confidence'])
tally_unmatched = len(tally_results['unmatched'])

print(f"\nTALLY ({tally_total} total):")
print(f"  ✓ Matched: {tally_matched} ({100*tally_matched/tally_total:.1f}%)")
print(f"  ⚠ Low confidence: {tally_low} ({100*tally_low/tally_total:.1f}%)")
print(f"  ✗ Unmatched: {tally_unmatched} ({100*tally_unmatched/tally_total:.1f}%)")

print(f"\n" + "=" * 80)
