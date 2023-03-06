import { ARBITRUM, AVALANCHE } from "./chains";

export const SUBGRAPH_URLS = {
  [ARBITRUM]: {
    stats: "https://api.thegraph.com/subgraphs/name/fmx-io/fmx-stats",
    referrals: "https://api.thegraph.com/subgraphs/name/fmx-io/fmx-arbitrum-referrals",
    nissohVault: "https://api.thegraph.com/subgraphs/name/nissoh/fmx-vault",
  },

  [AVALANCHE]: {
    stats: "https://api.thegraph.com/subgraphs/name/fmx-io/fmx-avalanche-stats",
    referrals: "https://api.thegraph.com/subgraphs/name/fmx-io/fmx-avalanche-referrals",
  },

  common: {
    chainLink: "https://api.thegraph.com/subgraphs/name/deividask/chainlink",
  },
};
