import {readFileSync} from 'node:fs';

// Prisma calls its root CA option sslcert; node-postgres calls it sslrootcert.
// Do not accidentally send the CA as a client identity certificate.
export function postgresConnection(url) {
  const parsed = new URL(url);
  const rootCertificate = parsed.searchParams.get('sslrootcert');
  const options = {connectionString: url};
  if (rootCertificate) {
    for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslaccept']) {
      parsed.searchParams.delete(key);
    }
    options.connectionString = parsed.toString();
    options.ssl = {ca: readFileSync(rootCertificate, 'utf8'), rejectUnauthorized: true};
  }
  return options;
}
