# LlamaIndex Evaluator Internal Mechanics — Worked Examples

This document walks through each of the three LlamaIndex evaluators with **concrete Arbitrum governance data**, showing exactly what gets sent to the LLM at each step. Read this alongside `docs/rag-evaluation-pipeline.md` for the full picture.

---

## Setup: The RAG Query That Produced Our Data

Imagine a user asks:

```
"What is the status of the STIP proposal and who proposed it?"
```

The RAG pipeline does two things:

### 1. Retriever fetches context chunks from pgvector

The retriever embeds the query and finds the top-3 most similar chunks. Each chunk is a piece of text stored in the vector database during ingestion:

```
Context Chunk 1 (score: 0.92):
───────────────────────────────────────────
# Arbitrum Short-Term Incentive Program (STIP)

Author: Arbitrum Foundation
Category: Incentives
Created: 2023-10-15

## Tally On-chain Vote
Status: executed
On-chain ID: 47832
Voting Start: 2023-11-01
Voting End: 2023-11-15
URL: https://www.tally.xyz/gov/arbitrum/proposal/47832
Options: For, Against, Abstain
───────────────────────────────────────────

Context Chunk 2 (score: 0.87):
───────────────────────────────────────────
# Arbitrum Short-Term Incentive Program (STIP)

## Snapshot Temperature Check
Status: closed
Voting Start: 2023-10-20
Voting End: 2023-10-27
URL: https://snapshot.org/#/arbitrumfoundation.eth/proposal/0xabc123
Options: For, Against, Abstain
───────────────────────────────────────────

Context Chunk 3 (score: 0.71):
───────────────────────────────────────────
The STIP program allocated 50 million ARB tokens to incentivize
protocol growth on Arbitrum. Delegates raised concerns about the
lack of accountability metrics and the short timeline for
distributing funds. Some argued the amount was too large given
market conditions.

Post by: dk3 (@dk3)
Posted: 2023-10-18
───────────────────────────────────────────
```

These three chunks are the `contexts` array — raw strings, not 200-char snippets.

### 2. LLM generates an answer

The query engine (retriever + LLM) produces:

```
Response: "The STIP (Short-Term Incentive Program) proposal was authored by
the Arbitrum Foundation. It has been executed after passing both the Snapshot
temperature check and the Tally on-chain vote. The program allocated
50 million ARB tokens for protocol incentives."
```

Now we have everything the evaluators need:

| Variable | Value |
|----------|-------|
| `query` | "What is the status of the STIP proposal and who proposed it?" |
| `response` | "The STIP (Short-Term Incentive Program) proposal was authored by..." |
| `contexts` | Array of 3 chunk strings shown above |

---

## FaithfulnessEvaluator — Full Walkthrough

**Goal:** Is the response grounded in the context chunks? Or did the LLM make something up?

### Step 1: Wrap chunks into Documents

LlamaIndex takes our 3 context strings and wraps each one into an in-memory `Document` object:

```typescript
// Internal LlamaIndex code does this:
const docs = contexts.map(text => new Document({ text }));
// docs[0].text = "# Arbitrum Short-Term Incentive Program (STIP)\n\nAuthor: ..."
// docs[1].text = "# Arbitrum Short-Term Incentive Program (STIP)\n\n## Snapshot ..."
// docs[2].text = "The STIP program allocated 50 million ARB tokens ..."
```

### Step 2: Build a SummaryIndex

LlamaIndex creates a **SummaryIndex** (not a vector index!) from these documents. A SummaryIndex is just a simple index that iterates through all documents — no embeddings, no similarity search. It's used here because the evaluator needs to check the response against **every** chunk, not just the most similar one.

```typescript
// Internal LlamaIndex code:
const index = await SummaryIndex.fromDocuments(docs);
const queryEngine = index.asQueryEngine();
// The query engine will iterate through all 3 docs
```

### Step 3: The "query" is the RESPONSE text (not the user question!)

This is the key thing that's confusing. The evaluator sends the **RAG response** as the "query" to its internal engine:

```
The evaluator's internal query = "The STIP (Short-Term Incentive Program)
proposal was authored by the Arbitrum Foundation. It has been executed after
passing both the Snapshot temperature check and the Tally on-chain vote.
The program allocated 50 million ARB tokens for protocol incentives."
```

