const DEFAULT_DEVELOPMENT_CORS_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:3001",
  "http://localhost:3001"
];

export function resolveRoomStoreDriver(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.ROOM_STORE_DRIVER?.trim().toLowerCase();
  if (configured) return configured;

  return env.NODE_ENV === "development" || env.NODE_ENV === "test" ? "file" : "cloudbase";
}

export function resolveAllowedCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = env.CORS_ORIGINS ?? env.ALLOWED_ORIGINS;
  if (configured) {
    return configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return env.NODE_ENV === "production" ? [] : DEFAULT_DEVELOPMENT_CORS_ORIGINS;
}

export function createCorsOriginMatcher(env: NodeJS.ProcessEnv = process.env) {
  const allowedOrigins = new Set(resolveAllowedCorsOrigins(env));

  return (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS.`), false);
  };
}
