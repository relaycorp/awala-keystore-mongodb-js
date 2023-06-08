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

import { IdentityPublicKeyData, PeerPublicKeyData } from './models';
import { MongoPublicKeyStore } from './MongoPublicKeyStore';
import { setUpTestDBConnection } from '../testUtils/db';

const getConnection = setUpTestDBConnection();

let peerId: string;
let peerIdKeyPair: CryptoKeyPair;
beforeAll(async () => {
  peerIdKeyPair = await generateRSAKeyPair();
  peerId = await getIdFromIdentityKey(peerIdKeyPair.publicKey);
});

describe('Identity keys', () => {
  describe('saveIdentityKeySerialized', () => {
    test('Key should be created if it does not exist', async () => {
      const connection = getConnection();
      const store = new MongoPublicKeyStore(connection);

      await store.saveIdentityKey(peerIdKeyPair.publicKey);

      const model = getModelForClass(IdentityPublicKeyData, { existingConnection: connection });
      await expect(
        model.exists({ peerId, keyDer: await derSerializePublicKey(peerIdKeyPair.publicKey) }),
      ).resolves.toBeTruthy();
    });

    test('Nothing should change if key already exists', async () => {
      const connection = getConnection();
      const store = new MongoPublicKeyStore(connection);
      await store.saveIdentityKey(peerIdKeyPair.publicKey);

      await store.saveIdentityKey(peerIdKeyPair.publicKey);

      const model = getModelForClass(IdentityPublicKeyData, { existingConnection: connection });
      await expect(
        model.exists({ peerId, keyDer: await derSerializePublicKey(peerIdKeyPair.publicKey) }),
      ).resolves.toBeTruthy();
    });
  });

  describe('retrieveIdentityKeySerialized', () => {
    test('Existing key should be returned', async () => {
      const connection = getConnection();
      const store = new MongoPublicKeyStore(connection);
      await store.saveIdentityKey(peerIdKeyPair.publicKey);

      const key = await store.retrieveIdentityKey(peerId);

      await expect(derSerializePublicKey(key!)).resolves.toMatchObject(
        await derSerializePublicKey(peerIdKeyPair.publicKey),
      );
    });

    test('Non-existing key should result in null', async () => {
      const connection = getConnection();
      const store = new MongoPublicKeyStore(connection);

      const key = await store.retrieveIdentityKey(peerId);

      expect(key).toBeNull();
    });
  });
});

describe('Session keys', () => {
  let peerPublicKeyData: PeerPublicKeyData;
  let peerPublicKey: CryptoKey;
  beforeAll(async () => {
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
      await expect(
        keyDataModel.exists({ ...peerPublicKeyData, creationDate }),
      ).resolves.toBeTruthy();
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
});