Why? Because it's asking "is this information supported by the context?" — the "information" is the response.

### Step 4: LLM Call #1 — First chunk

The SummaryIndex engine processes Chunk 1. LlamaIndex fills in its prompt template and sends this to the LLM (`gpt-5-mini`):

```
┌─────────────────── ACTUAL LLM PROMPT (Call #1) ───────────────────┐
│                                                                    │
│ Please tell if a given piece of information                        │
│ is supported by the context.                                       │
│ You need to answer with either YES or NO.                          │
│ Answer YES if any of the context supports the information, even    │
│ if most of the context is unrelated.                               │
│ Some examples are provided below.                                  │
│                                                                    │
│ Information: Apple pie is generally double-crusted.                 │
│ Context: An apple pie is a fruit pie in which the principal        │
│ filling ingredient is apples. Apple pie is often served with       │
│ whipped cream, ice cream ('apple pie à la mode'), custard or       │
│ cheddar cheese. It is generally double-crusted, with pastry both   │
│ above and below the filling; the upper crust may be solid or       │
│ latticed (woven of crosswise strips).                              │
│ Answer: YES                                                        │
│ Information: Apple pies tastes bad.                                 │
│ Context: An apple pie is a fruit pie in which the principal        │
│ filling ingredient is apples...                                    │
│ Answer: NO                                                         │
│                                                                    │
│ Information: The STIP (Short-Term Incentive Program) proposal was  │
│ authored by the Arbitrum Foundation. It has been executed after     │
│ passing both the Snapshot temperature check and the Tally on-chain │
│ vote. The program allocated 50 million ARB tokens for protocol     │
│ incentives.                                                        │
│                                                                    │
│ Context: # Arbitrum Short-Term Incentive Program (STIP)            │
│                                                                    │
│ Author: Arbitrum Foundation                                        │
│ Category: Incentives                                               │
│ Created: 2023-10-15                                                │
│                                                                    │
│ ## Tally On-chain Vote                                             │
│ Status: executed                                                   │
│ On-chain ID: 47832                                                 │
│ Voting Start: 2023-11-01                                           │
│ Voting End: 2023-11-15                                             │
│ URL: https://www.tally.xyz/gov/arbitrum/proposal/47832             │
│ Options: For, Against, Abstain                                     │
│                                                                    │
│ Answer:                                                            │
└────────────────────────────────────────────────────────────────────┘
```

**LLM responds:** `"YES"`

Why YES? The chunk confirms:
- "Author: Arbitrum Foundation" → supports "authored by the Arbitrum Foundation"
- "Status: executed" → supports "has been executed"
- The Tally on-chain vote information is present

But note: this chunk does NOT confirm the "50 million ARB tokens" claim or the Snapshot part. That's OK — the prompt says "Answer YES if **any** of the context supports the information."

### Step 5: LLM Call #2 — Refine with Chunk 2

Now LlamaIndex moves to Chunk 2. Since we already have an answer ("YES"), it uses the **refine prompt**:

```
┌─────────────────── ACTUAL LLM PROMPT (Call #2) ───────────────────┐
│                                                                    │
│ We want to understand if the following information is present      │
│ in the context information: The STIP (Short-Term Incentive         │
│ Program) proposal was authored by the Arbitrum Foundation. It has   │
│ been executed after passing both the Snapshot temperature check     │
│ and the Tally on-chain vote. The program allocated 50 million ARB  │
│ tokens for protocol incentives.                                    │
│                                                                    │
│ We have provided an existing YES/NO answer: YES                    │
│                                                                    │
│ We have the opportunity to refine the existing answer              │
│ (only if needed) with some more context below.                     │
│ ------------                                                       │
│ # Arbitrum Short-Term Incentive Program (STIP)                     │
│                                                                    │
│ ## Snapshot Temperature Check                                      │
│ Status: closed                                                     │
│ Voting Start: 2023-10-20                                           │
│ Voting End: 2023-10-27                                             │
│ URL: https://snapshot.org/#/arbitrumfoundation.eth/proposal/0xabc  │
│ Options: For, Against, Abstain                                     │
│ ------------                                                       │
│                                                                    │
│ If the existing answer was already YES, still answer YES.          │
│ If the information is present in the new context, answer YES.      │
│ Otherwise answer NO.                                               │
└────────────────────────────────────────────────────────────────────┘
```

