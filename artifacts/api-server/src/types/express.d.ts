// Ambient module augmentation for Express request type. This file has no
// imports/exports so TypeScript treats it as an ambient script and merges the
// declarations globally regardless of import order.

import type { Client, Session } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      session?: Session;
      // NOTE: must NOT be named `client` — that would collide with Node's
      // built-in http.IncomingMessage `req.client` (the underlying socket)
      // and silently shadow it on Express requests.
      dbClient?: Client;
    }
  }
}

export {};
