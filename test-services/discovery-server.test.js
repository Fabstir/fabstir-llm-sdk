import http from 'http';
import { describe, it, beforeAll, expect } from 'vitest';

describe('Discovery Server', () => {
  let response;
  
  beforeAll((done) => {
    http.get('http://localhost:3003/hosts', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        response = { status: res.statusCode, headers: res.headers, body: data };
        done();
      });
    }).on('error', done);
  });

  it('responds to /api/hosts with host list', () => {
    expect(response.status).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.hosts).toBeDefined();
    expect(Array.isArray(data.hosts)).toBe(true);
  });

  it('returns JSON content-type', () => {
    expect(response.headers['content-type']).toContain('application/json');
  });

  it('includes required host fields', () => {
    const data = JSON.parse(response.body);
    const host = data.hosts[0];
    expect(host.id).toBeDefined();
    expect(host.address).toBeDefined();
    expect(host.url).toBeDefined();
    expect(host.models).toBeDefined();
    expect(host.pricePerToken).toBeDefined();
    expect(host.available).toBeDefined();
  });

  it('handles CORS headers', () => {
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });
});