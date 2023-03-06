import { t } from "@lingui/macro";
import "./Footer.css";
import twitterIcon from "img/ic_twitter.svg";
import discordIcon from "img/ic_discord.svg";
import telegramIcon from "img/ic_telegram.svg";
import githubIcon from "img/ic_github.svg";
import mediumIcon from "img/ic_medium.svg";

type Link = {
  text: string;
  link: string;
  external?: boolean;
  isAppLink?: boolean;
};

type SocialLink = {
  link: string;
  name: string;
  icon: string;
};

export const FOOTER_LINKS: { home: Link[]; app: Link[] } = {
  home: [
    { text: t`Terms and Conditions`, link: "/terms-and-conditions" },
    { text: t`Referral Terms`, link: "/referral-terms" },
    { text: t`Media Kit`, link: "https://fmxio.gitbook.io/fmx/media-kit", external: true },
    // { text: "Jobs", link: "/jobs", isAppLink: true },
  ],
  app: [
    { text: t`Media Kit`, link: "https://fmxio.gitbook.io/fmx/media-kit", external: true },
    // { text: "Jobs", link: "/jobs" },
  ],
};

export const SOCIAL_LINKS: SocialLink[] = [
  { link: "https://twitter.com/FMX_IO", name: "Twitter", icon: twitterIcon },
  { link: "https://medium.com/@fmx.io", name: "Medium", icon: mediumIcon },
  { link: "https://github.com/fmx-io", name: "Github", icon: githubIcon },
  { link: "https://t.me/FMX_IO", name: "Telegram", icon: telegramIcon },
  { link: "https://discord.gg/cxjZYR4gQK", name: "Discord", icon: discordIcon },
];
