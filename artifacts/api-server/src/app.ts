import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import stripeWebhookRouter from "./routes/stripe-webhook";
import clerkWebhookRouter from "./routes/clerk-webhook";
import hostsWebhookRouter from "./routes/hosts-webhook";
import { logger } from "./lib/logger";
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
// Clerk webhook also needs the raw body for svix signature verification
app.use("/api", clerkWebhookRouter);
// Host (Vercel/Render) webhooks need the raw body for HMAC verification.
app.use("/api", hostsWebhookRouter);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Single auth path: validate Clerk session, resolve organization +
// organization_member. Routes opt-in via requireAuth /
// requireActiveClient / requireAdmin / requireOrganization.
app.use(loadClerkAndOrganization);

app.use("/api", router);

export default app;
