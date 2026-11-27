const env = require('./config/env');
const prisma = require('./config/prisma');
const app = require('./app');

const server = app.listen(env.PORT, () => {
  console.log(`Virar Organics API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
