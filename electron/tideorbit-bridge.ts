import http, { IncomingHttpHeaders, Server } from 'http';

const DEFAULT_BRIDGE_PORT = 4317;
const MAX_BODY_BYTES = 1024 * 1024;

let bridgeServer: Server | null = null;
let targetPort = 3000;

function isAllowedPath(pathname: string): boolean {
  return pathname === '/api/tideorbit/health'
    || pathname === '/api/tideorbit/scans'
    || /^\/api\/tideorbit\/scans\/[A-Za-z0-9_-]+$/.test(pathname);
}

function filteredHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const out: IncomingHttpHeaders = { ...headers };
  delete out.host;
  delete out.connection;
  delete out['proxy-connection'];
  delete out['transfer-encoding'];
  return out;
}

export function updateTideOrbitBridgeTarget(port: number): void {
  targetPort = port;
}

export function startTideOrbitBridge(
  nextPort: number,
  logger: (level: string, ...args: any[]) => void,
): Promise<number> {
  targetPort = nextPort;
  if (bridgeServer) return Promise.resolve(DEFAULT_BRIDGE_PORT);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const method = String(req.method || 'GET').toUpperCase();
        const parsed = new URL(req.url || '/', 'http://127.0.0.1');
        if (!isAllowedPath(parsed.pathname)) {
          res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        if (!['GET', 'POST'].includes(method)) {
          res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'GET, POST', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const length = Number(req.headers['content-length'] || 0);
        if (length > MAX_BODY_BYTES) {
          res.writeHead(413, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'Request too large' }));
          return;
        }

        const upstream = http.request(
          {
            hostname: '127.0.0.1',
            port: targetPort,
            path: parsed.pathname + parsed.search,
            method,
            headers: {
              ...filteredHeaders(req.headers),
              host: `127.0.0.1:${targetPort}`,
              'x-tideorbit-bridge': 'electron',
            },
            timeout: 20_000,
          },
          (upstreamRes) => {
            const headers = { ...upstreamRes.headers };
            delete headers.connection;
            delete headers['transfer-encoding'];
            headers['cache-control'] = 'no-store';
            headers['x-content-type-options'] = 'nosniff';
            res.writeHead(upstreamRes.statusCode || 502, headers);
            upstreamRes.pipe(res);
          },
        );

        upstream.on('timeout', () => {
          upstream.destroy(new Error('TideOrbit bridge upstream timeout'));
        });
        upstream.on('error', (err) => {
          logger('ERROR', '[TideOrbitBridge] Upstream error:', err.message);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          }
          res.end(JSON.stringify({ error: 'Local scanner service unavailable' }));
        });

        let received = 0;
        req.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_BODY_BYTES) {
            req.destroy();
            upstream.destroy();
          }
        });
        req.pipe(upstream);
      } catch (err: any) {
        logger('ERROR', '[TideOrbitBridge] Request error:', err?.message || String(err));
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        }
        res.end(JSON.stringify({ error: 'Bridge request failed' }));
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger('ERROR', `[TideOrbitBridge] Port ${DEFAULT_BRIDGE_PORT} is already in use. Stop the conflicting service or set your tunnel to the app only after resolving it.`);
      } else {
        logger('ERROR', '[TideOrbitBridge] Server error:', err.message);
      }
      reject(err);
    });

    server.listen(DEFAULT_BRIDGE_PORT, '127.0.0.1', () => {
      bridgeServer = server;
      logger('INFO', `[TideOrbitBridge] Ready at http://127.0.0.1:${DEFAULT_BRIDGE_PORT} -> Next.js :${targetPort}`);
      resolve(DEFAULT_BRIDGE_PORT);
    });
  });
}

export function stopTideOrbitBridge(): void {
  if (!bridgeServer) return;
  try {
    bridgeServer.close();
  } catch {
    // best effort
  }
  bridgeServer = null;
}

export const TIDEORBIT_BRIDGE_PORT = DEFAULT_BRIDGE_PORT;
