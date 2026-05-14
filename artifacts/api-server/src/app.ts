import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import stripeWebhookRouter from "./routes/stripe-webhook";
import { logger } from "./lib/logger";
import { loadSessionAndClient } from "./lib/auth";
import { loadClerkAndOrganization } from "./lib/clerk";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Stripe webhook needs the raw body — must mount before json parsers
app.use("/api/stripe/webhook", stripeWebhookRouter);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Populate req.session and req.dbClient on every request when a valid
// session cookie or bearer token is present. Routes opt-in to authentication
// via the requireAuth / requireActiveClient / requireAdmin guards.
app.use(loadSessionAndClient);
// Phase 0 parallel auth: resolve Clerk session (if configured) and attach
// the active organization to every request. Runs AFTER the legacy session
// middleware so it can use `req.dbClient` as a fallback bridge.
app.use(loadClerkAndOrganization);

app.use("/api", router);

export default app;
