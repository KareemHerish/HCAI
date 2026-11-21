/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Shared Express app factory used by both local server.ts and Vercel serverless api/index.ts
 */

import express, { Express, NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chatRoutes.js';
import { vectorStore } from './pipeline/vectorStore.js';

dotenv.config();

export function createBackendApp(): Express {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Pre-load local persistent vector database & knowledge base once per server/cold-start
  vectorStore.load();

  // Mount backend RAG & Safety API routes
  app.use(chatRouter);

  // Ensure unexpected backend errors always return JSON instead of raw HTML
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled backend error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        reply: 'حدث خطأ غير متوقع في الخادم. يرجى المحاولة مرة أخرى.',
        error: err?.message || 'Internal Server Error',
      });
    }
  });

  return app;
}
