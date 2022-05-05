// tested in web-extension/e2e tests
import { APIErrorCode, ApiError } from '../errors';
import { AuthenticatorApi } from '../AuthenticatorApi';
import { MessengerDependencies, exposeApi, senderOrigin } from '@cardano-sdk/web-extension';
import { WalletApi } from '.';
import { walletApiChannel } from './util';

export interface BackgroundWalletApiOptions {
  walletName: string;
}

export interface BackgroundWalletDependencies extends MessengerDependencies {
  authenticator: AuthenticatorApi;
  walletApi: WalletApi;
}

export const exposeWalletApi = (
  { walletName }: BackgroundWalletApiOptions,
  dependencies: BackgroundWalletDependencies
) =>
  exposeApi(
    {
      api: dependencies.walletApi,
      baseChannel: walletApiChannel(walletName),
      methodRequestOptions: {
        validate: async (_, sender) => {
          const origin = sender && senderOrigin(sender);
          const haveAccess = origin && (await dependencies.authenticator.haveAccess(origin));
          if (!haveAccess) {
            throw new ApiError(APIErrorCode.Refused, 'Call cardano.{walletName}.enable() first');
          }
        }
      }
    },
    dependencies
  );