import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FHIRClient, FHIRError } from '../src/fhir/client.js';

// Mock the global fetch
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: {
  ok: boolean;
  status: number;
  statusText?: string;
  body?: unknown;
}): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText ?? 'OK',
    json: vi.fn().mockResolvedValue(response.body ?? {}),
  }) as unknown as typeof fetch;
}

// ══════════════════════════════════════════════════════════════════════════════
// URL construction
// ══════════════════════════════════════════════════════════════════════════════

describe('FHIRClient - URL construction', () => {
  it('builds correct URL for read', async () => {
    mockFetch({
      ok: true,
      status: 200,
      body: { resourceType: 'Patient', id: '123' },
    });

    const client = new FHIRClient('http://fhir.example.com/r4');
    await client.read('Patient', '123');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://fhir.example.com/r4/Patient/123',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('strips trailing slashes from base URL', async () => {
    mockFetch({
      ok: true,
      status: 200,
      body: { resourceType: 'Patient', id: '123' },
    });

    const client = new FHIRClient('http://fhir.example.com/r4///');
    await client.read('Patient', '123');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://fhir.example.com/r4/Patient/123',
      expect.anything(),
    );
  });

  it('builds correct URL for search with params', async () => {
    mockFetch({
      ok: true,
      status: 200,
      body: { resourceType: 'Bundle', type: 'searchset', entry: [] },
    });

    const client = new FHIRClient('http://fhir.example.com/r4');
    await client.search('Condition', { patient: 'p1', 'clinical-status': 'active' });

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const url = fetchCall[0] as string;
    expect(url).toContain('Condition?');
    expect(url).toContain('patient=p1');
    expect(url).toContain('clinical-status=active');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Authorization header
// ══════════════════════════════════════════════════════════════════════════════

describe('FHIRClient - authorization', () => {
  it('includes Bearer token when access token is provided', async () => {
    mockFetch({
      ok: true,
      status: 200,
      body: { resourceType: 'Patient', id: '123' },
    });

    const client = new FHIRClient('http://fhir.example.com/r4', 'my-secret-token');
    await client.read('Patient', '123');

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer my-secret-token');
  });

  it('omits Authorization header when no access token', async () => {
    mockFetch({
      ok: true,
      status: 200,
      body: { resourceType: 'Patient', id: '123' },
    });

    const client = new FHIRClient('http://fhir.example.com/r4');
    await client.read('Patient', '123');

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('always includes FHIR content type headers', async () => {
    mockFetch({
      ok: true,
      status: 200,
      body: { resourceType: 'Patient', id: '123' },
    });

    const client = new FHIRClient('http://fhir.example.com/r4');
    await client.read('Patient', '123');

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Accept).toBe('application/fhir+json');
    expect(headers['Content-Type']).toBe('application/fhir+json');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Error handling
// ══════════════════════════════════════════════════════════════════════════════

describe('FHIRClient - error handling', () => {
  it('throws FHIRError on non-200 response', async () => {
    mockFetch({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      body: {},
    });

    const client = new FHIRClient('http://fhir.example.com/r4');
    await expect(client.read('Patient', '999')).rejects.toThrow(FHIRError);
  });

  it('includes status code in FHIRError', async () => {
    mockFetch({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      body: {},
    });

    const client = new FHIRClient('http://fhir.example.com/r4');
    try {
      await client.read('Patient', '999');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FHIRError);
      expect((err as FHIRError).status).toBe(403);
    }
  });

  it('extracts diagnostics from OperationOutcome', async () => {
    mockFetch({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      body: {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'not-found',
            diagnostics: 'Resource Patient/999 not found',
          },
        ],
      },
    });

    const client = new FHIRClient('http://fhir.example.com/r4');
    try {
      await client.read('Patient', '999');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FHIRError);
      expect((err as FHIRError).message).toContain('Patient/999 not found');
      expect((err as FHIRError).outcome?.issue[0].diagnostics).toContain('Patient/999 not found');
    }
  });

  it('handles non-JSON error bodies gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
    }) as unknown as typeof fetch;

    const client = new FHIRClient('http://fhir.example.com/r4');
    try {
      await client.read('Patient', '999');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FHIRError);
      expect((err as FHIRError).status).toBe(500);
      expect((err as FHIRError).message).toContain('500');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Pagination
// ══════════════════════════════════════════════════════════════════════════════

describe('FHIRClient - pagination', () => {
  it('follows next links until exhausted', async () => {
    const page1 = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        { resource: { resourceType: 'Condition', id: 'c1' } },
      ],
      link: [
        { relation: 'next', url: 'http://fhir.example.com/r4/Condition?page=2' },
      ],
    };

    const page2 = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        { resource: { resourceType: 'Condition', id: 'c2' } },
      ],
      link: [], // no more pages
    };

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue(callCount === 1 ? page1 : page2),
      };
    }) as unknown as typeof fetch;

    const client = new FHIRClient('http://fhir.example.com/r4');
    const results = await client.searchAll('Condition', { patient: 'p1' });

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('c1');
    expect(results[1].id).toBe('c2');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('respects maxPages limit', async () => {
    const makeBundle = (id: string) => ({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: { resourceType: 'Condition', id } }],
      link: [
        { relation: 'next', url: `http://fhir.example.com/r4/Condition?page=next` },
      ],
    });

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue(makeBundle(`c${callCount}`)),
      };
    }) as unknown as typeof fetch;

    const client = new FHIRClient('http://fhir.example.com/r4');
    const results = await client.searchAll('Condition', { patient: 'p1' }, 3);

    expect(results).toHaveLength(3);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Entry extraction
// ══════════════════════════════════════════════════════════════════════════════

describe('FHIRClient - entry extraction', () => {
  it('extracts resources from bundle entries', async () => {
    mockFetch({
      ok: true,
      status: 200,
      body: {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          { resource: { resourceType: 'Observation', id: 'o1' } },
          { resource: { resourceType: 'Observation', id: 'o2' } },
        ],
      },
    });

    const client = new FHIRClient('http://fhir.example.com/r4');
    const results = await client.searchEntries('Observation', { patient: 'p1' });

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('o1');
    expect(results[1].id).toBe('o2');
  });

  it('returns empty array when bundle has no entries', async () => {
    mockFetch({
      ok: true,
      status: 200,
      body: {
        resourceType: 'Bundle',
        type: 'searchset',
      },
    });

    const client = new FHIRClient('http://fhir.example.com/r4');
    const results = await client.searchEntries('Observation', { patient: 'p1' });

    expect(results).toHaveLength(0);
  });

  it('filters out entries without a resource property', async () => {
    mockFetch({
      ok: true,
      status: 200,
      body: {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          { resource: { resourceType: 'Observation', id: 'o1' } },
          { fullUrl: 'http://example.com/deleted' }, // no resource
          { resource: { resourceType: 'Observation', id: 'o3' } },
        ],
      },
    });

    const client = new FHIRClient('http://fhir.example.com/r4');
    const results = await client.searchEntries('Observation', { patient: 'p1' });

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('o1');
    expect(results[1].id).toBe('o3');
  });
});
