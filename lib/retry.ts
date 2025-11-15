/**
 * Retry utility with exponential backoff for handling transient failures
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

export interface RetryError extends Error {
  attempts: number;
  lastError: Error;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'PGRST301', // JWT expired
    'PGRST302', // JWT invalid
    'connection', // Connection errors
    'timeout', // Timeout errors
    'network', // Network errors
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
  ],
};

/**
 * Sleep for a specified number of milliseconds
 */
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if an error should be retried
 */
const isRetryableError = (error: unknown, retryableErrors: string[]): boolean => {
  if (!error) return false;

  const errorString = String(error).toLowerCase();
  const errorMessage = (error instanceof Error ? error.message : '').toLowerCase();
  const errorCode = (error as { code?: string }).code || '';

  return retryableErrors.some(pattern =>
    errorString.includes(pattern.toLowerCase()) ||
    errorMessage.includes(pattern.toLowerCase()) ||
    errorCode === pattern
  );
};

/**
 * Calculate delay with exponential backoff and jitter
 */
const calculateDelay = (
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number => {
  const exponentialDelay = initialDelay * Math.pow(multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter (±20%) to prevent thundering herd
  const jitter = cappedDelay * 0.2 * (Math.random() * 2 - 1);

  return Math.floor(cappedDelay + jitter);
};

/**
 * Retry a function with exponential backoff
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 * @returns The result of the function call
 * @throws RetryError if all retries are exhausted
 *
 * @example
 * const data = await withRetry(
 *   async () => supabase.rpc('my_function'),
 *   { maxRetries: 3, initialDelayMs: 1000 }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Attempt the function call
      const result = await fn();

      // If this is a Supabase response, check for errors
      if (result && typeof result === 'object' && 'error' in result) {
        const supabaseResult = result as { error?: { message?: string } };
        if (supabaseResult.error) {
          throw new Error(
            supabaseResult.error.message ||
            JSON.stringify(supabaseResult.error)
          );
        }
      }

      return result;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this is the last attempt, or error is not retryable, throw immediately
      if (
        attempt === config.maxRetries ||
        !isRetryableError(error, config.retryableErrors)
      ) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const retryError = new Error(
          `Failed after ${attempt + 1} attempt(s): ${errorMessage}`
        ) as RetryError;
        retryError.attempts = attempt + 1;
        retryError.lastError = lastError;
        throw retryError;
      }

      // Calculate delay and wait before next retry
      const delay = calculateDelay(
        attempt,
        config.initialDelayMs,
        config.maxDelayMs,
        config.backoffMultiplier
      );

      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `Attempt ${attempt + 1}/${config.maxRetries + 1} failed: ${errorMessage}. ` +
        `Retrying in ${delay}ms...`
      );

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Unknown error during retry');
}
