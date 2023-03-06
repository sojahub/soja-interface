import React from "react";

import useSWR from "swr";

import {
  PLACEHOLDER_ACCOUNT,
  getBalanceAndSupplyData,
  getDepositBalanceData,
  getVestingData,
  getStakingData,
  getProcessedData,
} from "lib/legacy";

import Vault from "abis/Vault.json";
import ReaderV2 from "abis/ReaderV2.json";
import RewardReader from "abis/RewardReader.json";
import Token from "abis/Token.json";
import GlpManager from "abis/GlpManager.json";

import { useWeb3React } from "@web3-react/core";

import { useFmxPrice } from "domain/legacy";

import { getContract } from "config/contracts";
import { getServerUrl } from "config/backend";
import { contractFetcher } from "lib/contracts";
import { formatKeyAmount } from "lib/numbers";

export default function APRLabel({ chainId, label }) {
  let { active } = useWeb3React();

  const rewardReaderAddress = getContract(chainId, "RewardReader");
  const readerAddress = getContract(chainId, "Reader");

  const vaultAddress = getContract(chainId, "Vault");
  const nativeTokenAddress = getContract(chainId, "NATIVE_TOKEN");
  const fmxAddress = getContract(chainId, "FMX");
  const esFmxAddress = getContract(chainId, "ES_FMX");
  const bnFmxAddress = getContract(chainId, "BN_FMX");
  const glpAddress = getContract(chainId, "GLP");

  const stakedFmxTrackerAddress = getContract(chainId, "StakedFmxTracker");
  const bonusFmxTrackerAddress = getContract(chainId, "BonusFmxTracker");
  const feeFmxTrackerAddress = getContract(chainId, "FeeFmxTracker");

  const stakedGlpTrackerAddress = getContract(chainId, "StakedGlpTracker");
  const feeGlpTrackerAddress = getContract(chainId, "FeeGlpTracker");

  const glpManagerAddress = getContract(chainId, "GlpManager");

  const fmxVesterAddress = getContract(chainId, "FmxVester");
  const glpVesterAddress = getContract(chainId, "GlpVester");

  const vesterAddresses = [fmxVesterAddress, glpVesterAddress];

  const walletTokens = [fmxAddress, esFmxAddress, glpAddress, stakedFmxTrackerAddress];
  const depositTokens = [
    fmxAddress,
    esFmxAddress,
    stakedFmxTrackerAddress,
    bonusFmxTrackerAddress,
    bnFmxAddress,
    glpAddress,
  ];
  const rewardTrackersForDepositBalances = [
    stakedFmxTrackerAddress,
    stakedFmxTrackerAddress,
    bonusFmxTrackerAddress,
    feeFmxTrackerAddress,
    feeFmxTrackerAddress,
    feeGlpTrackerAddress,
  ];
  const rewardTrackersForStakingInfo = [
    stakedFmxTrackerAddress,
    bonusFmxTrackerAddress,
    feeFmxTrackerAddress,
    stakedGlpTrackerAddress,
    feeGlpTrackerAddress,
  ];

  const { data: walletBalances } = useSWR(
    [`StakeV2:walletBalances:${active}`, chainId, readerAddress, "getTokenBalancesWithSupplies", PLACEHOLDER_ACCOUNT],
    {
      fetcher: contractFetcher(undefined, ReaderV2, [walletTokens]),
    }
  );

  const { data: depositBalances } = useSWR(
    [`StakeV2:depositBalances:${active}`, chainId, rewardReaderAddress, "getDepositBalances", PLACEHOLDER_ACCOUNT],
    {
      fetcher: contractFetcher(undefined, RewardReader, [depositTokens, rewardTrackersForDepositBalances]),
    }
  );

  const { data: stakingInfo } = useSWR(
    [`StakeV2:stakingInfo:${active}`, chainId, rewardReaderAddress, "getStakingInfo", PLACEHOLDER_ACCOUNT],
    {
      fetcher: contractFetcher(undefined, RewardReader, [rewardTrackersForStakingInfo]),
    }
  );

  const { data: stakedFmxSupply } = useSWR(
    [`StakeV2:stakedFmxSupply:${active}`, chainId, fmxAddress, "balanceOf", stakedFmxTrackerAddress],
    {
      fetcher: contractFetcher(undefined, Token),
    }
  );

  const { data: aums } = useSWR([`StakeV2:getAums:${active}`, chainId, glpManagerAddress, "getAums"], {
    fetcher: contractFetcher(undefined, GlpManager),
  });

  const { data: nativeTokenPrice } = useSWR(
    [`StakeV2:nativeTokenPrice:${active}`, chainId, vaultAddress, "getMinPrice", nativeTokenAddress],
    {
      fetcher: contractFetcher(undefined, Vault),
    }
  );

  const { data: vestingInfo } = useSWR(
    [`StakeV2:vestingInfo:${active}`, chainId, readerAddress, "getVestingInfo", PLACEHOLDER_ACCOUNT],
    {
      fetcher: contractFetcher(undefined, ReaderV2, [vesterAddresses]),
    }
  );

  const { fmxPrice } = useFmxPrice(chainId, {}, active);

  const fmxSupplyUrl = getServerUrl(chainId, "/fmx_supply");
  const { data: fmxSupply } = useSWR([fmxSupplyUrl], {
    fetcher: (...args) => fetch(...args).then((res) => res.text()),
  });

  let aum;
  if (aums && aums.length > 0) {
    aum = aums[0].add(aums[1]).div(2);
  }

  const { balanceData, supplyData } = getBalanceAndSupplyData(walletBalances);
  const depositBalanceData = getDepositBalanceData(depositBalances);
  const stakingData = getStakingData(stakingInfo);
  const vestingData = getVestingData(vestingInfo);

  const processedData = getProcessedData(
    balanceData,
    supplyData,
    depositBalanceData,
    stakingData,
    vestingData,
    aum,
    nativeTokenPrice,
    stakedFmxSupply,
    fmxPrice,
    fmxSupply
  );

  return <>{`${formatKeyAmount(processedData, label, 2, 2, true)}%`}</>;
}
