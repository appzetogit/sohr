/**
 * Run: node --test src/modules/food/shared/mapsLink.util.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isGoogleMapsLink, extractCoordsFromMapsUrl, resolveMapsLink } from './mapsLink.util.js';

test('only Google Maps links are accepted', () => {
    for (const ok of [
        'https://maps.app.goo.gl/AbC123xyz',
        'https://maps.google.com/?q=25.4513,81.8341',
        'https://www.google.com/maps/place/Civil+Lines/@25.45,81.83,17z',
        'https://goo.gl/maps/xyz123',
        'https://www.google.co.in/maps?q=25.45,81.83',
        'http://maps.google.com/maps?q=25.45,81.83',
    ]) {
        assert.equal(isGoogleMapsLink(ok), true, ok);
    }
    for (const bad of [
        'https://evil.example/maps?q=25,81',
        'https://www.google.com/search?q=sohr',
        'https://goo.gl/abc',
        'javascript:alert(1)',
        'maps.google.com/?q=25,81',
        'https://maps.google.com.evil.io/?q=1,2',
        '',
    ]) {
        assert.equal(isGoogleMapsLink(bad), false, bad);
    }
});

test('coordinates are read from the common link shapes', () => {
    const at = { lat: 25.4513, lng: 81.8341 };
    assert.deepEqual(extractCoordsFromMapsUrl('https://maps.google.com/?q=25.4513,81.8341'), at); // WhatsApp location
    assert.deepEqual(extractCoordsFromMapsUrl('https://www.google.com/maps/search/?api=1&query=25.4513%2C81.8341'), at);
    assert.deepEqual(extractCoordsFromMapsUrl('https://www.google.com/maps/@25.4513,81.8341,17z'), at);
    assert.deepEqual(extractCoordsFromMapsUrl('https://www.google.com/maps/place/25.4513,81.8341'), at);
    assert.deepEqual(extractCoordsFromMapsUrl('https://www.google.com/maps/search/25.4513,+81.8341?entry=tts'), at);
    assert.deepEqual(extractCoordsFromMapsUrl('https://www.google.com/maps/dir/?api=1&destination=25.4513,81.8341'), at);
});

test('the dropped pin wins over the map viewport', () => {
    const url =
        'https://www.google.com/maps/place/SOHR/@25.4400,81.8200,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d25.4513!4d81.8341';
    assert.deepEqual(extractCoordsFromMapsUrl(url), { lat: 25.4513, lng: 81.8341 });
});

test('links without coordinates, or with impossible ones, give null', () => {
    assert.equal(extractCoordsFromMapsUrl('https://www.google.com/maps/place/Civil+Lines,+Prayagraj'), null);
    assert.equal(extractCoordsFromMapsUrl('https://maps.google.com/?q=0,0'), null);
    assert.equal(extractCoordsFromMapsUrl('https://maps.google.com/?q=125.4,81.8'), null);
});

test('short links are followed, but only through Google hosts', async () => {
    const hops = {
        'https://maps.app.goo.gl/Abc': 'https://www.google.com/maps/place/x/@25.1,81.1,17z/data=!3d25.4513!4d81.8341',
        'https://maps.app.goo.gl/Evil': 'https://evil.example/@25.4513,81.8341',
    };
    const fakeFetch = async (url) => ({
        headers: { get: (name) => (name === 'location' ? hops[url] || null : null) },
    });

    assert.deepEqual(await resolveMapsLink('https://maps.app.goo.gl/Abc', { fetchImpl: fakeFetch }), {
        link: 'https://maps.app.goo.gl/Abc',
        lat: 25.4513,
        lng: 81.8341,
    });
    const evil = await resolveMapsLink('https://maps.app.goo.gl/Evil', { fetchImpl: fakeFetch });
    assert.equal(evil.lat, null, 'a redirect off Google must not be trusted');

    const broken = await resolveMapsLink('https://maps.app.goo.gl/Down', {
        fetchImpl: async () => {
            throw new Error('network down');
        },
    });
    assert.deepEqual(broken, { link: 'https://maps.app.goo.gl/Down', lat: null, lng: null });
});
