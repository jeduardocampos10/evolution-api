import { type LookupAddress, promises as dns } from 'node:dns';
import { Agent } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

import axios, { type AxiosInstance } from 'axios';

const blockedAddresses = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fec0::', 10],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6');
}

function assertSafeAddress(address: string, family: number): void {
  const normalizedFamily = family === 6 ? 'ipv6' : 'ipv4';
  if (!isIP(address) || blockedAddresses.check(address, normalizedFamily)) {
    throw new Error('Webhook destination resolved to a prohibited address');
  }
}

/**
 * Build a redirect-free HTTPS client whose connection is pinned to the exact
 * public DNS answers validated here. Pinning closes the validation/connection
 * DNS-rebinding gap; a new client is built for each delivery.
 */
export async function createSafeWebhookClient(
  rawUrl: string,
  timeout: number,
  headers?: Record<string, string>,
): Promise<AxiosInstance> {
  let destination: URL;
  try {
    destination = new URL(rawUrl);
  } catch {
    throw new Error('Invalid webhook destination');
  }

  if (destination.protocol !== 'https:' || destination.username || destination.password || destination.hash) {
    throw new Error('Webhook destination must be credential-free HTTPS');
  }

  // WHATWG URL keeps brackets around IPv6 literals; dns.lookup expects the
  // unbracketed address. The URL itself remains unchanged for TLS/SNI.
  const hostname = destination.hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[|\]$/g, '');
  const dnsTimeout = Math.max(1, Math.min(timeout, 10000));
  const answers = await new Promise<LookupAddress[]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Webhook DNS lookup timed out')), dnsTimeout);
    dns.lookup(hostname, { all: true, verbatim: true }).then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
  if (answers.length === 0) {
    throw new Error('Webhook destination has no DNS addresses');
  }
  for (const answer of answers) {
    assertSafeAddress(answer.address, answer.family);
  }

  const lookup: LookupFunction = (requestedHostname, options, callback) => {
    const requested = requestedHostname
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^\[|\]$/g, '');
    const requestedFamilyOption = typeof options === 'object' ? options.family : options;
    const requestedFamily =
      requestedFamilyOption === 4 || requestedFamilyOption === 'IPv4'
        ? 4
        : requestedFamilyOption === 6 || requestedFamilyOption === 'IPv6'
          ? 6
          : 0;
    const eligible = requestedFamily ? answers.filter((answer) => answer.family === requestedFamily) : answers;

    if (requested !== hostname || eligible.length === 0) {
      const error = Object.assign(new Error('Webhook hostname or address family changed after validation'), {
        code: 'ENOTFOUND',
      });
      callback(error, '', requestedFamily || 0);
      return;
    }

    if (typeof options === 'object' && options.all) {
      callback(null, eligible);
      return;
    }

    const selected = eligible[0];
    callback(null, selected.address, selected.family);
  };

  return axios.create({
    baseURL: destination.toString(),
    headers,
    timeout,
    maxRedirects: 0,
    maxContentLength: 1024 * 1024,
    proxy: false,
    httpsAgent: new Agent({ keepAlive: false, lookup }),
  });
}