**LLM responds:** `"YES"`

This is the **monotonically YES** behavior. Once the answer is YES, it stays YES. The refine prompt explicitly says: "If the existing answer was already YES, still answer YES." This means faithfulness is: "is the response supported by **at least one** chunk?"

### Step 6: LLM Call #3 — Refine with Chunk 3

Same refine pattern with the third chunk:

```
┌─────────────────── ACTUAL LLM PROMPT (Call #3) ───────────────────┐
│                                                                    │
│ We want to understand if the following information is present      │
│ in the context information: The STIP (Short-Term Incentive         │
│ Program) proposal was authored by the Arbitrum Foundation...       │
│                                                                    │
│ We have provided an existing YES/NO answer: YES                    │
│                                                                    │
│ We have the opportunity to refine the existing answer              │
│ (only if needed) with some more context below.                     │
│ ------------                                                       │
│ The STIP program allocated 50 million ARB tokens to incentivize    │
│ protocol growth on Arbitrum. Delegates raised concerns about the   │
│ lack of accountability metrics and the short timeline for          │
│ distributing funds. Some argued the amount was too large given     │
│ market conditions.                                                 │
│                                                                    │
│ Post by: dk3 (@dk3)                                                │
│ Posted: 2023-10-18                                                 │
│ ------------                                                       │
│                                                                    │
│ If the existing answer was already YES, still answer YES.          │
│ If the information is present in the new context, answer YES.      │
│ Otherwise answer NO.                                               │
└────────────────────────────────────────────────────────────────────┘
```

**LLM responds:** `"YES"`

### Step 7: Parse final result

```typescript
const rawAnswer = "YES";
const passing = rawAnswer.toLowerCase().includes("yes"); // true
const score = passing ? 1.0 : 0.0; // 1.0
const feedback = "YES"; // the raw LLM response becomes the feedback
```

**Final FaithfulnessEvaluator result:**
```
{ score: 1.0, passing: true, feedback: "YES" }
```

**Total LLM calls for this evaluation: 3** (one per context chunk).

### What Would a FAILURE Look Like?

Suppose the RAG had hallucinated this response instead:

```
"The STIP proposal was authored by Offchain Labs and requested 100 million
ARB tokens. It was vetoed by the Security Council."
```

- Call #1 with Chunk 1: The chunk says "Author: Arbitrum Foundation" not "Offchain Labs", "Status: executed" not "vetoed". LLM would answer **"NO"**
- Call #2 (refine with Chunk 2): No supporting evidence for "Offchain Labs" or "vetoed". LLM answers **"NO"**
- Call #3 (refine with Chunk 3): Says "50 million" not "100 million". LLM answers **"NO"**

Final result: `{ score: 0.0, passing: false, feedback: "NO" }`

---

## RelevancyEvaluator — Full Walkthrough

**Goal:** Does the response actually answer what the user asked, given the context?

Same data as before, but the key difference is in **what gets sent as the "query"** to the internal SummaryIndex.

### Step 1-2: Same as Faithfulness

Documents and SummaryIndex are built identically.

### Step 3: The "query" combines BOTH the user question AND the response

This is the critical difference from Faithfulness. Instead of just the response text, the evaluator combines:

```
The evaluator's internal query = "Question: What is the status of the STIP
proposal and who proposed it?
Response: The STIP (Short-Term Incentive Program) proposal was authored by
the Arbitrum Foundation. It has been executed after passing both the Snapshot
temperature check and the Tally on-chain vote. The program allocated
50 million ARB tokens for protocol incentives."
```

### Step 4: LLM Call #1 — First chunk

