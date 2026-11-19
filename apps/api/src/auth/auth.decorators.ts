import { SetMetadata, createParamDecorator, type CustomDecorator } from '@nestjs/common';
import { UnauthenticatedError } from '../platform/api.errors';
import { currentRequestState, type Principal } from '../platform/request-context';

export const IS_PUBLIC_ROUTE = 'studio:public-route';

/**
 * Exempts a route from the global session guard. Criterion 27 allows exactly two uses: the
 * `health` controller and `POST /auth/login`. Any other use is a defect.
 */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_ROUTE, true);

/** The principal the session guard put in the request context; guarded routes only. */
export const CurrentPrincipal = createParamDecorator((_data: unknown): Principal => {
  const principal = currentRequestState()?.principal ?? null;
  if (principal === null) throw new UnauthenticatedError();
  return principal;
});
