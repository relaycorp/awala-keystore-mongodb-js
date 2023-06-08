import { PublicKeyStore, SessionPublicKeyData } from '@relaycorp/relaynet-core';
import { getModelForClass } from '@typegoose/typegoose';
import { Connection, Model } from 'mongoose';

import { IdentityPublicKeyData, PeerPublicKeyData } from './models';

export class MongoPublicKeyStore extends PublicKeyStore {
  protected readonly identityKeyDataModel: Model<any>;
  protected readonly sessionKeyDataModel: Model<any>;

  constructor(connection: Connection) {
    super();

    this.identityKeyDataModel = getModelForClass(IdentityPublicKeyData, {
      existingConnection: connection,
    });
    this.sessionKeyDataModel = getModelForClass(PeerPublicKeyData, {
      existingConnection: connection,
    });
  }

  protected async retrieveIdentityKeySerialized(peerId: string): Promise<Buffer | null> {
    const query = this.identityKeyDataModel.findOne({ peerId });
    const keyData: null | IdentityPublicKeyData = await query.exec();
    return keyData?.keyDer ?? null;
  }

  protected async saveIdentityKeySerialized(keySerialized: Buffer, peerId: string): Promise<void> {
    const dbData: IdentityPublicKeyData = {
      keyDer: keySerialized,
      peerId,
    };
    await this.identityKeyDataModel.updateOne({ peerId }, dbData, { upsert: true }).exec();
  }

  protected async retrieveSessionKeyData(peerId: string): Promise<SessionPublicKeyData | null> {
    const query = this.sessionKeyDataModel.findOne({ peerId });
    const keyData: null | PeerPublicKeyData = await query.exec();
    if (keyData === null) {
      return null;
    }
    return {
      publicKeyCreationTime: keyData.creationDate,
      publicKeyDer: keyData.keyDer,
      publicKeyId: keyData.keyId,
    };
  }

  protected async saveSessionKeyData(keyData: SessionPublicKeyData, peerId: string): Promise<void> {
    const dbData: PeerPublicKeyData = {
      creationDate: keyData.publicKeyCreationTime,
      keyDer: keyData.publicKeyDer,
      keyId: keyData.publicKeyId,
      peerId,
    };
    await this.sessionKeyDataModel.updateOne({ peerId }, dbData, { upsert: true }).exec();
  }
}
