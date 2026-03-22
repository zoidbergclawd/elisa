/**
 * Lightweight static file server using Node.js built-in http module.
 *
 * Replaces `npx serve` to avoid requiring npm/npx on fresh installs
 * where only the Electron node.exe shim is available.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
};

export interface StaticServer {
  url: string;
  close: () => void;
}

/**
 * Start a static file server for the given directory.
 * Returns a promise that resolves once the server is listening.
 */
export function startStaticServer(dir: string, port: number): Promise<StaticServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url ?? '/', `http://localhost:${port}`).pathname);
      let filePath = path.join(dir, urlPath === '/' ? 'index.html' : urlPath);

      // Prevent path traversal
      if (!filePath.startsWith(dir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      // If directory, try index.html
      try {
        if (fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }
      } catch { /* fall through to 404 */ }

      if (!fs.existsSync(filePath)) {
        // SPA fallback: serve index.html for non-file routes
        const indexPath = path.join(dir, 'index.html');
        if (fs.existsSync(indexPath) && !path.extname(urlPath)) {
          filePath = indexPath;
        } else {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      try {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
        res.end(data);
      } catch {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        url: `http://localhost:${actualPort}`,
        close: () => { try { server.close(); } catch { /* ignore */ } },
      });
    });
  });
}
