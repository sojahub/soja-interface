import { Trans } from "@lingui/macro";
import StatsTooltipRow from "components/StatsTooltip/StatsTooltipRow";
import { BigNumber } from "ethers";
import { formatKeyAmount } from "lib/numbers";

type Props = {
  processedData: {
    fmxAprForEsFmx: BigNumber;
    fmxAprForNativeToken: BigNumber;
    fmxAprForNativeTokenWithBoost: BigNumber;
    fmxBoostAprForNativeToken?: BigNumber;
  };
  nativeTokenSymbol: string;
};

export default function FMXAprTooltip({ processedData, nativeTokenSymbol }: Props) {
  return (
    <>
      <StatsTooltipRow
        label="Escrowed FMX APR"
        showDollar={false}
        value={`${formatKeyAmount(processedData, "fmxAprForEsFmx", 2, 2, true)}%`}
      />
      {(!processedData.fmxBoostAprForNativeToken || processedData.fmxBoostAprForNativeToken.eq(0)) && (
        <StatsTooltipRow
          label={`${nativeTokenSymbol} APR`}
          showDollar={false}
          value={`${formatKeyAmount(processedData, "fmxAprForNativeToken", 2, 2, true)}%`}
        />
      )}
      {processedData.fmxBoostAprForNativeToken && processedData.fmxBoostAprForNativeToken.gt(0) && (
        <div>
          <br />

          <StatsTooltipRow
            label={`${nativeTokenSymbol} Base APR`}
            showDollar={false}
            value={`${formatKeyAmount(processedData, "fmxAprForNativeToken", 2, 2, true)}%`}
          />
          <StatsTooltipRow
            label={`${nativeTokenSymbol} Boosted APR`}
            showDollar={false}
            value={`${formatKeyAmount(processedData, "fmxBoostAprForNativeToken", 2, 2, true)}%`}
          />
          <div className="Tooltip-divider" />
          <StatsTooltipRow
            label={`${nativeTokenSymbol} Total APR`}
            showDollar={false}
            value={`${formatKeyAmount(processedData, "fmxAprForNativeTokenWithBoost", 2, 2, true)}%`}
          />

          <br />

          <Trans>The Boosted APR is from your staked Multiplier Points.</Trans>
        </div>
      )}
      <div>
        <br />
        <Trans>APRs are updated weekly on Wednesday and will depend on the fees collected for the week.</Trans>
      </div>
    </>
  );
}
