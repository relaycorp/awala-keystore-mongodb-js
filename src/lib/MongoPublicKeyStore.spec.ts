// tslint:disable:no-object-mutation

import {
  derSerializePublicKey,
  generateECDHKeyPair,
  generateRSAKeyPair,
  getIdFromIdentityKey,
  SessionKey,
} from '@relaycorp/relaynet-core';

import { PeerPublicKeyData } from './models';
import { MongoPublicKeyStore } from './MongoPublicKeyStore';
import {setUpTestDBConnection} from "../testUtils/db.js";

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

describe('retrieveSessionKeyData', () => {
  test('Key should be looked up by the private node address of the peer', async () => {
    const store = new MongoPublicKeyStore(getConnection());

    await store.retrieveLastSessionKey(peerId);

    expect(mockFindOne).toBeCalledTimes(1);
    expect(mockFindOne).toBeCalledWith({ peerId });
  });

  test('Existing key should be returned', async () => {
    const store = new MongoPublicKeyStore(getConnection());

    const key = await store.retrieveLastSessionKey(peerId);

    expect(key?.keyId).toEqual(peerPublicKeyData.keyId);
    expect(await derSerializePublicKey(key!.publicKey)).toEqual(peerPublicKeyData.keyDer);
  });

  test('Non-existing key should result in null', async () => {
    const store = new MongoPublicKeyStore(getConnection());
    mockFindOneExec.mockResolvedValue(null);

    await expect(store.retrieveLastSessionKey(peerId)).resolves.toBeNull();
  });
});

describe('saveSessionKeyData', () => {
  let PEER_SESSION_KEY: SessionKey;
  beforeAll(() => {
    PEER_SESSION_KEY = { keyId: peerPublicKeyData.keyId, publicKey: peerPublicKey };
  });

  test('Existing connection should be used', async () => {
    const store = new MongoPublicKeyStore(getConnection());

    await store.saveSessionKey(PEER_SESSION_KEY, peerId, new Date());

    expect(stubGetModelForClass).toBeCalledTimes(1);
    expect(stubGetModelForClass).toBeCalledWith(PeerPublicKeyData, {
      existingConnection: connection,
    });
  });

  test('Key should be upserted', async () => {
    const store = new MongoPublicKeyStore(getConnection());
    const creationDate = new Date();

    await store.saveSessionKey(PEER_SESSION_KEY, peerId, creationDate);

    expect(mockUpdateOne).toBeCalledTimes(1);
    expect(mockUpdateOne).toBeCalledWith(
      { peerId },
      { ...peerPublicKeyData, creationDate },
      { upsert: true },
    );
  });
});
