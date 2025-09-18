## Database schema for plantuml

```
@startuml
entity proposals {
id: UUID <<PK>>
--
title: VARCHAR(500)
description: TEXT
author_address: VARCHAR(42)
author_name: VARCHAR(255)
category: VARCHAR(50)
overall_status: VARCHAR(50)
proposal_type: VARCHAR(50)
parent_proposal_id: UUID <<FK>>
relationship_type: VARCHAR(50)
forum_url: VARCHAR(500)
execution_status: VARCHAR(50)
execution_date: TIMESTAMP
created_at: TIMESTAMP
updated_at: TIMESTAMP
last_synced_at: TIMESTAMP
}

entity forum_posts {
id: UUID <<PK>>
proposal_id: UUID <<FK>>
--
forum_thread_id: VARCHAR(255)
url: VARCHAR(500)
status: VARCHAR(50)
replies_count: INTEGER
views_count: INTEGER
last_activity: TIMESTAMP
created_at: TIMESTAMP
updated_at: TIMESTAMP
}

entity snapshot_votes {
id: UUID <<PK>>
proposal_id: UUID <<FK>>
--
snapshot_id: VARCHAR(100)
state: VARCHAR(50)
voting_start: TIMESTAMP
voting_end: TIMESTAMP
choices: JSONB
scores: JSONB
scores_total: NUMERIC
voters_count: INTEGER
last_activity: TIMESTAMP
created_at: TIMESTAMP
updated_at: TIMESTAMP
}

entity tally_votes {
id: UUID <<PK>>
proposal_id: UUID <<FK>>
--
tally_proposal_id: VARCHAR(100)
onchain_id: VARCHAR(100)
chain_id: VARCHAR(50)
status: VARCHAR(50)
for_votes: VARCHAR(100)
against_votes: VARCHAR(100)
abstain_votes: VARCHAR(100)
for_voters_count: INTEGER
against_voters_count: INTEGER
abstain_voters_count: INTEGER
start_block: BIGINT
end_block: BIGINT
start_timestamp: TIMESTAMP
end_timestamp: TIMESTAMP
execution_eta: TIMESTAMP
executed_at: TIMESTAMP
last_activity: TIMESTAMP
created_at: TIMESTAMP
updated_at: TIMESTAMP
}

entity proposal_relationships {
id: UUID <<PK>>
parent_proposal_id: UUID <<FK>>
child_proposal_id: UUID <<FK>>
--
relationship_type: VARCHAR(50)
relationship_status: VARCHAR(50)
description: TEXT
created_at: TIMESTAMP
}

entity api_cache {
id: UUID <<PK>>
--
source: VARCHAR(50)
endpoint: VARCHAR(255)
response_data: JSONB
fetched_at: TIMESTAMP
}

proposals ||--o{ forum_posts : "has"
proposals ||--o{ snapshot_votes : "has"
proposals ||--o{ tally_votes : "has"
@enduml
```

## Database queries

```
-- Core proposal entity that links all stages
CREATE TABLE proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    author_address VARCHAR(42),
    author_name VARCHAR(255),
    category VARCHAR(50), -- Constitutional, Non-Constitutional, etc.
    overall_status VARCHAR(50), -- active, passed, executed, defeated, etc.

    -- Amendment tracking
    proposal_type VARCHAR(50) DEFAULT 'original', -- original, amendment, replacement
    parent_proposal_id UUID REFERENCES proposals(id),
    relationship_type VARCHAR(50), -- amends, replaces, extends, cancels

    -- Linking URLs
    forum_url VARCHAR(500),

    -- Execution tracking
    execution_status VARCHAR(50), -- pending, queued, executed, etc.
    execution_date TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_synced_at TIMESTAMP
);

-- Forum discussion stage
CREATE TABLE forum_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID REFERENCES proposals(id),
    forum_thread_id VARCHAR(255),
    url VARCHAR(500),
    status VARCHAR(50), -- discussion, closed, moved_to_snapshot
    replies_count INTEGER,
    views_count INTEGER,
    last_activity TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Snapshot (off-chain) voting stage
CREATE TABLE snapshot_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID REFERENCES proposals(id),
    snapshot_id VARCHAR(100) UNIQUE, -- Snapshot's external ID
    state VARCHAR(50), -- pending, active, closed
    voting_start TIMESTAMP,
    voting_end TIMESTAMP,
    choices JSONB, -- Store array of voting options
    scores JSONB, -- Store array of scores
    scores_total NUMERIC(30,2),
    voters_count INTEGER,
    last_activity TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Tally (on-chain) voting stage
CREATE TABLE tally_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID REFERENCES proposals(id),
    tally_proposal_id VARCHAR(100), -- Tally's internal ID
    onchain_id VARCHAR(100), -- The actual blockchain transaction/proposal ID
    chain_id VARCHAR(50),
    status VARCHAR(50), -- active, executed, defeated, queued

    -- Vote stats
    for_votes VARCHAR(100),
    against_votes VARCHAR(100),
    abstain_votes VARCHAR(100),
    for_voters_count INTEGER,
    against_voters_count INTEGER,
    abstain_voters_count INTEGER,

    -- Block numbers for tracking
    start_block BIGINT,
    end_block BIGINT,
    start_timestamp TIMESTAMP,
    end_timestamp TIMESTAMP,

    -- Execution tracking
    execution_eta TIMESTAMP,
    executed_at TIMESTAMP,
    last_activity TIMESTAMP,

    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Track relationships between proposals
CREATE TABLE proposal_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_proposal_id UUID REFERENCES proposals(id),
    child_proposal_id UUID REFERENCES proposals(id),
    relationship_type VARCHAR(50), -- amends, replaces, extends, cancels
    relationship_status VARCHAR(50), -- active, superseded, rejected
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(parent_proposal_id, child_proposal_id)
);

-- Store raw API responses for debugging/reprocessing
CREATE TABLE api_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50), -- snapshot, tally, forum
    endpoint VARCHAR(255),
    response_data JSONB,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_proposals_status ON proposals(overall_status);
CREATE INDEX idx_proposals_updated ON proposals(updated_at DESC);
CREATE INDEX idx_proposals_parent ON proposals(parent_proposal_id);
CREATE INDEX idx_snapshot_votes_proposal ON snapshot_votes(proposal_id);
CREATE INDEX idx_snapshot_votes_snapshot_id ON snapshot_votes(snapshot_id);
CREATE INDEX idx_tally_votes_proposal ON tally_votes(proposal_id);
CREATE INDEX idx_tally_votes_tally_id ON tally_votes(tally_proposal_id);
CREATE INDEX idx_tally_votes_onchain_id ON tally_votes(onchain_id);
CREATE INDEX idx_proposal_relationships_parent ON proposal_relationships(parent_proposal_id);
CREATE INDEX idx_proposal_relationships_child ON proposal_relationships(child_proposal_id);
```
