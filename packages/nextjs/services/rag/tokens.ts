import { encoding_for_model } from "tiktoken";

let encoder: ReturnType<typeof encoding_for_model> | null = null;

/**
 * Get or create the tiktoken encoder for text-embedding-3-small
 */
function getEncoder() {
  if (!encoder) {
    encoder = encoding_for_model("text-embedding-3-small");
  }
  return encoder;
}

/**
 * Estimate the number of tokens in a text string
 * Uses tiktoken for accurate token counting
 */
export function estimateTokens(text: string): number {
  return getEncoder().encode(text).length;
}

/**
 * Cleanup the encoder to free memory
 * Call this when done with token estimation
 */
export function cleanupEncoder(): void {
  encoder?.free();
  encoder = null;
}
