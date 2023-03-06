import React, { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Trans, t } from "@lingui/macro";
import { useWeb3React } from "@web3-react/core";

import Modal from "components/Modal/Modal";
import Checkbox from "components/Checkbox/Checkbox";
import Tooltip from "components/Tooltip/Tooltip";
import Footer from "components/Footer/Footer";

import Vault from "abis/Vault.json";
import ReaderV2 from "abis/ReaderV2.json";
import Vester from "abis/Vester.json";
import RewardRouter from "abis/RewardRouter.json";
import RewardReader from "abis/RewardReader.json";
import Token from "abis/Token.json";
import GlpManager from "abis/GlpManager.json";

import { ethers } from "ethers";
import {
  GLP_DECIMALS,
  USD_DECIMALS,
  BASIS_POINTS_DIVISOR,
  PLACEHOLDER_ACCOUNT,
  getBalanceAndSupplyData,
  getDepositBalanceData,
  getVestingData,
  getStakingData,
  getProcessedData,
  getPageTitle,
} from "lib/legacy";
import { useFmxPrice, useTotalFmxStaked, useTotalFmxSupply } from "domain/legacy";
import { ARBITRUM, getChainName, getConstant } from "config/chains";

import useSWR from "swr";

import { getContract } from "config/contracts";

import "./StakeV2.css";
import SEO from "components/Common/SEO";
import StatsTooltip from "components/StatsTooltip/StatsTooltip";
import StatsTooltipRow from "components/StatsTooltip/StatsTooltipRow";
import { getServerUrl } from "config/backend";
import { callContract, contractFetcher } from "lib/contracts";
import { useLocalStorageSerializeKey } from "lib/localStorage";
import { helperToast } from "lib/helperToast";
import { approveTokens } from "domain/tokens";
import { bigNumberify, expandDecimals, formatAmount, formatAmountFree, formatKeyAmount, parseValue } from "lib/numbers";
import { useChainId } from "lib/chains";
import ExternalLink from "components/ExternalLink/ExternalLink";
import FMXAprTooltip from "components/Stake/FMXAprTooltip";

const { AddressZero } = ethers.constants;

