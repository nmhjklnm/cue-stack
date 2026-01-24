class TokenBucket {
  private tokens: number
  private lastRefill: number
  private readonly capacity: number
  private readonly refillRate: number

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity
    this.refillRate = refillRate
    this.tokens = capacity
    this.lastRefill = Date.now()
  }

  private refill() {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    const tokensToAdd = elapsed * this.refillRate
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd)
    this.lastRefill = now
  }

  consume(tokens: number = 1): boolean {
    this.refill()
    if (this.tokens >= tokens) {
      this.tokens -= tokens
      return true
    }
    return false
  }

  getAvailableTokens(): number {
    this.refill()
    return Math.floor(this.tokens)
  }
}

const buckets = new Map<string, TokenBucket>()

export function checkRateLimit(userId: string, limit: number = 60): boolean {
  if (!buckets.has(userId)) {
    buckets.set(userId, new TokenBucket(limit, limit / 60))
  }
  
  const bucket = buckets.get(userId)!
  return bucket.consume()
}

export function getRemainingTokens(userId: string, limit: number = 60): number {
  if (!buckets.has(userId)) {
    buckets.set(userId, new TokenBucket(limit, limit / 60))
  }
  
  const bucket = buckets.get(userId)!
  return bucket.getAvailableTokens()
}

export class RateLimitError extends Error {
  constructor(message: string = 'Rate limit exceeded. Please try again later.') {
    super(message)
    this.name = 'RateLimitError'
  }
}
