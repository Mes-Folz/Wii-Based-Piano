import os from 'node:os';

export interface NetworkAddress {
  name: string;
  address: string;
}

function priority(name: string, address: string): number {
  if (/virtual|vmware|virtualbox|docker|wsl|hyper-v/i.test(name)) return 4;
  if (/wi-?fi|wireless|ethernet/i.test(name)) return -1;
  if (/^192\.168\.(56|99|137)\./.test(address) || /^172\.(17|18|19)\./.test(address)) return 3;
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return 3;
}

export function getNetworkInfo(): { addresses: NetworkAddress[] } {
  const addresses = Object.entries(os.networkInterfaces()).flatMap(([name, list]) => (list ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => ({ name, address: entry.address })));
  addresses.sort((a, b) => priority(a.name, a.address) - priority(b.name, b.address));
  return { addresses };
}
