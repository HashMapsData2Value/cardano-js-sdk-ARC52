import {
  AssetEntity,
  BlockDataEntity,
  BlockEntity,
  NftMetadataEntity,
  OutputEntity,
  TokensEntity,
  TypeormStabilityWindowBuffer,
  TypeormTipTracker,
  createObservableConnection,
  storeAssets,
  storeBlock,
  storeUtxo,
  typeormTransactionCommit,
  withTypeormTransaction
} from '../../src';
import { Bootstrap, Mappers, ProjectionEvent, requestNext } from '@cardano-sdk/projection';
import { Cardano, ChainSyncEventType } from '@cardano-sdk/core';
import { ChainSyncDataSet, chainSyncData, logger } from '@cardano-sdk/util-dev';
import { IsNull, Not, QueryRunner } from 'typeorm';
import { Observable } from 'rxjs';
import { connectionConfig$, initializeDataSource } from '../util';
import { createProjectorContext, createProjectorTilFirst } from './util';

describe('storeUtxo', () => {
  const stubEvents = chainSyncData(ChainSyncDataSet.WithMint);
  let queryRunner: QueryRunner;
  let buffer: TypeormStabilityWindowBuffer;
  let tipTracker: TypeormTipTracker;
  const entities = [BlockEntity, BlockDataEntity, AssetEntity, NftMetadataEntity, TokensEntity, OutputEntity];

  const storeData = <T extends Mappers.WithUtxo & Mappers.WithMint>(evt$: Observable<ProjectionEvent<T>>) =>
    evt$.pipe(
      withTypeormTransaction({
        connection$: createObservableConnection({ connectionConfig$, entities, logger })
      }),
      storeBlock(),
      storeAssets(),
      storeUtxo(),
      buffer.storeBlockData(),
      typeormTransactionCommit()
    );

  const project$ = () =>
    Bootstrap.fromCardanoNode({
      blocksBufferLength: 10,
      buffer,
      cardanoNode: stubEvents.cardanoNode,
      logger,
      projectedTip$: tipTracker.tip$
    }).pipe(Mappers.withMint(), Mappers.withUtxo(), storeData, tipTracker.trackProjectedTip(), requestNext());

  const projectTilFirst = createProjectorTilFirst(project$);

  beforeEach(async () => {
    const dataSource = await initializeDataSource({ entities });
    queryRunner = dataSource.createQueryRunner();
    ({ buffer, tipTracker } = createProjectorContext(entities));
  });

  afterEach(async () => {
    await queryRunner.release();
  });

  it('hydrates event object with storedProducedUtxo map', async () => {
    const evt = await projectTilFirst(({ utxo }) => utxo.produced.length > 0);
    expect(evt.storedProducedUtxo.size).toEqual(evt.utxo.produced.length);
    expect(evt.storedProducedUtxo.get(evt.utxo.produced[0])).toBeTruthy();
  });

  it('inserts outputs, deletes when block is rolled back, updates output "consumed" column when spent', async () => {
    const outputRepository = queryRunner.manager.getRepository(OutputEntity);
    const producedUtxo: Cardano.TxIn[] = [];
    const spentEvent = await projectTilFirst(({ utxo }) => {
      producedUtxo.push(...utxo.produced.map(([txIn]) => txIn));
      // Spend utxo that was previously produced in this projection
      return utxo.consumed.some((txIn) =>
        producedUtxo.find((producedTxIn) => producedTxIn.txId === txIn.txId && producedTxIn.index === txIn.index)
      );
    });
    expect(await outputRepository.count({ where: { consumedAtSlot: IsNull() } })).toBeGreaterThan(0);
    expect(await outputRepository.count({ where: { consumedAtSlot: Not(IsNull()) } })).toBeGreaterThan(0);
    expect(
      await outputRepository.findOne({
        where: { outputIndex: spentEvent.utxo.produced[0][0].index, txId: spentEvent.utxo.produced[0][0].txId }
      })
    ).not.toBeNull();
    await projectTilFirst(
      ({ eventType, block }) =>
        eventType === ChainSyncEventType.RollBackward && block.header.hash === spentEvent.block.header.hash
    );
    expect(await outputRepository.count({ where: { consumedAtSlot: Not(IsNull()) } })).toBe(0);
    expect(
      await outputRepository.findOne({
        where: { outputIndex: spentEvent.utxo.produced[0][0].index, txId: spentEvent.utxo.produced[0][0].txId }
      })
    ).toBeNull();
  });

  it('inserts tokens, deletes when block is rolled back', async () => {
    const tokensRepository = queryRunner.manager.getRepository(TokensEntity);
    const produceTokensEvent = await projectTilFirst(({ utxo }) =>
      utxo.produced.some(([_, txOut]) => (txOut.value.assets?.size || 0) > 0)
    );
    expect(await tokensRepository.count()).toBeGreaterThan(0);
    await projectTilFirst(
      ({ eventType, block }) =>
        eventType === ChainSyncEventType.RollBackward && block.header.hash === produceTokensEvent.block.header.hash
    );
    expect(await tokensRepository.count()).toBe(0);
  });
});
