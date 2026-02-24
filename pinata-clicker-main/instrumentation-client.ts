'use client';

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://b28c39e680f3844ea54cb3e11cb495cf@o844395.ingest.us.sentry.io/4510322975506432",
  tracesSampleRate: 1.0,
  _experiments: {
    enableLogs: true,
  },
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
});

const { logger } = Sentry;
logger.info("Sentry browser instrumentation loaded", {
  component: "instrumentation-client",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
