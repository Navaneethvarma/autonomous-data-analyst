import type { RouteHandler } from '../types.js';
import { checkLoginRateLimit, formatSessionCookie } from '../helpers.js';

export const handleAuthRoutes: RouteHandler = async (ctx) => {
  const { req, res, pathname, clientIp, services, parseJsonBody, getAuthContext, sendJson } = ctx;
  const { auth: authService } = services;

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await parseJsonBody();
    if (!body.email || !body.password || !body.name) {
      sendJson(400, { error: 'email, password, and name are required' });
      return true;
    }
    const result = await authService.register(body);
    res.setHeader('Set-Cookie', formatSessionCookie(result.token));
    sendJson(201, {
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      organization: result.organization,
      role: 'admin',
      token: result.token,
      csrfToken: result.csrfToken,
    });
    return true;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await parseJsonBody();

    if (!checkLoginRateLimit(clientIp)) {
      sendJson(429, { error: 'Too many login attempts. Please wait 1 minute.' });
      return true;
    }

    if (!body.email || !body.password) {
      sendJson(400, { error: 'email and password are required' });
      return true;
    }
    const result = await authService.login(body);
    res.setHeader('Set-Cookie', formatSessionCookie(result.token));
    sendJson(200, {
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      organization: result.organization,
      role: result.role,
      token: result.token,
      csrfToken: result.csrfToken,
    });
    return true;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    let token = '';
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/session_token=([^;]+)/);
      if (match && match[1]) token = match[1];
    }
    if (token) {
      await authService.logout(token);
    }
    res.setHeader('Set-Cookie', formatSessionCookie('', 0));
    sendJson(200, { message: 'Logged out successfully' });
    return true;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const auth = await getAuthContext();
    sendJson(200, {
      user: { id: auth.user.id, email: auth.user.email, name: auth.user.name },
      organization: auth.organization,
      role: auth.role,
      csrfToken: auth.csrfToken,
    });
    return true;
  }

  if (pathname === '/api/auth/members' && req.method === 'POST') {
    const auth = await getAuthContext();
    const body = await parseJsonBody();
    if (!body.email || !body.role) {
      sendJson(400, { error: 'email and role are required' });
      return true;
    }
    await authService.addMember(auth, body.email, body.role);
    sendJson(200, { message: `Member ${body.email} updated to role ${body.role}` });
    return true;
  }

  return false;
};