function StakeModal(props) {
  const {
    isVisible,
    setIsVisible,
    chainId,
    title,
    maxAmount,
    value,
    setValue,
    active,
    account,
    library,
    stakingTokenSymbol,
    stakingTokenAddress,
    farmAddress,
    rewardRouterAddress,
    stakeMethodName,
    setPendingTxns,
  } = props;
  const [isStaking, setIsStaking] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const { data: tokenAllowance } = useSWR(
    active && stakingTokenAddress && [active, chainId, stakingTokenAddress, "allowance", account, farmAddress],
    {
      fetcher: contractFetcher(library, Token),
    }
  );

  let amount = parseValue(value, 18);
  const needApproval = farmAddress !== AddressZero && tokenAllowance && amount && amount.gt(tokenAllowance);

  const getError = () => {
    if (!amount || amount.eq(0)) {
      return t`Enter an amount`;
    }
    if (maxAmount && amount.gt(maxAmount)) {
      return t`Max amount exceeded`;
    }
  };

  const onClickPrimary = () => {
    if (needApproval) {
      approveTokens({
        setIsApproving,
        library,
        tokenAddress: stakingTokenAddress,
        spender: farmAddress,
        chainId,
      });
      return;
    }

    setIsStaking(true);
    const contract = new ethers.Contract(rewardRouterAddress, RewardRouter.abi, library.getSigner());

    callContract(chainId, contract, stakeMethodName, [amount], {
      sentMsg: t`Stake submitted!`,
      failMsg: t`Stake failed.`,
      setPendingTxns,
    })
      .then(async (res) => {
        setIsVisible(false);
      })
      .finally(() => {
        setIsStaking(false);
      });
  };

  const isPrimaryEnabled = () => {
    const error = getError();
    if (error) {
      return false;
    }
    if (isApproving) {
      return false;
    }
    if (isStaking) {
      return false;
    }
    return true;
  };

  const getPrimaryText = () => {
    const error = getError();
    if (error) {
      return error;
    }
    if (isApproving) {
      return t`Approving ${stakingTokenSymbol}...`;
    }
    if (needApproval) {
      return t`Approve ${stakingTokenSymbol}`;
    }
    if (isStaking) {
      return t`Staking...`;
    }
    return t`Stake`;
  };

  return (
    <div className="StakeModal">
      <Modal isVisible={isVisible} setIsVisible={setIsVisible} label={title}>
        <div className="Exchange-swap-section">
          <div className="Exchange-swap-section-top">
            <div className="muted">
              <div className="Exchange-swap-usd">
                <Trans>Stake</Trans>
              </div>
            </div>
            <div className="muted align-right clickable" onClick={() => setValue(formatAmountFree(maxAmount, 18, 18))}>
              <Trans>Max: {formatAmount(maxAmount, 18, 4, true)}</Trans>
            </div>
          </div>
          <div className="Exchange-swap-section-bottom">
            <div>
              <input
                type="number"
                placeholder="0.0"
                className="Exchange-swap-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="PositionEditor-token-symbol">{stakingTokenSymbol}</div>
          </div>
        </div>
        <div className="Exchange-swap-button-container">
          <button className="App-cta Exchange-swap-button" onClick={onClickPrimary} disabled={!isPrimaryEnabled()}>
            {getPrimaryText()}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function UnstakeModal(props) {
  const {
    isVisible,
    setIsVisible,
    chainId,
    title,
    maxAmount,
    value,
    setValue,
    library,
    unstakingTokenSymbol,
    rewardRouterAddress,
    unstakeMethodName,
    multiplierPointsAmount,
    reservedAmount,
    bonusFmxInFeeFmx,
    setPendingTxns,
  } = props;
  const [isUnstaking, setIsUnstaking] = useState(false);

  let amount = parseValue(value, 18);
  let burnAmount;

  if (
    multiplierPointsAmount &&
    multiplierPointsAmount.gt(0) &&
    amount &&
    amount.gt(0) &&
    bonusFmxInFeeFmx &&
    bonusFmxInFeeFmx.gt(0)
  ) {
    burnAmount = multiplierPointsAmount.mul(amount).div(bonusFmxInFeeFmx);
  }

  const shouldShowReductionAmount = true;
  let rewardReductionBasisPoints;
  if (burnAmount && bonusFmxInFeeFmx) {
    rewardReductionBasisPoints = burnAmount.mul(BASIS_POINTS_DIVISOR).div(bonusFmxInFeeFmx);
  }

  const getError = () => {
    if (!amount) {
      return t`Enter an amount`;
    }
    if (amount.gt(maxAmount)) {
      return t`Max amount exceeded`;
    }
  };

  const onClickPrimary = () => {
    setIsUnstaking(true);
    const contract = new ethers.Contract(rewardRouterAddress, RewardRouter.abi, library.getSigner());
    callContract(chainId, contract, unstakeMethodName, [amount], {
      sentMsg: t`Unstake submitted!`,
      failMsg: t`Unstake failed.`,
      successMsg: t`Unstake completed!`,
      setPendingTxns,
    })
      .then(async (res) => {
        setIsVisible(false);
      })
      .finally(() => {
        setIsUnstaking(false);
      });
  };

  const isPrimaryEnabled = () => {
    const error = getError();
    if (error) {
      return false;
    }
    if (isUnstaking) {
      return false;
    }
    return true;
  };

  const getPrimaryText = () => {
    const error = getError();
    if (error) {
      return error;
    }
    if (isUnstaking) {
      return t`Unstaking...`;
    }
    return t`Unstake`;
  };

  return (
    <div className="StakeModal">
      <Modal isVisible={isVisible} setIsVisible={setIsVisible} label={title}>
        <div className="Exchange-swap-section">
          <div className="Exchange-swap-section-top">
            <div className="muted">
              <div className="Exchange-swap-usd">
                <Trans>Unstake</Trans>
              </div>
            </div>
            <div className="muted align-right clickable" onClick={() => setValue(formatAmountFree(maxAmount, 18, 18))}>
              <Trans>Max: {formatAmount(maxAmount, 18, 4, true)}</Trans>
            </div>
          </div>
          <div className="Exchange-swap-section-bottom">
            <div>
              <input
                type="number"
                placeholder="0.0"
                className="Exchange-swap-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="PositionEditor-token-symbol">{unstakingTokenSymbol}</div>
          </div>
        </div>
        {reservedAmount && reservedAmount.gt(0) && (
          <div className="Modal-note">
            You have {formatAmount(reservedAmount, 18, 2, true)} tokens reserved for vesting.
          </div>
        )}
        {burnAmount && burnAmount.gt(0) && rewardReductionBasisPoints && rewardReductionBasisPoints.gt(0) && (
          <div className="Modal-note">
            Unstaking will burn&nbsp;
            <ExternalLink href="https://fmxio.gitbook.io/fmx/rewards">
              {formatAmount(burnAmount, 18, 4, true)} Multiplier Points
            </ExternalLink>
            .&nbsp;
            {shouldShowReductionAmount && (
              <span>Boost Percentage: -{formatAmount(rewardReductionBasisPoints, 2, 2)}%.</span>
            )}
          </div>
        )}
        <div className="Exchange-swap-button-container">
          <button className="App-cta Exchange-swap-button" onClick={onClickPrimary} disabled={!isPrimaryEnabled()}>
            {getPrimaryText()}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function VesterDepositModal(props) {
  const {
    isVisible,
    setIsVisible,
    chainId,
    title,
    maxAmount,
    value,
    setValue,
    balance,
    vestedAmount,
    averageStakedAmount,
    maxVestableAmount,
    library,
    stakeTokenLabel,
    reserveAmount,
    maxReserveAmount,
    vesterAddress,
    setPendingTxns,
  } = props;
  const [isDepositing, setIsDepositing] = useState(false);

  let amount = parseValue(value, 18);

  let nextReserveAmount = reserveAmount;

  let nextDepositAmount = vestedAmount;
  if (amount) {
    nextDepositAmount = vestedAmount.add(amount);
  }

  let additionalReserveAmount = bigNumberify(0);
  if (amount && averageStakedAmount && maxVestableAmount && maxVestableAmount.gt(0)) {
    nextReserveAmount = nextDepositAmount.mul(averageStakedAmount).div(maxVestableAmount);
    if (nextReserveAmount.gt(reserveAmount)) {
      additionalReserveAmount = nextReserveAmount.sub(reserveAmount);
    }
  }

  const getError = () => {
    if (!amount || amount.eq(0)) {
      return t`Enter an amount`;
    }
    if (maxAmount && amount.gt(maxAmount)) {
      return t`Max amount exceeded`;
    }
    if (nextReserveAmount.gt(maxReserveAmount)) {
      return t`Insufficient staked tokens`;
    }
  };

  const onClickPrimary = () => {
    setIsDepositing(true);
    const contract = new ethers.Contract(vesterAddress, Vester.abi, library.getSigner());

    callContract(chainId, contract, "deposit", [amount], {
      sentMsg: t`Deposit submitted!`,
      failMsg: t`Deposit failed!`,
      successMsg: t`Deposited!`,
      setPendingTxns,
    })
      .then(async (res) => {
        setIsVisible(false);
      })
      .finally(() => {
        setIsDepositing(false);
      });
  };

  const isPrimaryEnabled = () => {
    const error = getError();
    if (error) {
      return false;
    }
    if (isDepositing) {
      return false;
    }
    return true;
  };

  const getPrimaryText = () => {
    const error = getError();
    if (error) {
      return error;
    }
    if (isDepositing) {
      return t`Depositing...`;
    }
    return t`Deposit`;
  };

  return (
    <SEO title={getPageTitle("Earn")}>
      <div className="StakeModal">
        <Modal isVisible={isVisible} setIsVisible={setIsVisible} label={title} className="non-scrollable">
          <div className="Exchange-swap-section">
            <div className="Exchange-swap-section-top">
              <div className="muted">
                <div className="Exchange-swap-usd">
                  <Trans>Deposit</Trans>
                </div>
              </div>
              <div
                className="muted align-right clickable"
                onClick={() => setValue(formatAmountFree(maxAmount, 18, 18))}
              >
                <Trans>Max: {formatAmount(maxAmount, 18, 4, true)}</Trans>
              </div>
            </div>
            <div className="Exchange-swap-section-bottom">
              <div>
                <input
                  type="number"
                  placeholder="0.0"
                  className="Exchange-swap-input"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
              <div className="PositionEditor-token-symbol">esFMX</div>
            </div>
          </div>
          <div className="VesterDepositModal-info-rows">
            <div className="Exchange-info-row">
              <div className="Exchange-info-label">
                <Trans>Wallet</Trans>
              </div>
              <div className="align-right">{formatAmount(balance, 18, 2, true)} esFMX</div>
            </div>
            <div className="Exchange-info-row">
              <div className="Exchange-info-label">
                <Trans>Vault Capacity</Trans>
              </div>
              <div className="align-right">
                <Tooltip
                  handle={`${formatAmount(nextDepositAmount, 18, 2, true)} / ${formatAmount(
                    maxVestableAmount,
                    18,
                    2,
                    true
                  )}`}
                  position="right-bottom"
                  renderContent={() => {
                    return (
                      <div>
                        <p className="text-white">
                          <Trans>Vault Capacity for your Account:</Trans>
                        </p>
                        <StatsTooltipRow
                          showDollar={false}
                          label={t`Deposited`}
                          value={`${formatAmount(vestedAmount, 18, 2, true)} esFMX`}
                        />
                        <StatsTooltipRow
                          showDollar={false}
                          label={t`Max Capacity`}
                          value={`${formatAmount(maxVestableAmount, 18, 2, true)} esFMX`}
                        />
                      </div>
                    );
                  }}
                />
              </div>
            </div>
            <div className="Exchange-info-row">
              <div className="Exchange-info-label">
                <Trans>Reserve Amount</Trans>
              </div>
              <div className="align-right">
                <Tooltip
                  handle={`${formatAmount(
                    reserveAmount && reserveAmount.gte(additionalReserveAmount)
                      ? reserveAmount
                      : additionalReserveAmount,
                    18,
                    2,
                    true
                  )} / ${formatAmount(maxReserveAmount, 18, 2, true)}`}
                  position="right-bottom"
                  renderContent={() => {
                    return (
                      <>
                        <StatsTooltipRow
                          label={t`Current Reserved`}
                          value={formatAmount(reserveAmount, 18, 2, true)}
                          showDollar={false}
                        />
                        <StatsTooltipRow
                          label={t`Additional reserve required`}
                          value={formatAmount(additionalReserveAmount, 18, 2, true)}
                          showDollar={false}
                        />
                        {amount && nextReserveAmount.gt(maxReserveAmount) && (
                          <>
                            <br />
                            <Trans>
                              You need a total of at least {formatAmount(nextReserveAmount, 18, 2, true)}{" "}
                              {stakeTokenLabel} to vest {formatAmount(amount, 18, 2, true)} esFMX.
                            </Trans>
                          </>
                        )}
                      </>
                    );
                  }}
                />
              </div>
            </div>
          </div>
          <div className="Exchange-swap-button-container">
            <button className="App-cta Exchange-swap-button" onClick={onClickPrimary} disabled={!isPrimaryEnabled()}>
              {getPrimaryText()}
            </button>
          </div>
        </Modal>
      </div>
    </SEO>
  );
}

function VesterWithdrawModal(props) {
  const { isVisible, setIsVisible, chainId, title, library, vesterAddress, setPendingTxns } = props;
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const onClickPrimary = () => {
    setIsWithdrawing(true);
    const contract = new ethers.Contract(vesterAddress, Vester.abi, library.getSigner());

    callContract(chainId, contract, "withdraw", [], {
      sentMsg: t`Withdraw submitted.`,
      failMsg: t`Withdraw failed.`,
      successMsg: t`Withdrawn!`,
      setPendingTxns,
    })
      .then(async (res) => {
        setIsVisible(false);
      })
      .finally(() => {
        setIsWithdrawing(false);
      });
  };

  return (
    <div className="StakeModal">
      <Modal isVisible={isVisible} setIsVisible={setIsVisible} label={title}>
        <Trans>
          <div>
            This will withdraw and unreserve all tokens as well as pause vesting.
            <br />
            <br />
            esFMX tokens that have been converted to FMX will remain as FMX tokens.
            <br />
            <br />
            To claim FMX tokens without withdrawing, use the "Claim" button under the Total Rewards section.
            <br />
            <br />
          </div>
        </Trans>
        <div className="Exchange-swap-button-container">
          <button className="App-cta Exchange-swap-button" onClick={onClickPrimary} disabled={isWithdrawing}>
            {!isWithdrawing && "Confirm Withdraw"}
            {isWithdrawing && "Confirming..."}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function CompoundModal(props) {
  const {
    isVisible,
    setIsVisible,
    rewardRouterAddress,
    active,
    account,
    library,
    chainId,
    setPendingTxns,
    totalVesterRewards,
    nativeTokenSymbol,
    wrappedTokenSymbol,
  } = props;
  const [isCompounding, setIsCompounding] = useState(false);
  const [shouldClaimFmx, setShouldClaimFmx] = useLocalStorageSerializeKey(
    [chainId, "StakeV2-compound-should-claim-fmx"],
    true
  );
  const [shouldStakeFmx, setShouldStakeFmx] = useLocalStorageSerializeKey(
    [chainId, "StakeV2-compound-should-stake-fmx"],
    true
  );
  const [shouldClaimEsFmx, setShouldClaimEsFmx] = useLocalStorageSerializeKey(
    [chainId, "StakeV2-compound-should-claim-es-fmx"],
    true
  );
  const [shouldStakeEsFmx, setShouldStakeEsFmx] = useLocalStorageSerializeKey(
    [chainId, "StakeV2-compound-should-stake-es-fmx"],
    true
  );
  const [shouldStakeMultiplierPoints, setShouldStakeMultiplierPoints] = useState(true);
  const [shouldClaimWeth, setShouldClaimWeth] = useLocalStorageSerializeKey(
    [chainId, "StakeV2-compound-should-claim-weth"],
    true
  );
  const [shouldConvertWeth, setShouldConvertWeth] = useLocalStorageSerializeKey(
    [chainId, "StakeV2-compound-should-convert-weth"],
    true
  );

  const fmxAddress = getContract(chainId, "FMX");
  const stakedFmxTrackerAddress = getContract(chainId, "StakedFmxTracker");

  const [isApproving, setIsApproving] = useState(false);

  const { data: tokenAllowance } = useSWR(
    active && [active, chainId, fmxAddress, "allowance", account, stakedFmxTrackerAddress],
    {
      fetcher: contractFetcher(library, Token),
    }
  );

  const needApproval = shouldStakeFmx && tokenAllowance && totalVesterRewards && totalVesterRewards.gt(tokenAllowance);

  const isPrimaryEnabled = () => {
    return !isCompounding && !isApproving && !isCompounding;
  };

  const getPrimaryText = () => {
    if (isApproving) {
      return t`Approving FMX...`;
    }
    if (needApproval) {
      return t`Approve FMX`;
    }
    if (isCompounding) {
      return t`Compounding...`;
    }
    return t`Compound`;
  };

  const onClickPrimary = () => {
    if (needApproval) {
      approveTokens({
        setIsApproving,
        library,
        tokenAddress: fmxAddress,
        spender: stakedFmxTrackerAddress,
        chainId,
      });
      return;
    }

    setIsCompounding(true);

    const contract = new ethers.Contract(rewardRouterAddress, RewardRouter.abi, library.getSigner());
    callContract(
      chainId,
      contract,
      "handleRewards",
      [
        shouldClaimFmx || shouldStakeFmx,
        shouldStakeFmx,
        shouldClaimEsFmx || shouldStakeEsFmx,
        shouldStakeEsFmx,
        shouldStakeMultiplierPoints,
        shouldClaimWeth || shouldConvertWeth,
        shouldConvertWeth,
      ],
      {
        sentMsg: t`Compound submitted!`,
        failMsg: t`Compound failed.`,
        successMsg: t`Compound completed!`,
        setPendingTxns,
      }
    )
      .then(async (res) => {
        setIsVisible(false);
      })
      .finally(() => {
        setIsCompounding(false);
      });
  };

  const toggleShouldStakeFmx = (value) => {
    if (value) {
      setShouldClaimFmx(true);
    }
    setShouldStakeFmx(value);
  };

  const toggleShouldStakeEsFmx = (value) => {
    if (value) {
      setShouldClaimEsFmx(true);
    }
    setShouldStakeEsFmx(value);
  };

  const toggleConvertWeth = (value) => {
    if (value) {
      setShouldClaimWeth(true);
    }
    setShouldConvertWeth(value);
  };

  return (
    <div className="StakeModal">
      <Modal isVisible={isVisible} setIsVisible={setIsVisible} label={t`Compound Rewards`}>
        <div className="CompoundModal-menu">
          <div>
            <Checkbox
              isChecked={shouldStakeMultiplierPoints}
              setIsChecked={setShouldStakeMultiplierPoints}
              disabled={true}
            >
              <Trans>Stake Multiplier Points</Trans>
            </Checkbox>
          </div>
          <div>
            <Checkbox isChecked={shouldClaimFmx} setIsChecked={setShouldClaimFmx} disabled={shouldStakeFmx}>
              <Trans>Claim FMX Rewards</Trans>
            </Checkbox>
          </div>
          <div>
            <Checkbox isChecked={shouldStakeFmx} setIsChecked={toggleShouldStakeFmx}>
              <Trans>Stake FMX Rewards</Trans>
            </Checkbox>
          </div>
          <div>
            <Checkbox isChecked={shouldClaimEsFmx} setIsChecked={setShouldClaimEsFmx} disabled={shouldStakeEsFmx}>
              <Trans>Claim esFMX Rewards</Trans>
            </Checkbox>
          </div>
          <div>
            <Checkbox isChecked={shouldStakeEsFmx} setIsChecked={toggleShouldStakeEsFmx}>
              <Trans>Stake esFMX Rewards</Trans>
            </Checkbox>
          </div>
          <div>
            <Checkbox isChecked={shouldClaimWeth} setIsChecked={setShouldClaimWeth} disabled={shouldConvertWeth}>
              <Trans>Claim {wrappedTokenSymbol} Rewards</Trans>
            </Checkbox>
          </div>
          <div>
            <Checkbox isChecked={shouldConvertWeth} setIsChecked={toggleConvertWeth}>
              <Trans>
                Convert {wrappedTokenSymbol} to {nativeTokenSymbol}
              </Trans>
            </Checkbox>
          </div>
        </div>
        <div className="Exchange-swap-button-container">
          <button className="App-cta Exchange-swap-button" onClick={onClickPrimary} disabled={!isPrimaryEnabled()}>
            {getPrimaryText()}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function ClaimModal(props) {
  const {
    isVisible,
    setIsVisible,
    rewardRouterAddress,
    library,
    chainId,
    setPendingTxns,
    nativeTokenSymbol,
    wrappedTokenSymbol,
  } = props;
  const [isClaiming, setIsClaiming] = useState(false);
  const [shouldClaimFmx, setShouldClaimFmx] = useLocalStorageSerializeKey(
    [chainId, "StakeV2-claim-should-claim-fmx"],
    true
  );
  const [shouldClaimEsFmx, setShouldClaimEsFmx] = useLocalStorageSerializeKey(
    [chainId, "StakeV2-claim-should-claim-es-fmx"],
    true
  );
  const [shouldClaimWeth, setShouldClaimWeth] = useLocalStorageSerializeKey(
    [chainId, "StakeV2-claim-should-claim-weth"],
    true
  );
  const [shouldConvertWeth, setShouldConvertWeth] = useLocalStorageSerializeKey(
    [chainId, "StakeV2-claim-should-convert-weth"],
    true
  );

  const isPrimaryEnabled = () => {
    return !isClaiming;
  };

  const getPrimaryText = () => {
    if (isClaiming) {
      return t`Claiming...`;
    }
    return t`Claim`;
  };

  const onClickPrimary = () => {
    setIsClaiming(true);

    const contract = new ethers.Contract(rewardRouterAddress, RewardRouter.abi, library.getSigner());
    callContract(
      chainId,
      contract,
      "handleRewards",
      [
        shouldClaimFmx,
        false, // shouldStakeFmx
        shouldClaimEsFmx,
        false, // shouldStakeEsFmx
        false, // shouldStakeMultiplierPoints
        shouldClaimWeth,
        shouldConvertWeth,
      ],
      {
        sentMsg: t`Claim submitted.`,
        failMsg: t`Claim failed.`,
        successMsg: t`Claim completed!`,
        setPendingTxns,
      }
    )
      .then(async (res) => {
        setIsVisible(false);
      })
      .finally(() => {
        setIsClaiming(false);
      });
  };

  const toggleConvertWeth = (value) => {
    if (value) {
      setShouldClaimWeth(true);
    }
    setShouldConvertWeth(value);
  };

  return (
    <div className="StakeModal">
      <Modal isVisible={isVisible} setIsVisible={setIsVisible} label={t`Claim Rewards`}>
        <div className="CompoundModal-menu">
          <div>
            <Checkbox isChecked={shouldClaimFmx} setIsChecked={setShouldClaimFmx}>
              <Trans>Claim FMX Rewards</Trans>
            </Checkbox>
          </div>
          <div>
            <Checkbox isChecked={shouldClaimEsFmx} setIsChecked={setShouldClaimEsFmx}>
              <Trans>Claim esFMX Rewards</Trans>
            </Checkbox>
          </div>
          <div>
            <Checkbox isChecked={shouldClaimWeth} setIsChecked={setShouldClaimWeth} disabled={shouldConvertWeth}>
              <Trans>Claim {wrappedTokenSymbol} Rewards</Trans>
            </Checkbox>
          </div>
          <div>
            <Checkbox isChecked={shouldConvertWeth} setIsChecked={toggleConvertWeth}>
              <Trans>
                Convert {wrappedTokenSymbol} to {nativeTokenSymbol}
              </Trans>
            </Checkbox>
          </div>
        </div>
        <div className="Exchange-swap-button-container">
          <button className="App-cta Exchange-swap-button" onClick={onClickPrimary} disabled={!isPrimaryEnabled()}>
            {getPrimaryText()}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default function StakeV2({ setPendingTxns, connectWallet }) {
  const { active, library, account } = useWeb3React();
  const { chainId } = useChainId();

  const chainName = getChainName(chainId);

  const hasInsurance = true;

  const [isStakeModalVisible, setIsStakeModalVisible] = useState(false);
  const [stakeModalTitle, setStakeModalTitle] = useState("");
  const [stakeModalMaxAmount, setStakeModalMaxAmount] = useState(undefined);
  const [stakeValue, setStakeValue] = useState("");
  const [stakingTokenSymbol, setStakingTokenSymbol] = useState("");
  const [stakingTokenAddress, setStakingTokenAddress] = useState("");
  const [stakingFarmAddress, setStakingFarmAddress] = useState("");
  const [stakeMethodName, setStakeMethodName] = useState("");

  const [isUnstakeModalVisible, setIsUnstakeModalVisible] = useState(false);
  const [unstakeModalTitle, setUnstakeModalTitle] = useState("");
  const [unstakeModalMaxAmount, setUnstakeModalMaxAmount] = useState(undefined);
  const [unstakeModalReservedAmount, setUnstakeModalReservedAmount] = useState(undefined);
  const [unstakeValue, setUnstakeValue] = useState("");
  const [unstakingTokenSymbol, setUnstakingTokenSymbol] = useState("");
  const [unstakeMethodName, setUnstakeMethodName] = useState("");

  const [isVesterDepositModalVisible, setIsVesterDepositModalVisible] = useState(false);
  const [vesterDepositTitle, setVesterDepositTitle] = useState("");
  const [vesterDepositStakeTokenLabel, setVesterDepositStakeTokenLabel] = useState("");
  const [vesterDepositMaxAmount, setVesterDepositMaxAmount] = useState("");
  const [vesterDepositBalance, setVesterDepositBalance] = useState("");
  const [vesterDepositEscrowedBalance, setVesterDepositEscrowedBalance] = useState("");
  const [vesterDepositVestedAmount, setVesterDepositVestedAmount] = useState("");
  const [vesterDepositAverageStakedAmount, setVesterDepositAverageStakedAmount] = useState("");
  const [vesterDepositMaxVestableAmount, setVesterDepositMaxVestableAmount] = useState("");
  const [vesterDepositValue, setVesterDepositValue] = useState("");
  const [vesterDepositReserveAmount, setVesterDepositReserveAmount] = useState("");
  const [vesterDepositMaxReserveAmount, setVesterDepositMaxReserveAmount] = useState("");
  const [vesterDepositAddress, setVesterDepositAddress] = useState("");

  const [isVesterWithdrawModalVisible, setIsVesterWithdrawModalVisible] = useState(false);
  const [vesterWithdrawTitle, setVesterWithdrawTitle] = useState(false);
  const [vesterWithdrawAddress, setVesterWithdrawAddress] = useState("");

  const [isCompoundModalVisible, setIsCompoundModalVisible] = useState(false);
  const [isClaimModalVisible, setIsClaimModalVisible] = useState(false);

  const rewardRouterAddress = getContract(chainId, "RewardRouter");
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

  const stakedFmxDistributorAddress = getContract(chainId, "StakedFmxDistributor");
  const stakedGlpDistributorAddress = getContract(chainId, "StakedGlpDistributor");

  const fmxVesterAddress = getContract(chainId, "FmxVester");
  const glpVesterAddress = getContract(chainId, "GlpVester");

  const vesterAddresses = [fmxVesterAddress, glpVesterAddress];

  const excludedEsFmxAccounts = [stakedFmxDistributorAddress, stakedGlpDistributorAddress];

  const nativeTokenSymbol = getConstant(chainId, "nativeTokenSymbol");
  const wrappedTokenSymbol = getConstant(chainId, "wrappedTokenSymbol");

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
    [
      `StakeV2:walletBalances:${active}`,
      chainId,
      readerAddress,
      "getTokenBalancesWithSupplies",
      account || PLACEHOLDER_ACCOUNT,
    ],
    {
      fetcher: contractFetcher(library, ReaderV2, [walletTokens]),
    }
  );

  const { data: depositBalances } = useSWR(
    [
      `StakeV2:depositBalances:${active}`,
      chainId,
      rewardReaderAddress,
      "getDepositBalances",
      account || PLACEHOLDER_ACCOUNT,
    ],
    {
      fetcher: contractFetcher(library, RewardReader, [depositTokens, rewardTrackersForDepositBalances]),
    }
  );

  const { data: stakingInfo } = useSWR(
    [`StakeV2:stakingInfo:${active}`, chainId, rewardReaderAddress, "getStakingInfo", account || PLACEHOLDER_ACCOUNT],
    {
      fetcher: contractFetcher(library, RewardReader, [rewardTrackersForStakingInfo]),
    }
  );

  const { data: stakedFmxSupply } = useSWR(
    [`StakeV2:stakedFmxSupply:${active}`, chainId, fmxAddress, "balanceOf", stakedFmxTrackerAddress],
    {
      fetcher: contractFetcher(library, Token),
    }
  );

  const { data: aums } = useSWR([`StakeV2:getAums:${active}`, chainId, glpManagerAddress, "getAums"], {
    fetcher: contractFetcher(library, GlpManager),
  });

  const { data: nativeTokenPrice } = useSWR(
    [`StakeV2:nativeTokenPrice:${active}`, chainId, vaultAddress, "getMinPrice", nativeTokenAddress],
    {
      fetcher: contractFetcher(library, Vault),
    }
  );

  const { data: esFmxSupply } = useSWR(
    [`StakeV2:esFmxSupply:${active}`, chainId, readerAddress, "getTokenSupply", esFmxAddress],
    {
      fetcher: contractFetcher(library, ReaderV2, [excludedEsFmxAccounts]),
    }
  );

  const { data: vestingInfo } = useSWR(
    [`StakeV2:vestingInfo:${active}`, chainId, readerAddress, "getVestingInfo", account || PLACEHOLDER_ACCOUNT],
    {
      fetcher: contractFetcher(library, ReaderV2, [vesterAddresses]),
    }
  );

  const { fmxPrice, fmxPriceFromArbitrum, fmxPriceFromAvalanche } = useFmxPrice(
    chainId,
    { arbitrum: chainId === ARBITRUM ? library : undefined },
    active
  );

  let { total: totalFmxSupply } = useTotalFmxSupply();

  let { avax: avaxFmxStaked, arbitrum: arbitrumFmxStaked, total: totalFmxStaked } = useTotalFmxStaked();

  const fmxSupplyUrl = getServerUrl(chainId, "/fmx_supply");
  const { data: fmxSupply } = useSWR([fmxSupplyUrl], {
    fetcher: (...args) => fetch(...args).then((res) => res.text()),
  });

  const isFmxTransferEnabled = true;

  let esFmxSupplyUsd;
  if (esFmxSupply && fmxPrice) {
    esFmxSupplyUsd = esFmxSupply.mul(fmxPrice).div(expandDecimals(1, 18));
  }

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

  let hasMultiplierPoints = false;
  let multiplierPointsAmount;
  if (processedData && processedData.bonusFmxTrackerRewards && processedData.bnFmxInFeeFmx) {
    multiplierPointsAmount = processedData.bonusFmxTrackerRewards.add(processedData.bnFmxInFeeFmx);
    if (multiplierPointsAmount.gt(0)) {
      hasMultiplierPoints = true;
    }
  }
  let totalRewardTokens;
  if (processedData && processedData.bnFmxInFeeFmx && processedData.bonusFmxInFeeFmx) {
    totalRewardTokens = processedData.bnFmxInFeeFmx.add(processedData.bonusFmxInFeeFmx);
  }

  let totalRewardTokensAndGlp;
  if (totalRewardTokens && processedData && processedData.glpBalance) {
    totalRewardTokensAndGlp = totalRewardTokens.add(processedData.glpBalance);
  }

  const bonusFmxInFeeFmx = processedData ? processedData.bonusFmxInFeeFmx : undefined;

  let stakedFmxSupplyUsd;
  if (!totalFmxStaked.isZero() && fmxPrice) {
    stakedFmxSupplyUsd = totalFmxStaked.mul(fmxPrice).div(expandDecimals(1, 18));
  }

  let totalSupplyUsd;
  if (totalFmxSupply && !totalFmxSupply.isZero() && fmxPrice) {
    totalSupplyUsd = totalFmxSupply.mul(fmxPrice).div(expandDecimals(1, 18));
  }

  let maxUnstakeableFmx = bigNumberify(0);
  if (
    totalRewardTokens &&
    vestingData &&
    vestingData.fmxVesterPairAmount &&
    multiplierPointsAmount &&
    processedData.bonusFmxInFeeFmx
  ) {
    const availableTokens = totalRewardTokens.sub(vestingData.fmxVesterPairAmount);
    const stakedTokens = processedData.bonusFmxInFeeFmx;
    const divisor = multiplierPointsAmount.add(stakedTokens);
    if (divisor.gt(0)) {
      maxUnstakeableFmx = availableTokens.mul(stakedTokens).div(divisor);
    }
  }

  const showStakeFmxModal = () => {
    if (!isFmxTransferEnabled) {
      helperToast.error(t`FMX transfers not yet enabled`);
      return;
    }

    setIsStakeModalVisible(true);
    setStakeModalTitle(t`Stake FMX`);
    setStakeModalMaxAmount(processedData.fmxBalance);
    setStakeValue("");
    setStakingTokenSymbol("FMX");
    setStakingTokenAddress(fmxAddress);
    setStakingFarmAddress(stakedFmxTrackerAddress);
    setStakeMethodName("stakeFmx");
  };

  const showStakeEsFmxModal = () => {
    setIsStakeModalVisible(true);
    setStakeModalTitle(t`Stake esFMX`);
    setStakeModalMaxAmount(processedData.esFmxBalance);
    setStakeValue("");
    setStakingTokenSymbol("esFMX");
    setStakingTokenAddress(esFmxAddress);
    setStakingFarmAddress(AddressZero);
    setStakeMethodName("stakeEsFmx");
  };

  const showFmxVesterDepositModal = () => {
    let remainingVestableAmount = vestingData.fmxVester.maxVestableAmount.sub(vestingData.fmxVester.vestedAmount);
    if (processedData.esFmxBalance.lt(remainingVestableAmount)) {
      remainingVestableAmount = processedData.esFmxBalance;
    }

    setIsVesterDepositModalVisible(true);
    setVesterDepositTitle(t`FMX Vault`);
    setVesterDepositStakeTokenLabel("staked FMX + esFMX + Multiplier Points");
    setVesterDepositMaxAmount(remainingVestableAmount);
    setVesterDepositBalance(processedData.esFmxBalance);
    setVesterDepositEscrowedBalance(vestingData.fmxVester.escrowedBalance);
    setVesterDepositVestedAmount(vestingData.fmxVester.vestedAmount);
    setVesterDepositMaxVestableAmount(vestingData.fmxVester.maxVestableAmount);
    setVesterDepositAverageStakedAmount(vestingData.fmxVester.averageStakedAmount);
    setVesterDepositReserveAmount(vestingData.fmxVester.pairAmount);
    setVesterDepositMaxReserveAmount(totalRewardTokens);
    setVesterDepositValue("");
    setVesterDepositAddress(fmxVesterAddress);
  };

  const showGlpVesterDepositModal = () => {
    let remainingVestableAmount = vestingData.glpVester.maxVestableAmount.sub(vestingData.glpVester.vestedAmount);
    if (processedData.esFmxBalance.lt(remainingVestableAmount)) {
      remainingVestableAmount = processedData.esFmxBalance;
    }

    setIsVesterDepositModalVisible(true);
    setVesterDepositTitle(t`GLP Vault`);
    setVesterDepositStakeTokenLabel("staked GLP");
    setVesterDepositMaxAmount(remainingVestableAmount);
    setVesterDepositBalance(processedData.esFmxBalance);
    setVesterDepositEscrowedBalance(vestingData.glpVester.escrowedBalance);
    setVesterDepositVestedAmount(vestingData.glpVester.vestedAmount);
    setVesterDepositMaxVestableAmount(vestingData.glpVester.maxVestableAmount);
    setVesterDepositAverageStakedAmount(vestingData.glpVester.averageStakedAmount);
    setVesterDepositReserveAmount(vestingData.glpVester.pairAmount);
    setVesterDepositMaxReserveAmount(processedData.glpBalance);
    setVesterDepositValue("");
    setVesterDepositAddress(glpVesterAddress);
  };

  const showFmxVesterWithdrawModal = () => {
    if (!vestingData || !vestingData.fmxVesterVestedAmount || vestingData.fmxVesterVestedAmount.eq(0)) {
      helperToast.error(t`You have not deposited any tokens for vesting.`);
      return;
    }

    setIsVesterWithdrawModalVisible(true);
    setVesterWithdrawTitle(t`Withdraw from FMX Vault`);
    setVesterWithdrawAddress(fmxVesterAddress);
  };

  const showGlpVesterWithdrawModal = () => {
    if (!vestingData || !vestingData.glpVesterVestedAmount || vestingData.glpVesterVestedAmount.eq(0)) {
      helperToast.error(t`You have not deposited any tokens for vesting.`);
      return;
    }

    setIsVesterWithdrawModalVisible(true);
    setVesterWithdrawTitle(t`Withdraw from GLP Vault`);
    setVesterWithdrawAddress(glpVesterAddress);
  };

  const showUnstakeFmxModal = () => {
    if (!isFmxTransferEnabled) {
      helperToast.error(t`FMX transfers not yet enabled`);
      return;
    }
    setIsUnstakeModalVisible(true);
    setUnstakeModalTitle(t`Unstake FMX`);
    let maxAmount = processedData.fmxInStakedFmx;
    if (
      processedData.fmxInStakedFmx &&
      vestingData &&
      vestingData.fmxVesterPairAmount.gt(0) &&
      maxUnstakeableFmx &&
      maxUnstakeableFmx.lt(processedData.fmxInStakedFmx)
    ) {
      maxAmount = maxUnstakeableFmx;
    }
    setUnstakeModalMaxAmount(maxAmount);
    setUnstakeModalReservedAmount(vestingData.fmxVesterPairAmount);
    setUnstakeValue("");
    setUnstakingTokenSymbol("FMX");
    setUnstakeMethodName("unstakeFmx");
  };

  const showUnstakeEsFmxModal = () => {
    setIsUnstakeModalVisible(true);
    setUnstakeModalTitle(t`Unstake esFMX`);
    let maxAmount = processedData.esFmxInStakedFmx;
    if (
      processedData.esFmxInStakedFmx &&
      vestingData &&
      vestingData.fmxVesterPairAmount.gt(0) &&
      maxUnstakeableFmx &&
      maxUnstakeableFmx.lt(processedData.esFmxInStakedFmx)
    ) {
      maxAmount = maxUnstakeableFmx;
    }
    setUnstakeModalMaxAmount(maxAmount);
    setUnstakeModalReservedAmount(vestingData.fmxVesterPairAmount);
    setUnstakeValue("");
    setUnstakingTokenSymbol("esFMX");
    setUnstakeMethodName("unstakeEsFmx");
  };

  const renderMultiplierPointsLabel = useCallback(() => {
    return t`Multiplier Points APR`;
  }, []);

  const renderMultiplierPointsValue = useCallback(() => {
    return (
      <Tooltip
        handle={`100.00%`}
        position="right-bottom"
        renderContent={() => {
          return (
            <Trans>
              Boost your rewards with Multiplier Points.&nbsp;
              <ExternalLink href="https://fmxio.gitbook.io/fmx/rewards#multiplier-points">More info</ExternalLink>.
            </Trans>
          );
        }}
      />
    );
  }, []);

  let earnMsg;
  if (totalRewardTokensAndGlp && totalRewardTokensAndGlp.gt(0)) {
    let fmxAmountStr;
    if (processedData.fmxInStakedFmx && processedData.fmxInStakedFmx.gt(0)) {
      fmxAmountStr = formatAmount(processedData.fmxInStakedFmx, 18, 2, true) + " FMX";
    }
    let esFmxAmountStr;
    if (processedData.esFmxInStakedFmx && processedData.esFmxInStakedFmx.gt(0)) {
      esFmxAmountStr = formatAmount(processedData.esFmxInStakedFmx, 18, 2, true) + " esFMX";
    }
    let mpAmountStr;
    if (processedData.bonusFmxInFeeFmx && processedData.bnFmxInFeeFmx.gt(0)) {
      mpAmountStr = formatAmount(processedData.bnFmxInFeeFmx, 18, 2, true) + " MP";
    }
    let glpStr;
    if (processedData.glpBalance && processedData.glpBalance.gt(0)) {
      glpStr = formatAmount(processedData.glpBalance, 18, 2, true) + " GLP";
    }
    const amountStr = [fmxAmountStr, esFmxAmountStr, mpAmountStr, glpStr].filter((s) => s).join(", ");
    earnMsg = (
      <div>
        <Trans>
          You are earning {nativeTokenSymbol} rewards with {formatAmount(totalRewardTokensAndGlp, 18, 2, true)} tokens.
          <br />
          Tokens: {amountStr}.
        </Trans>
      </div>
    );
  }

  return (
    <div className="default-container page-layout">
      <StakeModal
        isVisible={isStakeModalVisible}
        setIsVisible={setIsStakeModalVisible}
        chainId={chainId}
        title={stakeModalTitle}
        maxAmount={stakeModalMaxAmount}
        value={stakeValue}
        setValue={setStakeValue}
        active={active}
        account={account}
        library={library}
        stakingTokenSymbol={stakingTokenSymbol}
        stakingTokenAddress={stakingTokenAddress}
        farmAddress={stakingFarmAddress}
        rewardRouterAddress={rewardRouterAddress}
        stakeMethodName={stakeMethodName}
        hasMultiplierPoints={hasMultiplierPoints}
        setPendingTxns={setPendingTxns}
        nativeTokenSymbol={nativeTokenSymbol}
        wrappedTokenSymbol={wrappedTokenSymbol}
      />
      <UnstakeModal
        setPendingTxns={setPendingTxns}
        isVisible={isUnstakeModalVisible}
        setIsVisible={setIsUnstakeModalVisible}
        chainId={chainId}
        title={unstakeModalTitle}
        maxAmount={unstakeModalMaxAmount}
        reservedAmount={unstakeModalReservedAmount}
        value={unstakeValue}
        setValue={setUnstakeValue}
        library={library}
        unstakingTokenSymbol={unstakingTokenSymbol}
        rewardRouterAddress={rewardRouterAddress}
        unstakeMethodName={unstakeMethodName}
        multiplierPointsAmount={multiplierPointsAmount}
        bonusFmxInFeeFmx={bonusFmxInFeeFmx}
      />
      <VesterDepositModal
        isVisible={isVesterDepositModalVisible}
        setIsVisible={setIsVesterDepositModalVisible}
        chainId={chainId}
        title={vesterDepositTitle}
        stakeTokenLabel={vesterDepositStakeTokenLabel}
        maxAmount={vesterDepositMaxAmount}
        balance={vesterDepositBalance}
        escrowedBalance={vesterDepositEscrowedBalance}
        vestedAmount={vesterDepositVestedAmount}
        averageStakedAmount={vesterDepositAverageStakedAmount}
        maxVestableAmount={vesterDepositMaxVestableAmount}
        reserveAmount={vesterDepositReserveAmount}
        maxReserveAmount={vesterDepositMaxReserveAmount}
        value={vesterDepositValue}
        setValue={setVesterDepositValue}
        library={library}
        vesterAddress={vesterDepositAddress}
        setPendingTxns={setPendingTxns}
      />
      <VesterWithdrawModal
        isVisible={isVesterWithdrawModalVisible}
        setIsVisible={setIsVesterWithdrawModalVisible}
        vesterAddress={vesterWithdrawAddress}
        chainId={chainId}
        title={vesterWithdrawTitle}
        library={library}
        setPendingTxns={setPendingTxns}
      />
      <CompoundModal
        active={active}
        account={account}
        setPendingTxns={setPendingTxns}
        isVisible={isCompoundModalVisible}
        setIsVisible={setIsCompoundModalVisible}
        rewardRouterAddress={rewardRouterAddress}
        totalVesterRewards={processedData.totalVesterRewards}
        wrappedTokenSymbol={wrappedTokenSymbol}
        nativeTokenSymbol={nativeTokenSymbol}
        library={library}
        chainId={chainId}
      />
      <ClaimModal
        active={active}
        account={account}
        setPendingTxns={setPendingTxns}
        isVisible={isClaimModalVisible}
        setIsVisible={setIsClaimModalVisible}
        rewardRouterAddress={rewardRouterAddress}
        totalVesterRewards={processedData.totalVesterRewards}
        wrappedTokenSymbol={wrappedTokenSymbol}
        nativeTokenSymbol={nativeTokenSymbol}
        library={library}
        chainId={chainId}
      />
      <div className="section-title-block">
        <div className="section-title-icon"></div>
        <div className="section-title-content">
          <div className="Page-title">
            <Trans>Earn</Trans>
          </div>
          <div className="Page-description">
            <Trans>
              Stake <ExternalLink href="https://fmxio.gitbook.io/fmx/tokenomics">FMX</ExternalLink> and{" "}
              <ExternalLink href="https://fmxio.gitbook.io/fmx/glp">GLP</ExternalLink> to earn rewards.
            </Trans>
          </div>
          {earnMsg && <div className="Page-description">{earnMsg}</div>}
        </div>
      </div>
      <div className="StakeV2-content">
        <div className="StakeV2-cards">
          <div className="App-card StakeV2-fmx-card">
            <div className="App-card-title">FMX</div>
            <div className="App-card-divider"></div>
            <div className="App-card-content">
              <div className="App-card-row">
                <div className="label">
                  <Trans>Price</Trans>
                </div>
                <div>
                  {!fmxPrice && "..."}
                  {fmxPrice && (
                    <Tooltip
                      position="right-bottom"
                      className="nowrap"
                      handle={"$" + formatAmount(fmxPrice, USD_DECIMALS, 2, true)}
                      renderContent={() => (
                        <>
                          <StatsTooltipRow
                            label={t`Price on Avalanche`}
                            value={formatAmount(fmxPriceFromAvalanche, USD_DECIMALS, 2, true)}
                          />
                          <StatsTooltipRow
                            label={t`Price on Arbitrum`}
                            value={formatAmount(fmxPriceFromArbitrum, USD_DECIMALS, 2, true)}
                          />
                        </>
                      )}
                    />
                  )}
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Wallet</Trans>
                </div>
                <div>
                  {formatKeyAmount(processedData, "fmxBalance", 18, 2, true)} FMX ($
                  {formatKeyAmount(processedData, "fmxBalanceUsd", USD_DECIMALS, 2, true)})
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Staked</Trans>
                </div>
                <div>
                  {formatKeyAmount(processedData, "fmxInStakedFmx", 18, 2, true)} FMX ($
                  {formatKeyAmount(processedData, "fmxInStakedFmxUsd", USD_DECIMALS, 2, true)})
                </div>
              </div>
              <div className="App-card-divider"></div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>APR</Trans>
                </div>
                <div>
                  <Tooltip
                    handle={`${formatKeyAmount(processedData, "fmxAprTotalWithBoost", 2, 2, true)}%`}
                    position="right-bottom"
                    renderContent={() => (
                      <FMXAprTooltip processedData={processedData} nativeTokenSymbol={nativeTokenSymbol} />
                    )}
                  />
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Rewards</Trans>
                </div>
                <div>
                  <Tooltip
                    handle={`$${formatKeyAmount(processedData, "totalFmxRewardsUsd", USD_DECIMALS, 2, true)}`}
                    position="right-bottom"
                    renderContent={() => {
                      return (
                        <>
                          <StatsTooltipRow
                            label={`${nativeTokenSymbol} (${wrappedTokenSymbol})`}
                            value={`${formatKeyAmount(
                              processedData,
                              "feeFmxTrackerRewards",
                              18,
                              4
                            )} ($${formatKeyAmount(processedData, "feeFmxTrackerRewardsUsd", USD_DECIMALS, 2, true)})`}
                            showDollar={false}
                          />
                          <StatsTooltipRow
                            label="Escrowed FMX"
                            value={`${formatKeyAmount(
                              processedData,
                              "stakedFmxTrackerRewards",
                              18,
                              4
                            )} ($${formatKeyAmount(
                              processedData,
                              "stakedFmxTrackerRewardsUsd",
                              USD_DECIMALS,
                              2,
                              true
                            )})`}
                            showDollar={false}
                          />
                        </>
                      );
                    }}
                  />
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">{renderMultiplierPointsLabel()}</div>
                <div>{renderMultiplierPointsValue()}</div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Boost Percentage</Trans>
                </div>
                <div>
                  <Tooltip
                    handle={`${formatAmount(processedData.boostBasisPoints, 2, 2, false)}%`}
                    position="right-bottom"
                    renderContent={() => {
                      return (
                        <div>
                          <Trans>
                            You are earning {formatAmount(processedData.boostBasisPoints, 2, 2, false)}% more{" "}
                            {nativeTokenSymbol} rewards using{" "}
                            {formatAmount(processedData.bnFmxInFeeFmx, 18, 4, 2, true)} Staked Multiplier Points.
                          </Trans>
                          <br />
                          <br />
                          <Trans>Use the "Compound" button to stake your Multiplier Points.</Trans>
                        </div>
                      );
                    }}
                  />
                </div>
              </div>
              <div className="App-card-divider"></div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Total Staked</Trans>
                </div>
                <div>
                  {!totalFmxStaked && "..."}
                  {totalFmxStaked && (
                    <Tooltip
                      position="right-bottom"
                      className="nowrap"
                      handle={
                        formatAmount(totalFmxStaked, 18, 0, true) +
                        " FMX" +
                        ` ($${formatAmount(stakedFmxSupplyUsd, USD_DECIMALS, 0, true)})`
                      }
                      renderContent={() => (
                        <StatsTooltip
                          showDollar={false}
                          title={t`Staked`}
                          avaxValue={avaxFmxStaked}
                          arbitrumValue={arbitrumFmxStaked}
                          total={totalFmxStaked}
                          decimalsForConversion={18}
                          symbol="FMX"
                        />
                      )}
                    />
                  )}
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Total Supply</Trans>
                </div>
                {!totalFmxSupply && "..."}
                {totalFmxSupply && (
                  <div>
                    {formatAmount(totalFmxSupply, 18, 0, true)} FMX ($
                    {formatAmount(totalSupplyUsd, USD_DECIMALS, 0, true)})
                  </div>
                )}
              </div>
              <div className="App-card-divider" />
              <div className="App-card-options">
                <Link className="App-button-option App-card-option" to="/buy_fmx">
                  <Trans>Buy FMX</Trans>
                </Link>
                {active && (
                  <button className="App-button-option App-card-option" onClick={() => showStakeFmxModal()}>
                    <Trans>Stake</Trans>
                  </button>
                )}
                {active && (
                  <button className="App-button-option App-card-option" onClick={() => showUnstakeFmxModal()}>
                    <Trans>Unstake</Trans>
                  </button>
                )}
                {active && (
                  <Link className="App-button-option App-card-option" to="/begin_account_transfer">
                    <Trans>Transfer Account</Trans>
                  </Link>
                )}
              </div>
            </div>
          </div>
          <div className="App-card primary StakeV2-total-rewards-card">
            <div className="App-card-title">
              <Trans>Total Rewards</Trans>
            </div>
            <div className="App-card-divider"></div>
            <div className="App-card-content">
              <div className="App-card-row">
                <div className="label">
                  {nativeTokenSymbol} ({wrappedTokenSymbol})
                </div>
                <div>
                  {formatKeyAmount(processedData, "totalNativeTokenRewards", 18, 4, true)} ($
                  {formatKeyAmount(processedData, "totalNativeTokenRewardsUsd", USD_DECIMALS, 2, true)})
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">FMX</div>
                <div>
                  {formatKeyAmount(processedData, "totalVesterRewards", 18, 4, true)} ($
                  {formatKeyAmount(processedData, "totalVesterRewardsUsd", USD_DECIMALS, 2, true)})
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Escrowed FMX</Trans>
                </div>
                <div>
                  {formatKeyAmount(processedData, "totalEsFmxRewards", 18, 4, true)} ($
                  {formatKeyAmount(processedData, "totalEsFmxRewardsUsd", USD_DECIMALS, 2, true)})
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Multiplier Points</Trans>
                </div>
                <div>{formatKeyAmount(processedData, "bonusFmxTrackerRewards", 18, 4, true)}</div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Staked Multiplier Points</Trans>
                </div>
                <div>{formatKeyAmount(processedData, "bnFmxInFeeFmx", 18, 4, true)}</div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Total</Trans>
                </div>
                <div>${formatKeyAmount(processedData, "totalRewardsUsd", USD_DECIMALS, 2, true)}</div>
              </div>
              <div className="App-card-bottom-placeholder">
                <div className="App-card-divider"></div>
                <div className="App-card-options">
                  {active && (
                    <button className="App-button-option App-card-option">
                      <Trans>Compound</Trans>
                    </button>
                  )}
                  {active && (
                    <button className="App-button-option App-card-option">
                      <Trans>Claim</Trans>
                    </button>
                  )}
                  {!active && (
                    <button className="App-button-option App-card-option" onClick={() => connectWallet()}>
                      Connect Wallet
                    </button>
                  )}
                </div>
              </div>
              <div className="App-card-bottom">
                <div className="App-card-divider"></div>
                <div className="App-card-options">
                  {active && (
                    <button
                      className="App-button-option App-card-option"
                      onClick={() => setIsCompoundModalVisible(true)}
                    >
                      <Trans>Compound</Trans>
                    </button>
                  )}
                  {active && (
                    <button className="App-button-option App-card-option" onClick={() => setIsClaimModalVisible(true)}>
                      <Trans>Claim</Trans>
                    </button>
                  )}
                  {!active && (
                    <button className="App-button-option App-card-option" onClick={() => connectWallet()}>
                      <Trans>Connect Wallet</Trans>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="App-card">
            <div className="App-card-title">GLP ({chainName})</div>
            <div className="App-card-divider"></div>
            <div className="App-card-content">
              <div className="App-card-row">
                <div className="label">
                  <Trans>Price</Trans>
                </div>
                <div>${formatKeyAmount(processedData, "glpPrice", USD_DECIMALS, 3, true)}</div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Wallet</Trans>
                </div>
                <div>
                  {formatKeyAmount(processedData, "glpBalance", GLP_DECIMALS, 2, true)} GLP ($
                  {formatKeyAmount(processedData, "glpBalanceUsd", USD_DECIMALS, 2, true)})
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Staked</Trans>
                </div>
                <div>
                  {formatKeyAmount(processedData, "glpBalance", GLP_DECIMALS, 2, true)} GLP ($
                  {formatKeyAmount(processedData, "glpBalanceUsd", USD_DECIMALS, 2, true)})
                </div>
              </div>
              <div className="App-card-divider"></div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>APR</Trans>
                </div>
                <div>
                  <Tooltip
                    handle={`${formatKeyAmount(processedData, "glpAprTotal", 2, 2, true)}%`}
                    position="right-bottom"
                    renderContent={() => {
                      return (
                        <>
                          <StatsTooltipRow
                            label={`${nativeTokenSymbol} (${wrappedTokenSymbol}) APR`}
                            value={`${formatKeyAmount(processedData, "glpAprForNativeToken", 2, 2, true)}%`}
                            showDollar={false}
                          />
                          <StatsTooltipRow
                            label="Escrowed FMX APR"
                            value={`${formatKeyAmount(processedData, "glpAprForEsFmx", 2, 2, true)}%`}
                            showDollar={false}
                          />
                          <br />

                          <Trans>
                            APRs are updated weekly on Wednesday and will depend on the fees collected for the week.
                          </Trans>
                        </>
                      );
                    }}
                  />
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Rewards</Trans>
                </div>
                <div>
                  <Tooltip
                    handle={`$${formatKeyAmount(processedData, "totalGlpRewardsUsd", USD_DECIMALS, 2, true)}`}
                    position="right-bottom"
                    renderContent={() => {
                      return (
                        <>
                          <StatsTooltipRow
                            label={`${nativeTokenSymbol} (${wrappedTokenSymbol})`}
                            value={`${formatKeyAmount(
                              processedData,
                              "feeGlpTrackerRewards",
                              18,
                              4
                            )} ($${formatKeyAmount(processedData, "feeGlpTrackerRewardsUsd", USD_DECIMALS, 2, true)})`}
                            showDollar={false}
                          />
                          <StatsTooltipRow
                            label="Escrowed FMX"
                            value={`${formatKeyAmount(
                              processedData,
                              "stakedGlpTrackerRewards",
                              18,
                              4
                            )} ($${formatKeyAmount(
                              processedData,
                              "stakedGlpTrackerRewardsUsd",
                              USD_DECIMALS,
                              2,
                              true
                            )})`}
                            showDollar={false}
                          />
                        </>
                      );
                    }}
                  />
                </div>
              </div>
              <div className="App-card-divider"></div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Total Staked</Trans>
                </div>
                <div>
                  {formatKeyAmount(processedData, "glpSupply", 18, 2, true)} GLP ($
                  {formatKeyAmount(processedData, "glpSupplyUsd", USD_DECIMALS, 2, true)})
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Total Supply</Trans>
                </div>
                <div>
                  {formatKeyAmount(processedData, "glpSupply", 18, 2, true)} GLP ($
                  {formatKeyAmount(processedData, "glpSupplyUsd", USD_DECIMALS, 2, true)})
                </div>
              </div>
              <div className="App-card-divider"></div>
              <div className="App-card-options">
                <Link className="App-button-option App-card-option" to="/buy_glp">
                  <Trans>Buy GLP</Trans>
                </Link>
                <Link className="App-button-option App-card-option" to="/buy_glp#redeem">
                  <Trans>Sell GLP</Trans>
                </Link>
                {hasInsurance && (
                  <a
                    className="App-button-option App-card-option"
                    href="https://app.insurace.io/Insurance/Cart?id=124&referrer=545066382753150189457177837072918687520318754040"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Trans>Purchase Insurance</Trans>
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="App-card">
            <div className="App-card-title">
              <Trans>Escrowed FMX</Trans>
            </div>
            <div className="App-card-divider"></div>
            <div className="App-card-content">
              <div className="App-card-row">
                <div className="label">
                  <Trans>Price</Trans>
                </div>
                <div>${formatAmount(fmxPrice, USD_DECIMALS, 2, true)}</div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Wallet</Trans>
                </div>
                <div>
                  {formatKeyAmount(processedData, "esFmxBalance", 18, 2, true)} esFMX ($
                  {formatKeyAmount(processedData, "esFmxBalanceUsd", USD_DECIMALS, 2, true)})
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Staked</Trans>
                </div>
                <div>
                  {formatKeyAmount(processedData, "esFmxInStakedFmx", 18, 2, true)} esFMX ($
                  {formatKeyAmount(processedData, "esFmxInStakedFmxUsd", USD_DECIMALS, 2, true)})
                </div>
              </div>
              <div className="App-card-divider"></div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>APR</Trans>
                </div>
                <div>
                  <Tooltip
                    handle={`${formatKeyAmount(processedData, "fmxAprTotalWithBoost", 2, 2, true)}%`}
                    position="right-bottom"
                    renderContent={() => (
                      <FMXAprTooltip processedData={processedData} nativeTokenSymbol={nativeTokenSymbol} />
                    )}
                  />
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">{renderMultiplierPointsLabel()}</div>
                <div>{renderMultiplierPointsValue()}</div>
              </div>
              <div className="App-card-divider"></div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Total Staked</Trans>
                </div>
                <div>
                  {formatKeyAmount(processedData, "stakedEsFmxSupply", 18, 0, true)} esFMX ($
                  {formatKeyAmount(processedData, "stakedEsFmxSupplyUsd", USD_DECIMALS, 0, true)})
                </div>
              </div>
              <div className="App-card-row">
                <div className="label">
                  <Trans>Total Supply</Trans>
                </div>
                <div>
                  {formatAmount(esFmxSupply, 18, 0, true)} esFMX (${formatAmount(esFmxSupplyUsd, USD_DECIMALS, 0, true)}
                  )
                </div>
              </div>
              <div className="App-card-divider"></div>
              <div className="App-card-options">
                {active && (
                  <button className="App-button-option App-card-option" onClick={() => showStakeEsFmxModal()}>
                    <Trans>Stake</Trans>
                  </button>
                )}
                {active && (
                  <button className="App-button-option App-card-option" onClick={() => showUnstakeEsFmxModal()}>
                    <Trans>Unstake</Trans>
                  </button>
                )}
                {!active && (
                  <button className="App-button-option App-card-option" onClick={() => connectWallet()}>
                    <Trans> Connect Wallet</Trans>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="Tab-title-section">
          <div className="Page-title">
            <Trans>Vest</Trans>
          </div>
          <div className="Page-description">
            <Trans>
              Convert esFMX tokens to FMX tokens.
              <br />
              Please read the{" "}
              <ExternalLink href="https://fmxio.gitbook.io/fmx/rewards#vesting">vesting details</ExternalLink> before
              using the vaults.
            </Trans>
          </div>
        </div>
        <div>
          <div className="StakeV2-cards">
            <div className="App-card StakeV2-fmx-card">
              <div className="App-card-title">
                <Trans>FMX Vault</Trans>
              </div>
              <div className="App-card-divider"></div>
              <div className="App-card-content">
                <div className="App-card-row">
                  <div className="label">
                    <Trans>Staked Tokens</Trans>
                  </div>
                  <div>
                    <Tooltip
                      handle={formatAmount(totalRewardTokens, 18, 2, true)}
                      position="right-bottom"
                      renderContent={() => {
                        return (
                          <>
                            <StatsTooltipRow
                              showDollar={false}
                              label="FMX"
                              value={formatAmount(processedData.fmxInStakedFmx, 18, 2, true)}
                            />

                            <StatsTooltipRow
                              showDollar={false}
                              label="esFMX"
                              value={formatAmount(processedData.esFmxInStakedFmx, 18, 2, true)}
                            />
                            <StatsTooltipRow
                              showDollar={false}
                              label="Multiplier Points"
                              value={formatAmount(processedData.bnFmxInFeeFmx, 18, 2, true)}
                            />
                          </>
                        );
                      }}
                    />
                  </div>
                </div>
                <div className="App-card-row">
                  <div className="label">
                    <Trans>Reserved for Vesting</Trans>
                  </div>
                  <div>
                    {formatKeyAmount(vestingData, "fmxVesterPairAmount", 18, 2, true)} /{" "}
                    {formatAmount(totalRewardTokens, 18, 2, true)}
                  </div>
                </div>
                <div className="App-card-row">
                  <div className="label">
                    <Trans>Vesting Status</Trans>
                  </div>
                  <div>
                    <Tooltip
                      handle={`${formatKeyAmount(vestingData, "fmxVesterClaimSum", 18, 4, true)} / ${formatKeyAmount(
                        vestingData,
                        "fmxVesterVestedAmount",
                        18,
                        4,
                        true
                      )}`}
                      position="right-bottom"
                      renderContent={() => {
                        return (
                          <div>
                            <Trans>
                              {formatKeyAmount(vestingData, "fmxVesterClaimSum", 18, 4, true)} tokens have been
                              converted to FMX from the{" "}
                              {formatKeyAmount(vestingData, "fmxVesterVestedAmount", 18, 4, true)} esFMX deposited for
                              vesting.
                            </Trans>
                          </div>
                        );
                      }}
                    />
                  </div>
                </div>
                <div className="App-card-row">
                  <div className="label">
                    <Trans>Claimable</Trans>
                  </div>
                  <div>
                    <Tooltip
                      handle={`${formatKeyAmount(vestingData, "fmxVesterClaimable", 18, 4, true)} FMX`}
                      position="right-bottom"
                      renderContent={() => (
                        <Trans>
                          {formatKeyAmount(vestingData, "fmxVesterClaimable", 18, 4, true)} FMX tokens can be claimed,
                          use the options under the Total Rewards section to claim them.
                        </Trans>
                      )}
                    />
                  </div>
                </div>
                <div className="App-card-divider"></div>
                <div className="App-card-options">
                  {!active && (
                    <button className="App-button-option App-card-option" onClick={() => connectWallet()}>
                      <Trans>Connect Wallet</Trans>
                    </button>
                  )}
                  {active && (
                    <button className="App-button-option App-card-option" onClick={() => showFmxVesterDepositModal()}>
                      <Trans>Deposit</Trans>
                    </button>
                  )}
                  {active && (
                    <button className="App-button-option App-card-option" onClick={() => showFmxVesterWithdrawModal()}>
                      <Trans>Withdraw</Trans>
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="App-card StakeV2-fmx-card">
              <div className="App-card-title">
                <Trans>GLP Vault</Trans>
              </div>
              <div className="App-card-divider"></div>
              <div className="App-card-content">
                <div className="App-card-row">
                  <div className="label">
                    <Trans>Staked Tokens</Trans>
                  </div>
                  <div>{formatAmount(processedData.glpBalance, 18, 2, true)} GLP</div>
                </div>
                <div className="App-card-row">
                  <div className="label">
                    <Trans>Reserved for Vesting</Trans>
                  </div>
                  <div>
                    {formatKeyAmount(vestingData, "glpVesterPairAmount", 18, 2, true)} /{" "}
                    {formatAmount(processedData.glpBalance, 18, 2, true)}
                  </div>
                </div>
                <div className="App-card-row">
                  <div className="label">
                    <Trans>Vesting Status</Trans>
                  </div>
                  <div>
                    <Tooltip
                      handle={`${formatKeyAmount(vestingData, "glpVesterClaimSum", 18, 4, true)} / ${formatKeyAmount(
                        vestingData,
                        "glpVesterVestedAmount",
                        18,
                        4,
                        true
                      )}`}
                      position="right-bottom"
                      renderContent={() => {
                        return (
                          <div>
                            <Trans>
                              {formatKeyAmount(vestingData, "glpVesterClaimSum", 18, 4, true)} tokens have been
                              converted to FMX from the{" "}
                              {formatKeyAmount(vestingData, "glpVesterVestedAmount", 18, 4, true)} esFMX deposited for
                              vesting.
                            </Trans>
                          </div>
                        );
                      }}
                    />
                  </div>
                </div>
                <div className="App-card-row">
                  <div className="label">
                    <Trans>Claimable</Trans>
                  </div>
                  <div>
                    <Tooltip
                      handle={`${formatKeyAmount(vestingData, "glpVesterClaimable", 18, 4, true)} FMX`}
                      position="right-bottom"
                      renderContent={() => (
                        <Trans>
                          {formatKeyAmount(vestingData, "glpVesterClaimable", 18, 4, true)} FMX tokens can be claimed,
                          use the options under the Total Rewards section to claim them.
                        </Trans>
                      )}
                    />
                  </div>
                </div>
                <div className="App-card-divider"></div>
                <div className="App-card-options">
                  {!active && (
                    <button className="App-button-option App-card-option" onClick={() => connectWallet()}>
                      <Trans>Connect Wallet</Trans>
                    </button>
                  )}
                  {active && (
                    <button className="App-button-option App-card-option" onClick={() => showGlpVesterDepositModal()}>
                      <Trans>Deposit</Trans>
                    </button>
                  )}
                  {active && (
                    <button className="App-button-option App-card-option" onClick={() => showGlpVesterWithdrawModal()}>
                      <Trans>Withdraw</Trans>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
