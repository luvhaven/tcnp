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
 * The client IP to key limits on. On Vercel `x-real-ip` is set by the platform
 * and cannot be supplied by the client, whereas the first `x-forwarded-for`
 * entry is whatever the client sent. Only when `x-real-ip` is missing (local
 * dev, other hosts) do we fall back to the last `x-forwarded-for` hop, which is
 * the one appended by the nearest proxy.
 */
export function getClientIp(headers: Headers): string {
    const realIp = headers.get('x-real-ip')?.trim();
    if (realIp) return realIp;

    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) {
        const hops = forwarded.split(',').map((hop) => hop.trim()).filter(Boolean);
        if (hops.length > 0) return hops[hops.length - 1];
    }

    return '127.0.0.1';
}

/**
 * Convenience wrapper for Next.js Request object: keys the sliding window on
 * the platform-provided client IP.
 */
export function checkRateLimit(req: Request, endpointName: string = 'api', limit: number = 5, windowMs: number = 60000) {
    const key = `${endpointName}:${getClientIp(req.headers)}`;

    return rateLimit(key, limit, windowMs);
}
