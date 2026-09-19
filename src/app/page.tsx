"use client";

import dynamic from "next/dynamic";
import { BRAND } from "@/lib/brand";

// The app is a hash-routed single page that reads localStorage and the
// wallet; it only ever renders in the browser.
const App = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => <div className="boot">{BRAND.name} / LOADING</div>,
});

export default function Page() {
  return <App />;
}
