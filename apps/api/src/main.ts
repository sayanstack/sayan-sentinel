import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";

async function bootstrap() {
  // rawBody: true keeps req.body parsed as JSON for every route as usual,
  // while also populating req.rawBody with the exact bytes received — the
  // GitHub webhook controller needs those exact bytes for HMAC signature
  // verification, since JSON.stringify(JSON.parse(x)) is not guaranteed to
  // reproduce x byte-for-byte.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  // Real incident: the Vercel deployment's custom domain
  // (sentinel.sayanstack.com) was connected after APP_URL had already
  // been set to the auto-generated *.vercel.app URL, so every browser
  // request from the custom domain was silently CORS-blocked (a blocked
  // preflight throws in fetch, which apps/web's apiFetch reports as
  // "Could not reach the Sentinel API" — indistinguishable from the API
  // actually being down without checking response headers directly).
  // APP_URL can be a comma-separated list for exactly this reason; these
  // three are also always allowed regardless of what's configured, so a
  // future domain change here can't silently reintroduce the same bug —
  // update this list itself when a new one is added.
  const knownAppUrls = [
    "https://sentinel.sayanstack.com",
    "https://sayan-sentinel-web-sayanstack.vercel.app",
    "http://localhost:3000",
  ];
  const configuredUrls = (process.env.APP_URL ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const allowedOrigins = Array.from(new Set([...configuredUrls, ...knownAppUrls]));
  app.enableCors({ origin: allowedOrigins, credentials: true });
  // `class-validator`/`class-transformer` DTOs (e.g. CreateTargetDto) are inert without this —
  // whitelist strips unknown properties, forbidNonWhitelisted rejects a request that sent any.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
}

void bootstrap();
