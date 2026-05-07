import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FHIRClient, clearFhirCache } from '../src/fhir/client.js';

describe('FHIR client TTL cache', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.FHIR_CACHE;
    delete process.env.FHIR_CACHE_TTL_MS;
    clearFhirCache();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.FHIR_CACHE;
    delete process.env.FHIR_CACHE_TTL_MS;
  });

  it('serves the second identical GET from cache', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ resourceType: 'Patient', id: 'p-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const client = new FHIRClient('http://hapi.fhir.org/baseR4');
    const first = await client.read('Patient', 'p-1');
    const second = await client.read('Patient', 'p-1');
    expect(first).toEqual(second);
    expect(calls).toBe(1);
  });

  it('honors FHIR_CACHE=off (each call hits the wire)', async () => {
    process.env.FHIR_CACHE = 'off';
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ resourceType: 'Patient', id: 'p-1' }), { status: 200 });
    }) as typeof fetch;
    const client = new FHIRClient('http://hapi.fhir.org/baseR4');
    await client.read('Patient', 'p-1');
    await client.read('Patient', 'p-1');
    expect(calls).toBe(2);
  });

  it('honors FHIR_CACHE_TTL_MS=0 (disabled)', async () => {
    process.env.FHIR_CACHE_TTL_MS = '0';
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ resourceType: 'Patient', id: 'p-1' }), { status: 200 });
    }) as typeof fetch;
    const client = new FHIRClient('http://hapi.fhir.org/baseR4');
    await client.read('Patient', 'p-1');
    await client.read('Patient', 'p-1');
    expect(calls).toBe(2);
  });

  it('different access tokens are different cache keys', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ resourceType: 'Patient', id: 'p-1' }), { status: 200 });
    }) as typeof fetch;
    const a = new FHIRClient('http://hapi.fhir.org/baseR4', 'token-A');
    const b = new FHIRClient('http://hapi.fhir.org/baseR4', 'token-B');
    await a.read('Patient', 'p-1');
    await b.read('Patient', 'p-1');
    expect(calls).toBe(2);
  });

  it('evicts after TTL', async () => {
    process.env.FHIR_CACHE_TTL_MS = '50';
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ resourceType: 'Patient', id: 'p-1' }), { status: 200 });
    }) as typeof fetch;
    const client = new FHIRClient('http://hapi.fhir.org/baseR4');
    await client.read('Patient', 'p-1');
    await new Promise((r) => setTimeout(r, 80));
    await client.read('Patient', 'p-1');
    expect(calls).toBe(2);
  });
});
