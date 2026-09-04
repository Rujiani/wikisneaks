import 'dotenv/config';
import buildApp from './app.js';
import { connectDB, closeDB } from './prisma/db.js';
import { deleteExpiredRefreshTokens } from './repositories/token.repository.js';
import cron from 'node-cron';

const startapp = async () => {
  const PORT = process.env.PORT ?? 3000;
  const app = buildApp();
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`app Listening at http://localhost:${PORT}`);
  });

  // Drop expired refresh rows once a day (server local midnight).
  cron.schedule('0 0 * * *', async () => {
    await deleteExpiredRefreshTokens();
  });

  const shutdown = (signal: string): void => {
    console.info(`${signal} received — shutting down...`);

    server.close(async () => {
      try {
        await closeDB();
        console.info('Server and DB connections have been gracefully closed');
        process.exit(0);
      } catch (err) {
        console.error('Error while closing database connections', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startapp().catch((err: unknown) => {
  console.error('Cannot start app');

  if (err instanceof Error) {
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
  } else {
    console.error('Thrown value:', err);
  }

  process.exit(1);
});