```
┌─────────────────── ACTUAL LLM PROMPT (Call #1) ───────────────────┐
│                                                                    │
│ Your task is to evaluate if the response for the query is in line  │
│ with the context information provided.                             │
│ You have two options to answer. Either YES/ NO.                    │
│ Answer - YES, if the response for the query is in line with        │
│ context information otherwise NO.                                  │
│                                                                    │
│ Query and Response: Question: What is the status of the STIP       │
│ proposal and who proposed it?                                      │
│ Response: The STIP (Short-Term Incentive Program) proposal was     │
│ authored by the Arbitrum Foundation. It has been executed after     │
│ passing both the Snapshot temperature check and the Tally on-chain │
│ vote. The program allocated 50 million ARB tokens for protocol     │
│ incentives.                                                        │
│                                                                    │
│ Context: # Arbitrum Short-Term Incentive Program (STIP)            │
│                                                                    │
│ Author: Arbitrum Foundation                                        │
│ Category: Incentives                                               │
│ Created: 2023-10-15                                                │
│                                                                    │
│ ## Tally On-chain Vote                                             │
│ Status: executed                                                   │
│ On-chain ID: 47832                                                 │
│ Voting Start: 2023-11-01                                           │
│ Voting End: 2023-11-15                                             │
│ URL: https://www.tally.xyz/gov/arbitrum/proposal/47832             │
│ Options: For, Against, Abstain                                     │
│                                                                    │
│ Answer:                                                            │
└────────────────────────────────────────────────────────────────────┘
```

**LLM responds:** `"YES"`

Why? The question asked for status + author. The response provides both ("executed" + "Arbitrum Foundation"), and the context confirms these facts.

### Step 5: LLM Call #2 — Refine with Chunk 2

```
┌─────────────────── ACTUAL LLM PROMPT (Call #2) ───────────────────┐
│                                                                    │
│ We want to understand if the following query and response is       │
│ in line with the context information:                              │
│ Question: What is the status of the STIP proposal and who          │
│ proposed it?                                                       │
│ Response: The STIP (Short-Term Incentive Program) proposal was     │
│ authored by the Arbitrum Foundation. It has been executed...        │
│                                                                    │
│ We have provided an existing YES/NO answer:                        │
│ YES                                                                │
│                                                                    │
│ We have the opportunity to refine the existing answer              │
│ (only if needed) with some more context below.                     │
│ ------------                                                       │
│ # Arbitrum Short-Term Incentive Program (STIP)                     │
│                                                                    │
│ ## Snapshot Temperature Check                                      │
│ Status: closed                                                     │
│ Voting Start: 2023-10-20                                           │
│ ...                                                                │
│ ------------                                                       │
│                                                                    │
│ If the existing answer was already YES, still answer YES.          │
│ If the information is present in the new context, answer YES.      │
│ Otherwise answer NO.                                               │
└────────────────────────────────────────────────────────────────────┘
```

**LLM responds:** `"YES"`

### Step 6: LLM Call #3 — Refine with Chunk 3

Same pattern. **LLM responds:** `"YES"`

**Final RelevancyEvaluator result:**
```
{ score: 1.0, passing: true, feedback: "YES" }
```

### What Would a FAILURE Look Like?

Imagine the user asked:

```
"What is the status of the STIP proposal and who proposed it?"
```

But retrieval fetched chunks about a **different** proposal (say, the Gaming Catalyst Program), and the LLM generated:

```
"The Gaming Catalyst Program was proposed by Treasure DAO and allocated
200 million ARB for gaming ecosystem growth. It passed with 78% approval."
```

This response is potentially **faithful** (it might be grounded in the Gaming Catalyst chunks), but it's **irrelevant** — the user asked about STIP, not Gaming Catalyst.

The Relevancy prompt would see:

```
Query and Response: Question: What is the status of the STIP proposal
and who proposed it?
Response: The Gaming Catalyst Program was proposed by Treasure DAO...

Context: [Gaming Catalyst Program chunks]
```

The LLM would recognize the response is about a different proposal than the query asks about → answers **"NO"**.

Result: `{ score: 0.0, passing: false, feedback: "NO" }`

### The Key Difference Summarized

Let's make this crystal clear with a side-by-side:

```
FAITHFULNESS sends to LLM:
┌─────────────────────────────────────────────┐
│ Information: [ONLY the response text]       │
│ Context: [chunk text]                        │
│ → "Is this info supported by context?"       │
└─────────────────────────────────────────────┘
Doesn't care about the original user question at all.
Only checks: "did the LLM make stuff up?"

RELEVANCY sends to LLM:
┌─────────────────────────────────────────────┐
│ Query and Response: [question + response]    │
│ Context: [chunk text]                        │
│ → "Does this response answer this question   │
│    given this context?"                      │
└─────────────────────────────────────────────┘
Checks the three-way relationship between question,
response, and context.
```

---

## CorrectnessEvaluator — Full Walkthrough

