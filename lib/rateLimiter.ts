/**
 * Rate limiter utility to control the rate of API requests
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private processing = false;
  private lastRequestTime = 0;

  constructor(
    private requestsPerSecond: number,
    private minDelayMs: number = 0
  ) {}

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const fn = this.queue.shift();

    if (fn) {
      // Calculate delay based on rate limit
      const minInterval = 1000 / this.requestsPerSecond;
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      const delay = Math.max(
        this.minDelayMs,
        minInterval - timeSinceLastRequest,
        0
      );

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      this.lastRequestTime = Date.now();
      await fn();
    }

    // Process next item
    this.processQueue();
  }

  /**
   * Clear the queue
   */
  clear() {
    this.queue = [];
    this.processing = false;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}

/**
 * Create a rate limiter for RingCentral API
 * RingCentral has rate limits, typically around 50 requests per user per minute
 * We'll be conservative and use 30 requests per minute
 */
export const ringCentralRateLimiter = new RateLimiter(
  0.5, // 0.5 requests per second = 30 per minute
  500  // Minimum 500ms delay between requests
);