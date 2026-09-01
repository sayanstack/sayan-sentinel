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
  // Always includes localhost:3000 (the web app's own default dev port)
  // alongside the deployed frontend's origin, so `next dev` against a
  // shared/hosted API — the setup this whole `x-demo-*` header scheme is
  // built for — isn't blocked by CORS during local development.
  const allowedOrigins = Array.from(
    new Set([process.env.APP_URL, "http://localhost:3000"].filter((v): v is string => !!v)),
  );
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
