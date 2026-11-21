/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Vercel Serverless Function Entry Point (handles /chat and /api/*)
 */

import { createBackendApp } from '../backend/app.js';

const app = createBackendApp();

export default app;
