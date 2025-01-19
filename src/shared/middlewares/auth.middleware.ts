import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { userId: string };
    }
  }
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    res
      .status(401)
      .json({ message: "Acceso no autorizado: Token no encontrado" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
    };

    if (!decoded.userId) {
      res.status(401).json({ message: "Token inválido" });
      return;
    }

    req.user = { userId: decoded.userId };
    next();
  } catch (error) {
    console.error("Error en autenticación:", error);
    res.status(401).json({ message: "Token inválido o expirado" });
    return;
  }
};
