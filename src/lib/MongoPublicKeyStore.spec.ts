// tslint:disable:no-object-mutation

import {
  derSerializePublicKey,
  generateECDHKeyPair,
  generateRSAKeyPair,
  getIdFromIdentityKey,
  SessionKey,
} from '@relaycorp/relaynet-core';
import { getModelForClass } from '@typegoose/typegoose';
import { addSeconds } from 'date-fns';

import { PeerPublicKeyData } from './models';
import { MongoPublicKeyStore } from './MongoPublicKeyStore';
import { setUpTestDBConnection } from '../testUtils/db';

const getConnection = setUpTestDBConnection();

let peerPublicKeyData: PeerPublicKeyData;
let peerPublicKey: CryptoKey;
let peerId: string;
beforeAll(async () => {
  const keyPair = await generateRSAKeyPair();
  peerId = await getIdFromIdentityKey(keyPair.publicKey);

  const sessionKeyPair = await generateECDHKeyPair();
  peerPublicKey = sessionKeyPair.publicKey;

  peerPublicKeyData = new PeerPublicKeyData();
  peerPublicKeyData.peerId = peerId;
  peerPublicKeyData.keyId = Buffer.from([1, 3, 5, 7]);
  peerPublicKeyData.keyDer = await derSerializePublicKey(sessionKeyPair.publicKey);
  peerPublicKeyData.creationDate = new Date();
});

let PEER_SESSION_KEY: SessionKey;
beforeAll(() => {
  PEER_SESSION_KEY = { keyId: peerPublicKeyData.keyId, publicKey: peerPublicKey };
});

test('Identity keys should not yet be supported', async () => {
  const store = new MongoPublicKeyStore(getConnection());

  const identityKeyPair = await generateRSAKeyPair();
  await expect(store.saveIdentityKey(identityKeyPair.privateKey)).rejects.toThrowWithMessage(
    Error,
    'Method not yet implemented',
  );
  await expect(store.retrieveIdentityKey('0deadbeef')).rejects.toThrowWithMessage(
    Error,
    'Method not yet implemented',
  );
});

describe('saveSessionKeyData', () => {
  test('Key should be created if it does not exist', async () => {
    const connection = getConnection();
    const store = new MongoPublicKeyStore(connection);

    await store.saveSessionKey(PEER_SESSION_KEY, peerId, peerPublicKeyData.creationDate);

    const keyDataModel = getModelForClass(PeerPublicKeyData, { existingConnection: connection });
    await expect(keyDataModel.exists(peerPublicKeyData)).resolves.toBeTruthy();
  });

  test('Key should be updated if it exists', async () => {
    const connection = getConnection();
    const store = new MongoPublicKeyStore(connection);
    await store.saveSessionKey(PEER_SESSION_KEY, peerId, peerPublicKeyData.creationDate);
    const creationDate = addSeconds(peerPublicKeyData.creationDate, 1);

    await store.saveSessionKey(PEER_SESSION_KEY, peerId, creationDate);

    const keyDataModel = getModelForClass(PeerPublicKeyData, { existingConnection: connection });
    await expect(keyDataModel.exists({ ...peerPublicKeyData, creationDate })).resolves.toBeTruthy();
  });
});

describe('retrieveSessionKeyData', () => {
  test('Existing key should be returned', async () => {
    const store = new MongoPublicKeyStore(getConnection());
    await store.saveSessionKey(PEER_SESSION_KEY, peerId, peerPublicKeyData.creationDate);

    const key = await store.retrieveLastSessionKey(peerId);

    expect(key!.keyId.equals(peerPublicKeyData.keyId)).toBeTrue();
    expect(await derSerializePublicKey(key!.publicKey)).toEqual(peerPublicKeyData.keyDer);
  });

  test('Non-existing key should result in null', async () => {
    const store = new MongoPublicKeyStore(getConnection());

    await expect(store.retrieveLastSessionKey(peerId)).resolves.toBeNull();
  });
});
