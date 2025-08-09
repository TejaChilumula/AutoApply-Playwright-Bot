export class RateLimiter {
  constructor({ capacity = 120, refillIntervalMs = 1000 * 60 * 60 } = {}) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillIntervalMs = refillIntervalMs;
    this.lastRefill = Date.now();
  }
  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      const tokensPerMs = this.capacity / this.refillIntervalMs;
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * tokensPerMs);
      this.lastRefill = now;
    }
  }
  tryRemove(n = 1) {
    this.refill();
    if (this.tokens >= n) { this.tokens -= n; return true; }
    return false;
  }
  getStatus() { this.refill(); return { capacity: this.capacity, tokens: Math.floor(this.tokens) }; }
}
