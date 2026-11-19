import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '@studio/core/prisma';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginThrottle } from './login-throttle';
import { PassphraseHashRepository, PassphraseVerifier } from './passphrase.verifier';
import { SessionGuard } from './session.guard';
import { SessionStore } from './session-store';

/** Passphrase login (D8, A13) and the global session guard every other route sits behind. */
@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    SessionStore,
    LoginThrottle,
    PassphraseHashRepository,
    PassphraseVerifier,
    AuthService,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AuthModule {}
