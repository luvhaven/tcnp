/**
 * In-memory IP-based rate limiter for API routes.
 * Note: In a true multi-region serverless environment (like Vercel Edge), 
 * this state is maintained per-isolate. While not completely synchronized 
 * across a global cluster without Redis, it effectively mitigates massive 
 * burst abuse and loop attacks against specific endpoints.
 */

type CacheEntry = {
    count: number;
    resetAt: number;
};

const map = new Map<string, CacheEntry>();

export function rateLimit(ip: string, limit: number, windowMs: number): { success: boolean; limit: number; remaining: number } {
    const now = Date.now();
    const entry = map.get(ip);

    // Filter out expired entries periodically to prevent memory leaks
    if (map.size > 5000) {
        const threshold = now - windowMs;
        map.forEach((value, key) => {
            if (value.resetAt < threshold) {
                map.delete(key);
            }
        });
    }

    if (!entry) {
        map.set(ip, {
            count: 1,
            resetAt: now + windowMs,
        });
        return { success: true, limit, remaining: limit - 1 };
    }

    // If window expired, reset
    if (now > entry.resetAt) {
        entry.count = 1;
        entry.resetAt = now + windowMs;
        map.set(ip, entry);
        return { success: true, limit, remaining: limit - 1 };
    }

    // Inside window
    entry.count += 1;
    if (entry.count > limit) {
        return { success: false, limit, remaining: 0 };
    }

    return { success: true, limit, remaining: limit - entry.count };
}

/**
 * Convenience wrapper for Next.js Request object to extract IP securely
 * and execute the sliding window limit.
 */
export function checkRateLimit(req: Request, endpointName: string = 'api', limit: number = 5, windowMs: number = 60000) {
    // Attempt to parse forwarded/real IP from standard headers
    const ip = req.headers.get('x-forwarded-for')
        || req.headers.get('x-real-ip')
        || '127.0.0.1'; // Fallback if no header proxies

    // Normalize IPv6 localhost edge cases
    const normalizedIp = ip.split(',')[0].trim();

    // Namespace the IP with the endpoint
    const key = `${endpointName}:${normalizedIp}`;

    return rateLimit(key, limit, windowMs);
}
