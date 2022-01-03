import axios from 'axios';

export interface Result {
  status: string;
  message: string;
  result: string;
}

export function getEtherscanApiUrl(network: string): string {
  let host = {
    kovan: 'api-kovan.etherscan.io',
    rinkeby: 'api-rinkeby.etherscan.io',
    ropsten: 'api-ropsten.etherscan.io',
    goerli: 'api-goerli.etherscan.io',
    mainnet: 'api.etherscan.io',
  }[network];

  if (!host) {
    throw new Error(`Unknown etherscan API host for network ${network}`);
  }

  return `https://${host}/api`;
}

export function getEtherscanUrl(network: string): string {
  let host = {
    kovan: 'kovan.etherscan.io',
    rinkeby: 'rinkeby.etherscan.io',
    ropsten: 'ropsten.etherscan.io',
    goerli: 'goerli.etherscan.io',
    mainnet: 'etherscan.io',
  }[network];

  if (!host) {
    throw new Error(`Unknown etherscan host for network ${network}`);
  }

  return `https://${host}`;
}

export async function get(url, data, parser: any = JSON.parse) {
  const res = (await axios.get(url, { params: data }))['data'];
  return res;
}
