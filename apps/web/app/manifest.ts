import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MoyaPay",
    short_name: "MoyaPay",
    description: "USDC payment requests on Stellar Testnet, verified on-chain.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F6F5FB",
    theme_color: "#5B3DF5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
