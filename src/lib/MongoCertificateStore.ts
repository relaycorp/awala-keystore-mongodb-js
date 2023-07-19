import { CertificateStore } from '@relaycorp/relaynet-core';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection } from 'mongoose';

import { CertificationPath } from './models';
import { bufferToArrayBuffer } from '../utils/buffer';

export class MongoCertificateStore extends CertificateStore {
  private readonly certificateModel: ReturnModelType<typeof CertificationPath>;

  constructor(connection: Connection) {
    super();

    this.certificateModel = getModelForClass(CertificationPath, { existingConnection: connection });
  }

  public async deleteExpired(): Promise<void> {
    // Do nothing. Trust that the model will delete expired records.
  }

  protected async saveData(
    subjectCertificateSerialized: ArrayBuffer,
    subjectId: string,
    subjectCertificateExpiryDate: Date,
    issuerId: string,
  ): Promise<void> {
    const record: CertificationPath = {
      expiryDate: subjectCertificateExpiryDate,
      issuerId,
      pathSerialized: Buffer.from(subjectCertificateSerialized),
      subjectId,
    };
    await this.certificateModel
      .updateOne(
        {
          expiryDate: subjectCertificateExpiryDate,
          subjectId,
        },
        record,
        { upsert: true },
      )
      .exec();
  }

  protected async retrieveLatestSerialization(
    subjectId: string,
    issuerId: string,
  ): Promise<ArrayBuffer | null> {
    const record = await this.certificateModel
      .findOne({ subjectId, issuerId })
      .sort({ expiryDate: -1 })
      .exec();
    return record ? bufferToArrayBuffer(record.pathSerialized) : null;
  }

  protected async retrieveAllSerializations(
    subjectId: string,
    issuerId: string,
  ): Promise<readonly ArrayBuffer[]> {
    const records = await this.certificateModel.find({ subjectId, issuerId }).exec();
    return records.map((r) => bufferToArrayBuffer(r.pathSerialized));
  }
}
