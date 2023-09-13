import {
  Certificate,
  CertificationPath,
  generateRSAKeyPair,
  getIdFromIdentityKey,
  issueGatewayCertificate,
} from '@relaycorp/relaynet-core';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { addDays, addSeconds, subSeconds } from 'date-fns';

import { CertificationPath as CertificationPathModel } from './models';
import { setUpTestDBConnection } from '../testUtils/db';
import { MongoCertificateStore } from './MongoCertificateStore';

const getConnection = setUpTestDBConnection();
let certificateModel: ReturnModelType<typeof CertificationPathModel>;
let store: MongoCertificateStore;
beforeAll(async () => {
  const connection = getConnection();
  certificateModel = getModelForClass(CertificationPathModel, { existingConnection: connection });
  store = new MongoCertificateStore(connection);
});

let issuerPrivateKey: CryptoKey;
let issuerId: string;
let issuerCertificate: Certificate;
let subjectKeyPair: CryptoKeyPair;
let subjectId: string;
let validCertificate: Certificate;
let validCertificationPath: CertificationPath;
let expiredCertificate: Certificate;
let expiredCertificationPath: CertificationPath;
beforeAll(async () => {
  const issuerKeyPair = await generateRSAKeyPair();
  issuerPrivateKey = issuerKeyPair.privateKey;
  issuerCertificate = await issueGatewayCertificate({
    issuerPrivateKey: issuerKeyPair.privateKey,
    subjectPublicKey: issuerKeyPair.publicKey,
    validityEndDate: addDays(new Date(), 1),
  });
  issuerId = await issuerCertificate.calculateSubjectId();

  subjectKeyPair = await generateRSAKeyPair();
  subjectId = await getIdFromIdentityKey(subjectKeyPair.publicKey);

  validCertificate = await issueGatewayCertificate({
    subjectPublicKey: subjectKeyPair.publicKey,
    issuerPrivateKey: subjectKeyPair.privateKey,
    issuerCertificate,
    validityEndDate: issuerCertificate.expiryDate,
  });
  validCertificationPath = new CertificationPath(validCertificate, []);

  expiredCertificate = await issueGatewayCertificate({
    subjectPublicKey: subjectKeyPair.publicKey,
    issuerCertificate,
    issuerPrivateKey,
    validityEndDate: subSeconds(new Date(), 1),
    validityStartDate: subSeconds(new Date(), 2),
  });
  expiredCertificationPath = new CertificationPath(expiredCertificate, []);
});

describe('saveData', () => {
  test('All attributes should be saved', async () => {
    await store.save(validCertificationPath, issuerId);

    const certificateRecords = await certificateModel.find({ subjectId }).exec();
    expect(certificateRecords).toHaveLength(1);
    expect(certificateRecords).toContainEqual(await makeCertPathMatch(validCertificationPath));
  });

  test('The same subject should be allowed to have multiple paths from different issuers', async () => {
    const issuer2KeyPair = await generateRSAKeyPair();
    const issuer2Certificate = await issueGatewayCertificate({
      issuerPrivateKey: issuer2KeyPair.privateKey,
      subjectPublicKey: issuer2KeyPair.publicKey,
      validityEndDate: addDays(validCertificate.expiryDate, 1),
    });
    const certificate2 = await issueGatewayCertificate({
      subjectPublicKey: subjectKeyPair.publicKey,
      issuerPrivateKey: issuer2KeyPair.privateKey,
      issuerCertificate: issuer2Certificate,
      validityEndDate: addDays(validCertificate.expiryDate, 1),
    });
    const certificationPath2 = new CertificationPath(certificate2, []);

    await store.save(validCertificationPath, issuerId);
    await store.save(certificationPath2, issuer2Certificate.getIssuerId()!);

    const certificateRecords = await certificateModel.find({ subjectId }).exec();
    expect(certificateRecords).toHaveLength(2);
    expect(certificateRecords).toContainEqual(await makeCertPathMatch(validCertificationPath));
    expect(certificateRecords).toContainEqual(await makeCertPathMatch(certificationPath2));
  });

  test('The same issuer should be allowed to have multiple certificates for different subjects', async () => {
    const subject2KeyPair = await generateRSAKeyPair();
    const subject2Certificate = await issueGatewayCertificate({
      subjectPublicKey: subject2KeyPair.publicKey,
      issuerPrivateKey,
      issuerCertificate,
      validityEndDate: validCertificate.expiryDate,
    });
    const certificationPath2 = new CertificationPath(subject2Certificate, []);

    await store.save(validCertificationPath, issuerId);
    await store.save(certificationPath2, issuerId);

    const certificateRecords = await certificateModel.find({ issuerId }).exec();
    expect(certificateRecords).toHaveLength(2);
    expect(certificateRecords).toContainEqual(await makeCertPathMatch(validCertificationPath));
    expect(certificateRecords).toContainEqual(await makeCertPathMatch(certificationPath2));
  });

  test('Multiple paths with the same subject and issuer should be allowed if expiry dates differ', async () => {
    const certificate2 = await issueGatewayCertificate({
      subjectPublicKey: subjectKeyPair.publicKey,
      issuerPrivateKey,
      issuerCertificate,
      validityEndDate: subSeconds(validCertificate.expiryDate, 1),
    });
    const certificationPath2 = new CertificationPath(certificate2, []);

    await store.save(validCertificationPath, issuerId);
    await store.save(certificationPath2, issuerId);

    const certificateRecords = await certificateModel.find({ subjectId }).exec();
    expect(certificateRecords).toHaveLength(2);
    expect(certificateRecords).toContainEqual(await makeCertPathMatch(validCertificationPath));
    expect(certificateRecords).toContainEqual(await makeCertPathMatch(certificationPath2));
  });

  test('Multiple paths with the same subject and issuer should be deduped if expiry dates match', async () => {
    const certificate2 = await issueGatewayCertificate({
      subjectPublicKey: subjectKeyPair.publicKey,
      issuerPrivateKey,
      issuerCertificate,
      validityEndDate: validCertificate.expiryDate,
    });
    const certificationPath2 = new CertificationPath(certificate2, []);

    await store.save(validCertificationPath, issuerId);
    await store.save(certificationPath2, issuerId);

    const certificateRecords = await certificateModel.find({ subjectId }).exec();
    expect(certificateRecords).toHaveLength(1);
    expect(certificateRecords).toContainEqual(await makeCertPathMatch(certificationPath2));
  });

  async function makeCertPathMatch(certificationPath: CertificationPath): Promise<jest.Expect> {
    const leafCertificate = certificationPath.leafCertificate;
    return expect.objectContaining({
      expiryDate: leafCertificate.expiryDate,
      issuerId: leafCertificate.getIssuerId()!,
      subjectId: await leafCertificate.calculateSubjectId(),
      pathSerialized: expect.toSatisfy((serialisation) =>
        Buffer.from(certificationPath.serialize()).equals(Buffer.from(serialisation)),
      ),
    });
  }
});

