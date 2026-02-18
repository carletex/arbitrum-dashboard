// HTTP utilities that force IPv4 to avoid IPv6 timeout issues
import https from "https";

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

type HttpGetOptions = {
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
};

/**
 * Sleep for a specified number of milliseconds
 */
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Make an HTTPS GET request with forced IPv4 to avoid IPv6 timeout issues.
 * Includes retry logic with exponential backoff.
 */
export async function httpsGet<T>(url: string, options: HttpGetOptions = {}): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, maxRetries = MAX_RETRIES, headers = {} } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await new Promise<T>((resolve, reject) => {
        const request = https.get(
          url,
          {
            headers: {
              "User-Agent": "arbitrum-dashboard/1.0",
              Accept: "application/json",
              ...headers,
            },
            timeout,
            family: 4, // Force IPv4 to avoid IPv6 timeout issues
          },
          res => {
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }

            let body = "";
            res.on("data", chunk => {
              body += chunk;
            });

            res.on("end", () => {
              try {
                resolve(JSON.parse(body));
              } catch (error) {
                reject(new Error(`JSON parse error: ${error}`));
              }
            });
          },
        );

        request.on("error", error => {
          reject(error);
        });

        request.on("timeout", () => {
          request.destroy();
          reject(new Error("Request timeout"));
        });
      });

      return data;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      console.error(`HTTP GET attempt ${attempt}/${maxRetries} failed:`, error);

      if (isLastAttempt) {
        throw new Error(
          `Failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }

      // Exponential backoff
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw new Error("Unexpected error in httpsGet");
}

// Forum API configuration
export const FORUM_URL = "https://forum.arbitrum.foundation";
export const FORUM_CATEGORY_PATH = "/c/proposals/7.json";
