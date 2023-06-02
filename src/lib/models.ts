import { index, prop } from '@typegoose/typegoose';

const SECONDS_IN_A_DAY = 86400;

@index({ subjectId: 1 })
export class CertificationPath {
  @prop({ required: true })
  public subjectId!: string;

  @prop({ required: true })
  public issuerId!: string;

  @prop({ required: true })
  public pathSerialized!: Buffer;

  @prop({ required: true, expires: 0 })
  public expiryDate!: Date;
}

export class PeerPublicKeyData {
  protected static TTL_DAYS = 30;

  @prop({ required: true, unique: true })
  public peerId!: string;

  @prop({ required: true })
  public keyId!: Buffer;

  @prop({ required: true })
  public keyDer!: Buffer;

  @prop({ required: true, expires: PeerPublicKeyData.TTL_DAYS * SECONDS_IN_A_DAY })
  public creationDate!: Date;
}
