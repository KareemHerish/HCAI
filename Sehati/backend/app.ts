/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Shared Express app factory used by both local server.ts and Vercel serverless api/index.ts
 */

import express, { Express } from 'express';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chatRoutes';
import { vectorStore } from './pipeline/vectorStore';

dotenv.config();

export function createBackendApp(): Express {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Pre-load local persistent vector database & knowledge base once per server/cold-start
  vectorStore.load();

  // Mount backend RAG & Safety API routes
  app.use(chatRouter);

  return app;
}
