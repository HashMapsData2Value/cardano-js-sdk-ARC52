import { Cardano, ProviderError, ProviderFailure, SubmitTxArgs, TxBodyCBOR, TxSubmitProvider } from '@cardano-sdk/core';
import { Logger } from 'ts-log';
import { hexStringToBuffer } from '@cardano-sdk/util';
import axios, { AxiosInstance } from 'axios';

export class TxSubmitApiProvider implements TxSubmitProvider {
  #axios: AxiosInstance;
  #healthStatus = true;
  #logger: Logger;
  #path: string;

  constructor(submitApiBaseUrl: URL, logger: Logger, submitApiPath = '/api/submit/tx') {
    this.#axios = axios.create({ baseURL: submitApiBaseUrl.origin });
    this.#logger = logger;
    this.#path = submitApiPath;
  }

  async submitTx({ signedTransaction }: SubmitTxArgs) {
    let txId: Cardano.TransactionId | undefined;

    try {
      txId = Cardano.TransactionId.fromTxBodyCbor(TxBodyCBOR.fromTxCBOR(signedTransaction));

      this.#logger.debug(`Submitting tx ${txId} ...`);

      await this.#axios({
        data: hexStringToBuffer(signedTransaction),
        headers: { 'Content-Type': 'application/cbor' },
        method: 'post',
        url: this.#path
      });

      this.#healthStatus = true;
      this.#logger.debug(`Tx ${txId} submitted`);
    } catch (error) {
      this.#healthStatus = false;
      this.#logger.error(`Tx ${txId} submission error`);
      this.#logger.error(error);

      if (axios.isAxiosError(error) && error.response) {
        const { data, status } = error.response;

        if (typeof status === 'number' && status >= 400 && status < 500) this.#healthStatus = true;

        throw new ProviderError(ProviderFailure.BadRequest, null, data as string);
      }

      throw new ProviderError(ProviderFailure.Unknown, error, 'submitting tx');
    }
  }

  healthCheck() {
    return Promise.resolve({ ok: this.#healthStatus });
  }
}