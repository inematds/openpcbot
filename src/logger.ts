import pino from 'pino';

const isTTY = process.stdout.isTTY;

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: () => `,"time":"${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}"`,
  // pino-pretty only in interactive terminal; raw JSON in background (sync, no buffer)
  ...(isTTY
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});
