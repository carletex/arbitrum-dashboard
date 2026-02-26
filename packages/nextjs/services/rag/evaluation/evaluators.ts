// LLM-as-Judge Evaluator Wrappers
//
// Thin wrappers around the three LlamaIndex evaluators.
// Uses singleton pattern to avoid re-instantiating evaluators across queries.
import { EVAL_CONFIG } from "./config";
import { LLMEvalResult } from "./types";
import { CorrectnessEvaluator, FaithfulnessEvaluator, RelevancyEvaluator } from "llamaindex/evaluation";

// Singleton instances (created on first use after Settings are configured)
let faithfulnessEvaluator: FaithfulnessEvaluator | null = null;
let relevancyEvaluator: RelevancyEvaluator | null = null;
let correctnessEvaluator: CorrectnessEvaluator | null = null;

function getFaithfulnessEvaluator(): FaithfulnessEvaluator {
  if (!faithfulnessEvaluator) {
    faithfulnessEvaluator = new FaithfulnessEvaluator();
  }
  return faithfulnessEvaluator;
}

function getRelevancyEvaluator(): RelevancyEvaluator {
  if (!relevancyEvaluator) {
    relevancyEvaluator = new RelevancyEvaluator();
  }
  return relevancyEvaluator;
}

function getCorrectnessEvaluator(): CorrectnessEvaluator {
  if (!correctnessEvaluator) {
    correctnessEvaluator = new CorrectnessEvaluator({
      scoreThreshold: EVAL_CONFIG.correctnessThreshold,
    });
  }
  return correctnessEvaluator;
}

/**
 * Evaluate whether the response is faithful to (grounded in) the provided contexts.
 * Binary score: 1 = faithful, 0 = hallucinated.
 * Makes N LLM calls (one per context chunk).
 */
export async function evaluateFaithfulness(
  query: string,
  response: string,
  contexts: string[],
): Promise<LLMEvalResult> {
  const evaluator = getFaithfulnessEvaluator();
  const result = await evaluator.evaluate({ query, response, contexts });
  return {
    score: result.score,
    passing: result.passing,
    feedback: result.feedback,
  };
}

/**
 * Evaluate whether the response is relevant to the query given the contexts.
 * Binary score: 1 = relevant, 0 = irrelevant.
 * Makes N LLM calls (one per context chunk).
 */
export async function evaluateRelevancy(query: string, response: string, contexts: string[]): Promise<LLMEvalResult> {
  const evaluator = getRelevancyEvaluator();
  const result = await evaluator.evaluate({ query, response, contexts });
  return {
    score: result.score,
    passing: result.passing,
    feedback: result.feedback,
  };
}

/**
 * Evaluate correctness of the response against a reference answer.
 * Score: 1-5 scale. Makes 1 LLM call.
 */
export async function evaluateCorrectness(query: string, response: string, reference: string): Promise<LLMEvalResult> {
  const evaluator = getCorrectnessEvaluator();
  const result = await evaluator.evaluate({ query, response, reference });
  return {
    score: result.score,
    passing: result.passing,
    feedback: result.feedback,
  };
}
