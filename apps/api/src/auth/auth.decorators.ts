import { SetMetadata, createParamDecorator, type CustomDecorator } from '@nestjs/common';
import { UnauthenticatedError } from '../platform/api.errors';
import { currentRequestState, type Principal } from '../platform/request-context';

export const IS_PUBLIC_ROUTE = 'studio:public-route';

/**
 * Exempts a route from the global session guard. Criterion 27 allows the `health` controller and
 * `POST /auth/login`; ADR 0010 amends it for the desktop installer's `InstallController`, whose
 * public routes are `GET /install/presence` and `POST /install/pair` (one-time code), while
 * `GET /install/status` needs a portal token (`InstallTokenGuard`) instead of a session. Any other
 * use is a defect.
 */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_ROUTE, true);

/** The principal the session guard put in the request context; guarded routes only. */
export const CurrentPrincipal = createParamDecorator<unknown, Principal>((): Principal => {
  const principal = currentRequestState()?.principal ?? null;
  if (principal === null) throw new UnauthenticatedError();
  return principal;
});
