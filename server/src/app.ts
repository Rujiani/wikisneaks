import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import router from './routes/index.js';
import { ZodError } from 'zod';
import { isHttpError } from 'http-errors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';

const buildApp = (): Express => {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  const environment = process.env.NODE_ENV || 'development';
  if (environment !== 'test') {
    app.use(environment === 'development' ? morgan('dev') : morgan('tiny'));
  }

  app.get('/health', (req: Request, res: Response) => {
    res.send('app is running perfectly');
  });

  app.use('/api', router);

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof ZodError) {
      return res
        .status(400)
        .json({ message: 'Validation error', issues: err.issues });
    }

    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (isHttpError(err)) {
      return res.status(err.status).json({ message: err.message });
    }

    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  });

  return app;
};

export default buildApp;
