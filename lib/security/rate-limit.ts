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

type RateLimitResult = { success: boolean; limit: number; remaining: number };

/**
 * Counts one hit in the shared store (public.rate_limit_hit), so limits hold
 * across server instances. Returns null if the store is unavailable, e.g.
 * before the migration is applied or during a database outage.
 */
async function sharedRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult | null> {
    try {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const { data, error } = await (createAdminClient() as any).rpc('rate_limit_hit', {
            p_key: key,
            p_limit: limit,
            p_window_ms: windowMs,
        });
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row || typeof row.allowed !== 'boolean') return null;
        return { success: row.allowed, limit, remaining: Number(row.remaining ?? 0) };
    } catch {
        return null;
    }
}

/**
 * Rate-limits a request by endpoint and platform-provided client IP.
 * The per-instance counter always runs as a cheap first line; the shared
 * store is authoritative when reachable. Pass `shared: false` for very
 * high-volume, low-risk endpoints where a database round trip per call
 * is not worth it.
 */
export async function checkRateLimit(
    req: Request,
    endpointName: string = 'api',
    limit: number = 5,
    windowMs: number = 60000,
    options: { shared?: boolean } = {}
): Promise<RateLimitResult> {
    const key = `${endpointName}:${getClientIp(req.headers)}`;

    const local = rateLimit(key, limit, windowMs);
    if (!local.success || options.shared === false) return local;

    return (await sharedRateLimit(key, limit, windowMs)) ?? local;
}
