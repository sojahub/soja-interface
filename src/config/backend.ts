import { ARBITRUM, ARBITRUM_TESTNET, AVALANCHE, MAINNET } from "./chains";

export const FMX_STATS_API_URL = "https://stats.fmx.io/api";

const BACKEND_URLS = {
  default: "https://fmx-server-mainnet.uw.r.appspot.com",

  [MAINNET]: "https://gambit-server-staging.uc.r.appspot.com",
  [ARBITRUM_TESTNET]: "https://gambit-server-devnet.uc.r.appspot.com",
  [ARBITRUM]: "https://fmx-server-mainnet.uw.r.appspot.com",
  [AVALANCHE]: "https://fmx-avax-server.uc.r.appspot.com",
};

export function getServerBaseUrl(chainId: number) {
  if (!chainId) {
    throw new Error("chainId is not provided");
  }

  if (document.location.hostname.includes("deploy-preview")) {
    const fromLocalStorage = localStorage.getItem("SERVER_BASE_URL");
    if (fromLocalStorage) {
      return fromLocalStorage;
    }
  }

  return BACKEND_URLS[chainId] || BACKEND_URLS.default;
}

export function getServerUrl(chainId: number, path: string) {
  return `${getServerBaseUrl(chainId)}${path}`;
}
