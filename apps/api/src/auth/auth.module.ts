import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionAuthGuard } from "./session-auth.guard";

/**
 * `@Global()` so every other module's controllers can
 * `@UseGuards(SessionAuthGuard)` by class reference alone — matching
 * `SentinelConfigModule`'s own pattern — without each of them needing to
 * import `AuthModule` just to make the guard resolvable in their DI scope.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionAuthGuard],
  exports: [SessionAuthGuard],
})
export class AuthModule {}
