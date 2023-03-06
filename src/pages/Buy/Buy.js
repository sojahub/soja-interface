import React from "react";
import { Trans } from "@lingui/macro";
import Footer from "components/Footer/Footer";
import "./Buy.css";
import TokenCard from "components/TokenCard/TokenCard";
import buyFMXIcon from "img/buy_fmx.svg";
import SEO from "components/Common/SEO";
import { getPageTitle } from "lib/legacy";

export default function BuyFMXGLP() {
  return (
    <SEO title={getPageTitle("Buy GLP or FMX")}>
      <div className="BuyFMXGLP page-layout">
        <div className="BuyFMXGLP-container default-container">
          <div className="section-title-block">
            <div className="section-title-icon">
              <img src={buyFMXIcon} alt="buyFMXIcon" />
            </div>
            <div className="section-title-content">
              <div className="Page-title">
                <Trans>Buy FMX or GLP</Trans>
              </div>
            </div>
          </div>
          <TokenCard />
        </div>
        <Footer />
      </div>
    </SEO>
  );
}
