import type http from 'node:http';
import crypto from 'node:crypto';
import type { AuthenticatedContext } from '../types/auth.types.js';
import type { AuthService } from '../lib/auth/service.js';
import { AuthorizationError } from '../lib/auth/rbac.js';

// Simple IP-based general rate limiter (120 req / min)
const rateLimits = new Map<string, { count: number; resetTime: number }>();
export function checkRateLimit(ip: string, limit = 120, windowMs = 60000): boolean {
  const now = Date.now();
  const record = rateLimits.get(ip);
  if (!record || now > record.resetTime) {
    rateLimits.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (record.count >= limit) {
    return false;
  }
  record.count++;
  return true;
}

// Dedicated login rate limiter (max 5 attempts per minute per IP)
const loginAttempts = new Map<string, { count: number; resetTime: number }>();
export function checkLoginRateLimit(ip: string, limit = 5, windowMs = 60000): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now > record.resetTime) {
    loginAttempts.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (record.count >= limit) {
    return false;
  }
  record.count++;
  return true;
}

/**
 * Formats a secure session cookie string with SameSite and Secure flags in production.
 */
export function formatSessionCookie(token: string, maxAgeSeconds = 604800): string {
  const isProd = process.env.NODE_ENV === 'production';
  return `session_token=${token}; HttpOnly; SameSite=Strict; Path=/${isProd ? '; Secure' : ''}; Max-Age=${maxAgeSeconds}`;
}

/**
 * Parses request payload as JSON with maximum size limit guard.
 */
export async function parseJsonBody<T = any>(req: http.IncomingMessage, maxBytes = 50 * 1024 * 1024): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > maxBytes) {
        reject(new Error('Request payload exceeds size limit'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({} as T);
      try {
        resolve(JSON.parse(data));
      } catch (err: any) {
        reject(new Error(`Malformed JSON body: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Parses request payload as raw binary buffer (for multipart / dataset uploads).
 */
export async function parseBufferBody(req: http.IncomingMessage, maxBytes = 60 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(new Error('Uploaded file exceeds size limit (50MB)'));
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Authenticates request via Bearer token or session cookie with timing-safe CSRF validation on mutations.
 */
export async function extractAuthContext(
  req: http.IncomingMessage,
  authService: AuthService,
  options?: { skipCsrf?: boolean }
): Promise<AuthenticatedContext> {
  let token = '';
  let fromCookie = false;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/session_token=([^;]+)/);
    if (match && match[1]) {
      token = match[1];
      fromCookie = true;
    }
  }

  if (!token) {
    throw new AuthorizationError('Authentication required. Missing session token.', 401);
  }

  const auth = await authService.authenticateToken(token);

  // Enforce CSRF validation for cookie-authenticated mutating HTTP methods
  const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method || '');
  if (fromCookie && isMutation && !options?.skipCsrf) {
    const csrfHeader = req.headers['x-csrf-token'];
    if (!csrfHeader || typeof csrfHeader !== 'string') {
      throw new AuthorizationError('CSRF token missing for cookie-authenticated mutation request.', 403);
    }
    const provided = Buffer.from(csrfHeader);
    const expected = Buffer.from(auth.csrfToken);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      throw new AuthorizationError('Invalid CSRF token.', 403);
    }
  }

  return auth;
}

/**
 * Sanitizes internal host paths and database connection strings before returning error messages to clients.
 */
export function sanitizeErrorMessage(rawMessage: string): string {
  return rawMessage
    .replace(/[a-zA-Z]:\\[^\s:"]+/g, '<host_path>')
    .replace(/\/home\/[^\s:"]+/g, '<host_path>')
    .replace(/:\/\/([^:]+):([^@]+)@/g, '://$1:***@');
}

import path from 'node:path';
import fs from 'node:fs';

/**
 * Attempts to serve static assets from dist/client in production.
 */
export function tryServeStatic(pathname: string, res: http.ServerResponse): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  const clientDist = path.resolve(process.cwd(), 'dist', 'client');
  const staticPath = path.join(clientDist, pathname === '/' ? 'index.html' : pathname);
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const mimes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
    };
    res.writeHead(200, { 'Content-Type': mimes[path.extname(staticPath)] || 'application/octet-stream' });
    fs.createReadStream(staticPath).pipe(res);
    return true;
  }
  return false;
}

