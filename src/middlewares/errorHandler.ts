import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
    console.error(err.stack);
    console.log(next);
    res.status(500).send({ message: 'Ha ocurrido un error', error: err.message });
}