**Goal:** Compare the RAG answer against a human-written reference answer. How close is it?

This one is completely different from the other two — much simpler.

### The Inputs

For this evaluator, we need a **reference answer** (the "right" answer written by a human):

```
query:           "What is the status of the STIP proposal and who proposed it?"

response:        "The STIP (Short-Term Incentive Program) proposal was authored
                  by the Arbitrum Foundation. It has been executed after passing
                  both the Snapshot temperature check and the Tally on-chain vote.
                  The program allocated 50 million ARB tokens for protocol
                  incentives."

referenceAnswer: "The STIP proposal was proposed by the Arbitrum Foundation. Its
                  current status is 'executed' — it passed the Tally on-chain
                  vote after clearing the Snapshot temperature check."
```

Note: **No context chunks are needed.** The Correctness evaluator doesn't look at retrieved chunks. It only compares the generated answer to the reference answer.

### Step 1: Build the System Message (Scoring Rubric)

LlamaIndex constructs a system prompt that tells the LLM how to score:

```
┌─────────────────── SYSTEM MESSAGE ────────────────────────────────┐
│                                                                    │
│ You are an expert evaluation system for a question answering       │
│ chatbot.                                                           │
│                                                                    │
│ You are given the following information:                           │
│ - a user query,                                                    │
│ - a reference answer, and                                          │
│ - a generated answer.                                              │
│                                                                    │
│ Your job is to judge the relevancy and correctness of the          │
│ generated answer, based on the reference answer.                   │
│                                                                    │
│ Output your answer as a float score on the first line, then a      │
│ justification on the remaining lines.                              │
│                                                                    │
│ Your score has to be between 1 and 5, where:                       │
│ 1 means the generated answer is not at all relevant to the         │
│   user query and reference answer                                  │
│ 2 means the generated answer is relevant to the user query and     │
│   reference answer but contains mistakes                           │
│ 3 means the generated answer is relevant to the user query and     │
│   reference answer but is not complete                             │
│ 4 means the generated answer is relevant to the user query and     │
│   reference answer and is mostly correct                           │
│ 5 means the generated answer is fully correct and complete         │
│   based on the reference answer                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Step 2: Build the User Message

```
┌─────────────────── USER MESSAGE ──────────────────────────────────┐
│                                                                    │
│ ## User Query                                                      │
│ What is the status of the STIP proposal and who proposed it?       │
│                                                                    │
│ ## Reference Answer                                                │
│ The STIP proposal was proposed by the Arbitrum Foundation. Its      │
│ current status is 'executed' — it passed the Tally on-chain vote   │
│ after clearing the Snapshot temperature check.                     │
│                                                                    │
│ ## Generated Answer                                                │
│ The STIP (Short-Term Incentive Program) proposal was authored by   │
│ the Arbitrum Foundation. It has been executed after passing both    │
│ the Snapshot temperature check and the Tally on-chain vote. The    │
│ program allocated 50 million ARB tokens for protocol incentives.   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Step 3: Single LLM Call

These two messages are sent together as a single `llm.chat()` call. The LLM responds:

```
4.5
The generated answer correctly identifies the Arbitrum Foundation as the
proposer and the "executed" status. It also accurately describes the
governance flow (Snapshot → Tally). The additional detail about 50 million
ARB tokens is factually consistent and provides useful context beyond the
reference answer. Minor deduction because the generated answer uses
"authored" instead of "proposed" which is slightly less precise for
governance terminology.
```

### Step 4: Parse the Response

```typescript
// LlamaIndex's default parser does this:
const lines = llmResponse.split("\n");
const score = parseFloat(lines[0]);           // 4.5
const feedback = lines.slice(1).join("\n");    // "The generated answer correctly..."
const passing = score >= scoreThreshold;        // 4.5 >= 4.0 → true
```

**Final CorrectnessEvaluator result:**
```
{
  score: 4.5,
  passing: true,
  feedback: "The generated answer correctly identifies the Arbitrum Foundation
    as the proposer and the 'executed' status. It also accurately describes
    the governance flow (Snapshot → Tally). The additional detail about
    50 million ARB tokens is factually consistent and provides useful context
    beyond the reference answer. Minor deduction because the generated answer
    uses 'authored' instead of 'proposed' which is slightly less precise for
    governance terminology."
}
```

