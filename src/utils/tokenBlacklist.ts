/**
 * Simple in-memory token blacklist
 * In production, use Redis for distributed systems
 */

class TokenBlacklist {
  private blacklist: Map<string, number> = new Map();

  constructor() {
    // Clean up expired tokens every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Add a token to the blacklist
   * @param token - The token to blacklist
   * @param expiresAt - Unix timestamp when the token expires
   */
  add(token: string, expiresAt: number): void {
    this.blacklist.set(token, expiresAt);
  }

  /**
   * Check if a token is blacklisted
   * @param token - The token to check
   * @returns true if the token is blacklisted
   */
  isBlacklisted(token: string): boolean {
    const expiresAt = this.blacklist.get(token);
    if (!expiresAt) return false;
    
    // If token has expired, remove it from blacklist (it's already invalid)
    if (expiresAt < Date.now() / 1000) {
      this.blacklist.delete(token);
      return false;
    }
    
    return true;
  }

  /**
   * Remove expired tokens from the blacklist
   */
  private cleanup(): void {
    const now = Date.now() / 1000;
    for (const [token, expiresAt] of this.blacklist.entries()) {
      if (expiresAt < now) {
        this.blacklist.delete(token);
      }
    }
  }

  /**
   * Get the size of the blacklist (for monitoring)
   */
  size(): number {
    return this.blacklist.size;
  }
}

// Export singleton instance
export const tokenBlacklist = new TokenBlacklist();