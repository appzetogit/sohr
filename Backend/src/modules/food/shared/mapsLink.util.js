/**
 * Google Maps links pasted by the admin for a WhatsApp order (the customer's shared
 * location). The rider opens the link; when it carries coordinates we also use them as
 * the delivery pin, which gives the rider a map marker, trip distance and payout.
 *
 * Only Google Maps links are accepted, so nothing else can be passed on to riders.
 */
import { logger } from '../../../utils/logger.js';

const ALLOWED_HOSTS = new Set([
    'maps.app.goo.gl',
    'goo.gl',
    'maps.google.com',
    'google.com',
    'www.google.com',
    'maps.google.co.in',
    'google.co.in',
    'www.google.co.in',
]);
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);

export const MAX_MAPS_LINK_LENGTH = 1000;

function parseUrl(value) {
    try {
        const url = new URL(String(value || '').trim());
        return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
    } catch {
        return null;
    }
}

/** True for an http(s) Google Maps link (full or short). goo.gl links must be /maps ones. */
export function isGoogleMapsLink(value) {
    const url = parseUrl(value);
    if (!url) return false;
    const host = url.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(host)) return false;
    if (host === 'goo.gl') return url.pathname.startsWith('/maps');
    if (host === 'maps.app.goo.gl') return url.pathname.length > 1;
    if (host.startsWith('maps.')) return true;
    return url.pathname.startsWith('/maps');
}

const validPair = (lat, lng) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
        ? { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
        : null;

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const PAIR = new RegExp(`^\\s*${NUM}\\s*,\\s*\\+?${NUM}\\s*$`);

/**
 * Coordinates inside a Google Maps URL, or null. Prefers the dropped pin (!3d/!4d) over
 * the map viewport (@lat,lng), and reads q= / query= / ll= / destination= / daddr=.
 */
export function extractCoordsFromMapsUrl(value) {
    const raw = String(value || '');
    let decoded = raw;
    try {
        decoded = decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch {
        /* keep raw */
    }

    // Exact pin: ...!3d25.4513!4d81.8341
    const pin = decoded.match(new RegExp(`!3d${NUM}!4d${NUM}`));
    if (pin) {
        const p = validPair(Number(pin[1]), Number(pin[2]));
        if (p) return p;
    }

    const url = parseUrl(raw);
    if (url) {
        for (const key of ['q', 'query', 'll', 'destination', 'daddr', 'center']) {
            const v = url.searchParams.get(key);
            const m = v && v.replace(/^loc:/i, '').match(PAIR);
            if (m) {
                const p = validPair(Number(m[1]), Number(m[2]));
                if (p) return p;
            }
        }
        // /maps/place/25.45,81.83 or /maps/search/25.45,+81.83
        const segment = decodeURIComponent(url.pathname)
            .split('/')
            .find((part) => PAIR.test(part.replace(/\+/g, '')));
        if (segment) {
            const m = segment.replace(/\+/g, '').match(PAIR);
            const p = m && validPair(Number(m[1]), Number(m[2]));
            if (p) return p;
        }
    }

    // Map viewport: /@25.4513,81.8341,17z
    const at = decoded.match(new RegExp(`@${NUM},${NUM}`));
    if (at) {
        const p = validPair(Number(at[1]), Number(at[2]));
        if (p) return p;
    }
    return null;
}

/**
 * Follow a short link (maps.app.goo.gl) to the full Google Maps URL. Every hop must stay
 * on an allowed Google host, at most 5 hops, 5 seconds in total. Returns null on failure.
 */
async function expandShortLink(value, fetchImpl = fetch) {
    let current = parseUrl(value);
    const deadline = Date.now() + 5000;
    for (let hop = 0; current && hop < 5; hop += 1) {
        if (!ALLOWED_HOSTS.has(current.hostname.toLowerCase())) return null;
        if (!SHORT_HOSTS.has(current.hostname.toLowerCase()) && hop > 0) return current.toString();

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(500, deadline - Date.now()));
        try {
            const res = await fetchImpl(current.toString(), {
                method: 'GET',
                redirect: 'manual',
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (SOHR link check)' },
            });
            const location = res.headers.get('location');
            if (!location) return current.toString();
            current = parseUrl(new URL(location, current).toString());
        } finally {
            clearTimeout(timer);
        }
    }
    return current ? current.toString() : null;
}

/**
 * { link, lat, lng } for a pasted Google Maps link; lat/lng are null when the link has
 * no usable coordinates (e.g. a place name only). Never throws for network problems.
 */
export async function resolveMapsLink(value, { fetchImpl } = {}) {
    const link = String(value || '').trim();
    if (!link) return { link: '', lat: null, lng: null };

    let coords = extractCoordsFromMapsUrl(link);
    if (!coords && SHORT_HOSTS.has(parseUrl(link)?.hostname.toLowerCase())) {
        try {
            const expanded = await expandShortLink(link, fetchImpl);
            if (expanded) coords = extractCoordsFromMapsUrl(expanded);
        } catch (err) {
            logger.warn(`Could not expand maps link: ${err?.message || err}`);
        }
    }
    return { link, lat: coords?.lat ?? null, lng: coords?.lng ?? null };
}
