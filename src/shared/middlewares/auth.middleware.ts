// src/shared/middlewares/auth.middleware.ts
// Authentication middleware — verifies JWT tokens and attaches user to request.
// When USE_SUPABASE=true: verifies via Supabase auth.getUser().
// When USE_SUPABASE=false: verifies via JWT_SECRET (Firebase JWT fallback).

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getEnv } from '@config/env.validation';
import { getSupabaseAnon } from '@config/supabase';
import { RevokedTokenRepositorySupabase } from '@/modules/auth/revokedToken.repository.supabase';
import crypto from 'crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { userId: string };
    }
  }
}

// Public routes that skip authentication
const PUBLIC_ROUTES = [
  '/health',
  '/api/health',
  '/api/auth/login/google',   // Google OAuth login
  '/api/auth/refresh',        // Token refresh
  '/api/auth/logout',         // Logout
];

function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some((route) => path.startsWith(route));
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // Skip auth for public routes
  if (isPublicRoute(req.path)) {
    next();
    return;
  }

  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'Acceso no autorizado: Token no encontrado' });
    return;
  }

  try {
    const env = getEnv();

    // Check if token hash is revoked
    const revokedRepo = new RevokedTokenRepositorySupabase();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const isRevoked = await revokedRepo.isRevoked(tokenHash);
    if (isRevoked) {
      res.status(401).json({ message: 'Token revocado' });
      return;
    }

    let userId: string;

    if (env.USE_SUPABASE === 'true') {
      // Supabase: verify token via supabase.auth.getUser()
      const supabase = getSupabaseAnon();
      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data.user) {
        res.status(401).json({ message: 'Token inválido' });
        return;
      }

      userId = data.user.id;
    } else {
      // Firestore/JWT fallback: verify using JWT_SECRET
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        userId: string;
      };

      if (!decoded.userId) {
        res.status(401).json({ message: 'Token inválido' });
        return;
      }

      userId = decoded.userId;
    }

    req.user = { userId };
    next();
  } catch (error) {
    console.error('Error en autenticación:', error);

    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        message: 'Token expirado',
        code: 'token_expired',
        expiredAt: error.expiredAt,
      });
      return;
    }

    res.status(401).json({ message: 'Token inválido' });
  }
};