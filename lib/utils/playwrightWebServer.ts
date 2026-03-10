interface ResolvePlaywrightWebServerOptions {
  port: number;
  externalBaseUrl?: string;
  mode?: string;
  env: NodeJS.ProcessEnv;
}

interface PlaywrightWebServerConfig {
  command: string;
  env: Record<string, string>;
  reuseExistingServer: boolean;
  timeout: number;
  url: string;
}

export const DEFAULT_PLAYWRIGHT_PORT = 3000;

export function resolvePlaywrightPort(env: NodeJS.ProcessEnv): number {
  for (const candidate of [env.PLAYWRIGHT_PORT, env.PORT]) {
    if (!candidate) {
      continue;
    }

    const parsed = Number.parseInt(candidate, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return DEFAULT_PLAYWRIGHT_PORT;
}

export function resolvePlaywrightWebServer({
  port,
  externalBaseUrl,
  mode,
  env,
}: ResolvePlaywrightWebServerOptions): PlaywrightWebServerConfig | null {
  if (externalBaseUrl) {
    return null;
  }

  const normalizedMode = mode === 'dev' ? 'dev' : 'prod';
  const command =
    normalizedMode === 'dev'
      ? `bun run dev -- --port ${port}`
      : `npm run build && npm run start -- --port ${port}`;
  const resolvedEnv = Object.fromEntries(
    Object.entries({
      ...env,
      NEXT_TELEMETRY_DISABLED: '1',
    }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );

  return {
    command,
    env: resolvedEnv,
    reuseExistingServer: !env.CI,
    timeout: 120_000,
    url: `http://localhost:${port}`,
  };
}