**Total LLM calls: exactly 1.**

### What Would Different Scores Look Like?

**Score 5.0 — Perfect match:**

```
Generated: "The STIP proposal was proposed by the Arbitrum Foundation. It has
been executed, having passed both the Snapshot temperature check and the Tally
on-chain vote."

→ 5.0: "The generated answer is fully aligned with the reference answer,
covering both the proposer (Arbitrum Foundation) and status (executed) with
the correct governance flow."
```

**Score 3.0 — Incomplete:**

```
Generated: "The STIP proposal has been executed."

→ 3.0: "The generated answer correctly identifies the status as 'executed' but
completely omits the proposer (Arbitrum Foundation), which was a core part of
the user's query."
```

**Score 1.0 — Wrong answer:**

```
Generated: "I don't have information about the STIP proposal in the available
governance data."

→ 1.0: "The generated answer fails to provide any relevant information. The
reference answer shows that the proposer and status are both available in the
data."
```

---

## Putting It All Together — What the Runner Does

Here's the complete sequence for one test query, with the actual data flowing between components:

```
TEST QUERY
├── id: "query-004"
├── query: "What is the status of the STIP proposal and who proposed it?"
├── expectedProposalIds: ["abc-123"]
├── referenceAnswer: "The STIP proposal was proposed by the Arbitrum Foundation..."
└── tags: ["status", "factual"]

    │
    ▼

STEP 1: evaluateRetrieval()
    │
    ├── Embeds query → [0.023, -0.841, 0.127, ...] (1536 dimensions)
    ├── pgvector cosine similarity search → top 15 nodes
    ├── Extract proposal IDs in rank order: ["abc-123", "def-456", "ghi-789", ...]
    ├── Compute hit: "abc-123" is in expectedProposalIds? → YES (rank 1)
    ├── Compute reciprocalRank: 1/1 = 1.0
    │
    └── Returns:
        ├── retrieval: { hit: true, reciprocalRank: 1.0, retrievedProposalIds: [...] }
        └── contexts: [full text of chunk 1, full text of chunk 2, ...full text of chunk 15]

    │
    ▼

STEP 2: queryRag()
    │
    ├── Same query → retriever + LLM synthesis
    ├── System prompt: "You are a helpful assistant..."
    ├── LLM generates answer from retrieved chunks
    │
    └── Returns:
        ├── answer: "The STIP (Short-Term Incentive Program) proposal was authored by..."
        └── citations: [{ proposal_id: "abc-123", stage: "tally", snippet: "# Arbitrum Sho..." }]

    │
    ▼

STEP 3: evaluateFaithfulness(query, answer, contexts)
    │
    ├── Creates SummaryIndex from 15 context chunks (in-memory)
    ├── LLM Call  1: First chunk prompt → "YES"
    ├── LLM Call  2: Refine with chunk 2 → "YES"
    ├── LLM Call  3: Refine with chunk 3 → "YES"
    ├── ...
    ├── LLM Call 15: Refine with chunk 15 → "YES"
    │
    └── Returns: { score: 1.0, passing: true, feedback: "YES" }

    │
    ▼

STEP 4: evaluateRelevancy(query, answer, contexts)
    │
    ├── Creates SummaryIndex from 15 context chunks (in-memory)
    ├── LLM Call  1: First chunk prompt (query+response combined) → "YES"
    ├── LLM Call  2: Refine with chunk 2 → "YES"
    ├── ...
    ├── LLM Call 15: Refine with chunk 15 → "YES"
    │
    └── Returns: { score: 1.0, passing: true, feedback: "YES" }

    │
    ▼

STEP 5: evaluateCorrectness(query, answer, referenceAnswer)
    │
    ├── Single llm.chat() call with system rubric + user message
    │
    └── Returns: { score: 4.5, passing: true, feedback: "The generated answer correctly..." }

    │
    ▼

FINAL RESULT for query-004:
{
  queryId: "query-004",
  query: "What is the status of the STIP proposal and who proposed it?",
  answer: "The STIP (Short-Term Incentive Program) proposal was authored by...",
  citations: [{ proposal_id: "abc-123", stage: "tally", url: "..." }],
  faithfulness: { score: 1.0, passing: true, feedback: "YES" },
  relevancy: { score: 1.0, passing: true, feedback: "YES" },
  correctness: { score: 4.5, passing: true, feedback: "The generated answer..." },
  retrieval: { hit: true, reciprocalRank: 1.0, retrievedProposalIds: ["abc-123", ...] },
  durationMs: 12340,
}

Total LLM calls for this one query: 1 (queryRag) + 15 (faithfulness) + 15 (relevancy) + 1 (correctness) = 32
Total embedding calls: 2 (one in evaluateRetrieval, one in queryRag)
```