describe('retrieveLatestSerialization', () => {
  test('Nothing should be returned if subject has no certificates', async () => {
    await expect(store.retrieveLatest(subjectId, subjectId)).resolves.toBeNull();
  });

  test('Expired certificates should not be returned', async () => {
    await store.save(expiredCertificationPath, subjectId);

    await expect(store.retrieveLatest(subjectId, subjectId)).resolves.toBeNull();
  });

  test('The latest valid certificate should be returned', async () => {
    await store.save(validCertificationPath, subjectId);
    const newestCertificate = await issueGatewayCertificate({
      issuerPrivateKey: subjectKeyPair.privateKey,
      subjectPublicKey: subjectKeyPair.publicKey,
      validityEndDate: addSeconds(validCertificate.expiryDate, 1),
    });
    await store.save(new CertificationPath(newestCertificate, []), subjectId);

    await expect(store.retrieveLatest(subjectId, subjectId)).resolves.toSatisfy((p) =>
      newestCertificate.isEqual(p.leafCertificate),
    );
  });

  test('Certificate from different issuer should be ignored', async () => {
    await store.save(validCertificationPath, issuerId);
    await expect(store.retrieveLatest(subjectId, `not-${issuerId}`)).resolves.toBeNull();
  });
});

describe('retrieveAllSerializations', () => {
  test('Nothing should be returned if there are no certificates', async () => {
    await expect(store.retrieveAll(subjectId, subjectId)).resolves.toBeEmpty();
  });

  test('Expired certificates should not be returned', async () => {
    await store.save(expiredCertificationPath, subjectId);

    await expect(store.retrieveAll(subjectId, subjectId)).resolves.toBeEmpty();
  });

  test('All valid certificates should be returned', async () => {
    await store.save(validCertificationPath, issuerId);
    const certificate2 = await issueGatewayCertificate({
      subjectPublicKey: subjectKeyPair.publicKey,
      issuerPrivateKey,
      issuerCertificate,
      validityEndDate: subSeconds(validCertificate.expiryDate, 1),
    });
    await store.save(new CertificationPath(certificate2, []), issuerId);

    const allPaths = await store.retrieveAll(subjectId, issuerId);

    expect(allPaths).toHaveLength(2);
    expect(allPaths).toContainEqual(
      expect.objectContaining({
        leafCertificate: expect.toSatisfy((c) => c.isEqual(validCertificate)),
      }),
    );
    expect(allPaths).toContainEqual(
      expect.objectContaining({
        leafCertificate: expect.toSatisfy((c) => c.isEqual(certificate2)),
      }),
    );
  });

  test('Certificate from different issuer should be ignored', async () => {
    await store.save(validCertificationPath, `not-${issuerId}`);
    await expect(store.retrieveAll(subjectId, issuerId)).resolves.toBeEmpty();
  });
});

describe('deleteExpired', () => {
  test('Valid certificates should not be deleted', async () => {
    await store.save(validCertificationPath, subjectId);

    await store.deleteExpired();

    await expect(store.retrieveAll(subjectId, subjectId)).resolves.toHaveLength(1);
  });
});