---

## Failure Scenarios — Concrete Examples

### Scenario A: Hallucination (Low Faithfulness, High Relevancy)

```
Query:    "What is the voting deadline for the Treasury Management proposal?"
Context:  [Chunk about Treasury Management with "Voting End: 2024-03-15"]
Response: "The voting deadline is March 30, 2024, and the proposal needs
           a 60% supermajority to pass."
```

**Faithfulness:** The context says March 15, not March 30. And "60% supermajority" isn't in any chunk. The LLM made up both details.
→ Result: `{ score: 0.0, passing: false }` — **FAIL**

**Relevancy:** The response IS trying to answer the question about voting deadline. It's on-topic.
→ Result: `{ score: 1.0, passing: true }` — PASS

**Diagnosis:** The LLM is answering the right question but fabricating details. Tighten the system prompt: "Only state facts present in the context. If a specific date is not mentioned, say so."

### Scenario B: Off-Topic (High Faithfulness, Low Relevancy)

```
Query:    "Who proposed the Security Council Elections?"
Context:  [Chunk 1: Security Council Elections metadata]
          [Chunk 2: Security Council Elections forum post about timeline]
          [Chunk 3: Treasury Management proposal metadata]
Response: "The Treasury Management proposal was created by the Arbitrum
           Foundation on January 10, 2024. It is currently in the Snapshot
           voting phase."
```

**Faithfulness:** Everything in the response matches Chunk 3 (Treasury Management). The facts are correct.
→ Result: `{ score: 1.0, passing: true }` — PASS

**Relevancy:** The user asked about Security Council Elections, but got an answer about Treasury Management.
→ Result: `{ score: 0.0, passing: false }` — **FAIL**

**Diagnosis:** The LLM latched onto the wrong chunk. This could happen when:
- Chunk 3 (Treasury Management) had a higher relevance score than expected
- The LLM's attention was drawn to the wrong context
Fix: Add metadata filters, reduce topK to reduce noise, or add reranking.

### Scenario C: Retrieval Failure (Hit Rate = 0)

```
Query:    "What concerns were raised about the Arbitrum Orbit proposal?"
Expected: proposal_id = "orbit-123"
Retrieved: ["treasury-456", "stip-789", "gaming-012"]  ← orbit-123 not here!
```

**Retrieval:** Hit = false, Reciprocal Rank = 0.0

The evaluators might still report high faithfulness and relevancy (the answer might be faithful to the **wrong** chunks and relevant to the query in a general governance sense), but the retrieval metrics expose the real problem: we never even fetched the right proposal.

**Diagnosis:** The embedding for the query "Arbitrum Orbit" didn't match the stored Orbit proposal chunks well enough. Check if:
- The Orbit proposal is actually ingested
- The canonical text includes "Orbit" prominently
- The embedding dimensions and model match between ingestion and query

### Scenario D: Partial Correctness (Score 2-3)

```
Query:           "How does the Snapshot voting process work for Arbitrum proposals?"
Reference:       "Snapshot voting for Arbitrum proposals is an off-chain temperature
                  check where ARB token holders vote without gas fees. The results
                  gauge community sentiment before a proposal moves to an on-chain
                  Tally vote."
Generated:       "Snapshot is used for voting on Arbitrum proposals."
```

**Correctness:** The generated answer is technically not wrong, but it's extremely incomplete. It misses:
- "off-chain temperature check" concept
- "without gas fees" detail
- "gauge community sentiment" purpose
- "before moving to Tally" flow

→ Result: `{ score: 2.5, passing: false, feedback: "The answer is relevant but severely incomplete..." }`

**Diagnosis:** The LLM is being too terse. Could be a chunk boundary issue (the relevant information is split across chunks and the LLM only synthesizes from one). Or the system prompt needs to encourage more comprehensive answers.
