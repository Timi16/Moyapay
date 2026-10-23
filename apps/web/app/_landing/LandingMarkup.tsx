// Generated from the MoyaPay design canvas (Main.dc.html) by a one-off converter, then wired up by hand.
import { REPO_URL } from "@/lib/config";
import { Faq } from "./Faq";

export function LandingMarkup() {
  return (
<div className="lp" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: "#12102A", background: "#FFFFFF", overflow: "hidden", WebkitFontSmoothing: "antialiased" }}>

<header className="wrap rise" style={{ position: "relative", zIndex: 5, paddingTop: "22px", paddingBottom: "22px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px 34px" }}>
<a href="/" aria-label="MoyaPay home" style={{ display: "flex", alignItems: "center", gap: "10px" }}><span style={{ width: "36px", height: "36px", borderRadius: "11px", background: "linear-gradient(135deg, #7C5CFF, #4527D9)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 16px -8px rgba(69, 39, 217, 0.8)" }}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 18C4.5 10 6 6 8 6c2 0 2.5 7 4 7s2-7 4-7 3.5 4 4 12" /></svg></span><span style={{ fontSize: "23px", fontWeight: "800", letterSpacing: "-0.05em", color: "#12102A" }}>moya<span style={{ color: "#5B3DF5" }}>pay</span></span></a>
<nav aria-label="Main" style={{ display: "flex", flexWrap: "wrap", gap: "28px", fontSize: "15px", fontWeight: "600", flexGrow: "1" }}>
<a href="#how" style={{ color: "#5B5876" }}>How it works</a><a href="#checks" style={{ color: "#5B5876" }}>Verification</a><a href="#recon" style={{ color: "#5B5876" }}>Reconciliation</a><a href="/dashboard/developers" style={{ color: "#5B5876" }}>Developers</a>
</nav>
<a href="/dashboard" className="btn" style={{ minHeight: "46px", padding: "0 18px", fontSize: "15px" }}>Open app</a>
</header>

<section style={{ position: "relative" }}>
<span aria-hidden="true" style={{ position: "absolute", right: "-180px", top: "-160px", width: "760px", height: "760px", borderRadius: "50%", background: "radial-gradient(closest-side, rgba(124, 92, 255, 0.28), rgba(124, 92, 255, 0))", animation: "lp-hue 14s ease-in-out infinite" }}></span>
<span aria-hidden="true" style={{ position: "absolute", left: "-220px", top: "280px", width: "520px", height: "520px", borderRadius: "50%", background: "radial-gradient(closest-side, rgba(18, 183, 106, 0.12), rgba(18, 183, 106, 0))", animation: "lp-hue 18s ease-in-out -6s infinite" }}></span>
<div className="wrap" style={{ position: "relative", paddingTop: "40px", paddingBottom: "80px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "48px" }}>
<div style={{ flex: "1 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "28px" }}>
<a href="/dashboard" className="rise" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "10px", height: "36px", padding: "0 6px 0 14px", borderRadius: "999px", background: "#FFFFFF", border: "1px solid #ECEAF5", boxShadow: "0 6px 16px -10px rgba(18, 16, 42, 0.25)", color: "#12102A", fontSize: "13px", fontWeight: "700" }}><span className="live"></span>Live on Stellar Testnet<span style={{ height: "26px", padding: "0 10px", borderRadius: "999px", background: "#EDE9FF", color: "#4527D9", display: "inline-flex", alignItems: "center" }}>See it →</span></a>
<h1 style={{ margin: "0", fontSize: "clamp(50px, 6.8vw, 92px)", lineHeight: "0.95", letterSpacing: "-0.065em", fontWeight: "800" }}><span className="w" style={{ animationDelay: ".1s" }}>Payments</span> <span className="w" style={{ animationDelay: ".2s" }}>that</span><br /><span className="w" style={{ animationDelay: ".3s", color: "#5B3DF5" }}>check</span> <span className="w" style={{ animationDelay: ".4s", color: "#5B3DF5" }}>themselves.</span></h1>
<p className="rise d4" style={{ margin: "0", maxWidth: "520px", fontSize: "20px", lineHeight: "1.6", fontWeight: "500", color: "#5B5876" }}>Send a pay link. Your customer pays in USDC from any Stellar wallet. MoyaPay confirms it on-chain, matches it to the right invoice and marks it settled, in about five seconds.</p>
<div className="rise d5" style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
<a href="/dashboard/requests/new" className="btn">Create your first pay link<svg className="ar" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg></a>
<a href="/pay/demo" className="btn alt"><svg width="16" height="16" viewBox="0 0 24 24" fill="#5B3DF5" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>Try the checkout</a>
</div>
<span className="rise d6" style={{ fontSize: "14px", fontWeight: "600", color: "#77748F" }}>No card. No node to run. No spreadsheet at the end of the month.</span>
</div>

<div className="rise d3" style={{ flex: "1 1 480px", minWidth: "0", display: "flex", justifyContent: "center" }}>
<div style={{ position: "relative", width: "100%", maxWidth: "560px", aspectRatio: "1 / 1" }}>
<div aria-hidden="true" style={{ position: "absolute", inset: "6% 0 0 8%", borderRadius: "40px", background: "radial-gradient(120% 120% at 100% 0%, #8B6CFF 0%, #5B3DF5 48%, #2E17A8 100%)", overflow: "hidden" }}>
<svg width="100%" height="100%" viewBox="0 0 500 500" preserveAspectRatio="none" fill="none" style={{ position: "absolute", inset: "0", opacity: ".22" }}><path d="M-20 420C40 180 110 110 170 110c90 0 100 220 170 220s80-220 170-220" stroke="#FFFFFF" strokeWidth="2" strokeDasharray="8 12" style={{ animation: "lp-flow 7s linear infinite" }} /><path d="M-20 480C40 240 110 170 170 170c90 0 100 220 170 220s80-220 170-220" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="2 10" style={{ animation: "lp-flow 9s linear infinite" }} /></svg>
</div>

<div style={{ position: "absolute", right: "0", top: "0", width: "72%", padding: "16px", borderRadius: "22px", background: "#FFFFFF", boxShadow: "0 40px 70px -30px rgba(15, 5, 70, 0.55)", display: "flex", flexDirection: "column", gap: "6px", animation: "lp-drift 7s ease-in-out infinite" }}>
<div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 4px 8px" }}><span style={{ flexGrow: "1", fontSize: "14px", fontWeight: "800" }}>Payment requests</span><span className="live"></span><span style={{ fontSize: "11px", fontWeight: "700", color: "#77748F" }}>Live</span></div>
<div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 8px", borderRadius: "12px", animation: "lp-rowGlow 8s infinite" }}><span className="mono" style={{ flexGrow: "1", fontSize: "12px", fontWeight: "600" }}>MP-7KQ2XF</span><span style={{ fontSize: "13px", fontWeight: "800" }}>50.00</span><span style={{ position: "relative", width: "74px", height: "24px" }}><span className="chip wait" style={{ position: "absolute", right: "0", animation: "lp-pendA 8s infinite" }}>Pending</span><span className="chip ok" style={{ position: "absolute", right: "0", animation: "lp-paidA 8s infinite" }}>Paid</span></span></div>
<div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 8px", borderTop: "1px solid #F1F0F7" }}><span className="mono" style={{ flexGrow: "1", fontSize: "12px", fontWeight: "600" }}>MP-H2M6WE</span><span style={{ fontSize: "13px", fontWeight: "800" }}>18.50</span><span style={{ width: "74px", display: "flex", justifyContent: "flex-end" }}><span className="chip ok">Paid</span></span></div>
<div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 8px", borderTop: "1px solid #F1F0F7" }}><span className="mono" style={{ flexGrow: "1", fontSize: "12px", fontWeight: "600" }}>MP-R4D8NC</span><span style={{ fontSize: "13px", fontWeight: "800" }}>45.00</span><span style={{ width: "74px", display: "flex", justifyContent: "flex-end" }}><span className="chip wait">Pending</span></span></div>
</div>

<div style={{ position: "absolute", left: "0", bottom: "0", width: "44%", aspectRatio: "9 / 17", padding: "8px", borderRadius: "34px", background: "#12102A", boxShadow: "0 40px 70px -24px rgba(15, 5, 70, 0.7)", animation: "lp-drift2 8s ease-in-out infinite" }}>
<div style={{ width: "100%", height: "100%", borderRadius: "27px", background: "#F6F5FB", overflow: "hidden", display: "flex", flexDirection: "column" }}>
<div style={{ padding: "16px 14px 34px", background: "radial-gradient(120% 140% at 100% 0%, #8B6CFF, #5B3DF5 50%, #3A1FC4)", color: "#FFFFFF", fontSize: "10px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 18C4.5 10 6 6 8 6c2 0 2.5 7 4 7s2-7 4-7 3.5 4 4 12" /></svg>Secured by moyapay</div>
<div style={{ margin: "-24px 10px 0", padding: "12px", borderRadius: "14px", background: "#FFFFFF", boxShadow: "0 10px 20px -12px rgba(20, 8, 90, 0.4)", display: "flex", flexDirection: "column", gap: "6px" }}><span style={{ fontSize: "10px", fontWeight: "700", color: "#77748F" }}>Bisi's Bakery</span><span style={{ fontSize: "24px", fontWeight: "800", letterSpacing: "-0.05em", lineHeight: "1" }}>50.00</span><span style={{ fontSize: "10px", fontWeight: "700", color: "#77748F" }}>USDC · MP-7KQ2XF</span></div>
<div style={{ marginTop: "auto", padding: "10px" }}><div style={{ position: "relative", height: "40px", borderRadius: "12px", background: "#5B3DF5", color: "#FFFFFF", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", animation: "lp-press 8s infinite" }}><span style={{ position: "absolute", animation: "lp-btnA 8s infinite" }}>Pay 50.00 USDC</span><span style={{ position: "absolute", display: "flex", alignItems: "center", gap: "6px", animation: "lp-btnB 8s infinite" }}><span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid rgba(255, 255, 255, 0.4)", borderTopColor: "#FFFFFF", animation: "lp-spin .8s linear infinite" }}></span>Sending</span></div></div>
</div>
</div>

<svg aria-hidden="true" width="100%" height="100%" viewBox="0 0 100 100" fill="none" style={{ position: "absolute", inset: "0", overflow: "visible", pointerEvents: "none" }}>
<path id="coinpath" d="M26 70 C 34 52, 44 62, 52 48 S 66 30, 74 24" stroke="#FFFFFF" strokeOpacity=".55" strokeWidth=".5" strokeDasharray="1.4 1.4" />
<g>
<circle r="3.2" fill="#FFFFFF" /><circle r="2.2" fill="#12B76A" />
<animateMotion dur="8s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;0.22;0.48;1" calcMode="linear"><mpath href="#coinpath"></mpath></animateMotion>
<animate attributeName="opacity" dur="8s" repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes="0;0.21;0.23;0.47;0.5;1"></animate>
</g>
</svg>

<div style={{ position: "absolute", right: "6%", top: "46%", padding: "10px 14px", borderRadius: "14px", background: "#12102A", color: "#FFFFFF", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 20px 30px -16px rgba(15, 5, 70, 0.7)", animation: "lp-toast 8s infinite" }}><span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#12B76A", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span><span style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: "13px", fontWeight: "800" }}>+50.00 USDC verified</span><span className="mono" style={{ fontSize: "10px", color: "#B9B6CC" }}>5 of 5 checks · 4.8s</span></span></div>
</div>
</div>
</div>
</section>

<section aria-label="Live payments" style={{ borderTop: "1px solid #ECEAF5", borderBottom: "1px solid #ECEAF5", background: "#FBFAFE", overflow: "hidden", padding: "18px 0" }}>
<div aria-hidden="true" style={{ display: "flex", gap: "14px", width: "max-content", animation: "lp-mq 36s linear infinite" }}>
<span className="tk"><span className="chip ok">Paid</span><span className="mono">MP-7KQ2XF</span>50.00 USDC<span style={{ color: "#77748F" }}>· 4.8s</span></span>
<span className="tk"><span className="chip wait">Wrong amount</span><span className="mono">MP-R4D8NC</span>40.00 of 45.00</span>
<span className="tk"><span className="chip ok">Paid</span><span className="mono">MP-H2M6WE</span>18.50 USDC<span style={{ color: "#77748F" }}>· 5.1s</span></span>
<span className="tk"><span className="chip bad">Already paid</span><span className="mono">MP-7KQ2XF</span>not counted</span>
<span className="tk"><span className="chip ok">Paid</span><span className="mono">MP-B3XK7P</span>35.00 USDC<span style={{ color: "#77748F" }}>· 4.6s</span></span>
<span className="tk"><span className="chip unk">Unmatched</span>12.00 USDC<span style={{ color: "#77748F" }}>· no reference</span></span>
<span className="tk"><span className="chip off">Expired</span><span className="mono">MP-Q9TT2B</span>no payment in 24 h</span>
<span className="tk"><span className="chip ok">Paid</span><span className="mono">MP-7KQ2XF</span>50.00 USDC<span style={{ color: "#77748F" }}>· 4.8s</span></span>
<span className="tk"><span className="chip wait">Wrong amount</span><span className="mono">MP-R4D8NC</span>40.00 of 45.00</span>
<span className="tk"><span className="chip ok">Paid</span><span className="mono">MP-H2M6WE</span>18.50 USDC<span style={{ color: "#77748F" }}>· 5.1s</span></span>
<span className="tk"><span className="chip bad">Already paid</span><span className="mono">MP-7KQ2XF</span>not counted</span>
<span className="tk"><span className="chip ok">Paid</span><span className="mono">MP-B3XK7P</span>35.00 USDC<span style={{ color: "#77748F" }}>· 4.6s</span></span>
<span className="tk"><span className="chip unk">Unmatched</span>12.00 USDC<span style={{ color: "#77748F" }}>· no reference</span></span>
<span className="tk"><span className="chip off">Expired</span><span className="mono">MP-Q9TT2B</span>no payment in 24 h</span>
</div>
</section>

<section id="how" style={{ padding: "110px 0" }}>
<div className="wrap" style={{ display: "flex", flexDirection: "column", gap: "52px" }}>
<div className="rv" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "24px" }}>
<div style={{ flex: "1 1 520px", display: "flex", flexDirection: "column", gap: "18px" }}><span className="kick">HOW IT WORKS</span><h2 className="h2">From "please pay" to "paid"<br />in three moves.</h2></div>
<p className="lead" style={{ flex: "1 1 320px", maxWidth: "420px" }}>You do the first. Your customer does the second. MoyaPay does the part you used to dread.</p>
</div>
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "22px" }}>

<article className="card lift rv" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
<div style={{ height: "230px", padding: "26px", background: "#FBFAFE", borderBottom: "1px solid #ECEAF5", display: "flex", flexDirection: "column", justifyContent: "center", gap: "12px" }}>
<span style={{ fontSize: "12px", fontWeight: "700", color: "#77748F" }}>Amount</span>
<div style={{ height: "56px", padding: "0 16px", borderRadius: "14px", background: "#FFFFFF", border: "2px solid #5B3DF5", boxShadow: "0 0 0 5px rgba(91, 61, 245, 0.12)", display: "flex", alignItems: "center", gap: "6px", fontSize: "26px", fontWeight: "800", letterSpacing: "-0.04em" }}><span style={{ animation: "lp-typeA 6s steps(5) infinite" }}>50.00</span><span style={{ width: "2px", height: "26px", background: "#5B3DF5", animation: "lp-blink 1s steps(1) infinite" }}></span><span style={{ marginLeft: "auto", fontSize: "13px", color: "#77748F" }}>USDC</span></div>
<div style={{ display: "flex", alignItems: "center", gap: "10px" }}><span className="mono" style={{ padding: "6px 10px", borderRadius: "9px", background: "#EDE9FF", color: "#4527D9", fontSize: "13px", fontWeight: "600" }}>MP-7KQ2XF</span><span style={{ fontSize: "13px", color: "#77748F" }}>your unique reference</span></div>
</div>
<div style={{ padding: "26px", display: "flex", flexDirection: "column", gap: "10px" }}><span className="mono" style={{ fontSize: "13px", fontWeight: "600", color: "#5B3DF5" }}>01 · YOU</span><h3 style={{ margin: "0", fontSize: "24px", fontWeight: "800", letterSpacing: "-0.035em" }}>Create a pay link</h3><p style={{ margin: "0", fontSize: "16px", lineHeight: "1.6", color: "#5B5876" }}>Amount, what it's for, when it expires. It gets a reference no other payment will ever share.</p></div>
</article>

<article className="card lift rv" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
<div style={{ height: "230px", position: "relative", background: "radial-gradient(120% 120% at 100% 0%, #8B6CFF, #5B3DF5 50%, #2E17A8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
<div style={{ width: "190px", padding: "14px", borderRadius: "20px", background: "#FFFFFF", boxShadow: "0 24px 40px -20px rgba(10, 4, 60, 0.7)", display: "flex", flexDirection: "column", gap: "10px", animation: "lp-drift 6s ease-in-out infinite" }}>
<span style={{ fontSize: "11px", fontWeight: "700", color: "#77748F" }}>Approve in Freighter</span>
<span style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "-0.04em" }}>50.00 USDC</span>
<span className="mono" style={{ fontSize: "10px", color: "#77748F" }}>to GCX4…7QPA · memo MP-7KQ2XF</span>
<div style={{ height: "36px", borderRadius: "10px", background: "#5B3DF5", color: "#FFFFFF", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", animation: "lp-press 6s infinite" }}>Approve</div>
</div>
</div>
<div style={{ padding: "26px", display: "flex", flexDirection: "column", gap: "10px" }}><span className="mono" style={{ fontSize: "13px", fontWeight: "600", color: "#5B3DF5" }}>02 · YOUR CUSTOMER</span><h3 style={{ margin: "0", fontSize: "24px", fontWeight: "800", letterSpacing: "-0.035em" }}>They tap and approve</h3><p style={{ margin: "0", fontSize: "16px", lineHeight: "1.6", color: "#5B5876" }}>In their own wallet, with their own keys. No address to copy, no memo to forget.</p></div>
</article>

<article className="card lift rv" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
<div style={{ height: "230px", padding: "26px", background: "#FBFAFE", borderBottom: "1px solid #ECEAF5", display: "flex", flexDirection: "column", justifyContent: "center", gap: "12px" }}>
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span className="mono" style={{ fontSize: "13px", fontWeight: "600" }}>MP-7KQ2XF</span><span style={{ position: "relative", width: "74px", height: "26px" }}><span className="chip wait" style={{ position: "absolute", right: "0", animation: "lp-pendA 8s infinite" }}>Pending</span><span className="chip ok" style={{ position: "absolute", right: "0", animation: "lp-paidA 8s infinite" }}>Paid</span></span></div>
<div style={{ height: "8px", borderRadius: "999px", background: "#ECEAF5", overflow: "hidden" }}><div style={{ height: "100%", borderRadius: "999px", background: "linear-gradient(90deg, #7C5CFF, #12B76A)", transformOrigin: "left", animation: "lp-fill 8s cubic-bezier(.4,0,.2,1) infinite" }}></div></div>
<span className="mono" style={{ fontSize: "12px", color: "#77748F" }}>tx 6962…1688 · saved to your records</span>
</div>
<div style={{ padding: "26px", display: "flex", flexDirection: "column", gap: "10px" }}><span className="mono" style={{ fontSize: "13px", fontWeight: "600", color: "#5B3DF5" }}>03 · MOYAPAY</span><h3 style={{ margin: "0", fontSize: "24px", fontWeight: "800", letterSpacing: "-0.035em" }}>It turns Paid by itself</h3><p style={{ margin: "0", fontSize: "16px", lineHeight: "1.6", color: "#5B5876" }}>We see it land, check it, match it and keep the receipt. You just get the good news.</p></div>
</article>
</div>
</div>
</section>

<section id="checks" style={{ padding: "100px 0", background: "#F6F5FB" }}>
<div className="wrap" style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
<div className="rv" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "18px", maxWidth: "820px", margin: "0 auto" }}>
<span className="kick">VERIFICATION</span>
<h2 className="h2">Five checks. Every payment.</h2>
<p className="lead" style={{ maxWidth: "600px" }}>A payment only counts when it clears all five, and each transaction is counted once, by its hash. Miss a check and it's flagged with the reason, never quietly marked Paid.</p>
</div>
<div className="card rv" style={{ position: "relative", padding: "56px 40px 40px", overflow: "hidden" }}>
<div aria-hidden="true" style={{ position: "relative", height: "6px", margin: "0 6%", borderRadius: "999px", background: "#F1F0F7" }}>
<div style={{ position: "absolute", inset: "0", borderRadius: "999px", background: "linear-gradient(90deg, #7C5CFF, #5B3DF5, #12B76A)", transformOrigin: "left", animation: "lp-fill 8s linear infinite" }}></div>
<span style={{ position: "absolute", top: "-13px", width: "32px", height: "32px", marginLeft: "-16px", borderRadius: "50%", background: "#FFFFFF", border: "3px solid #5B3DF5", boxShadow: "0 8px 18px -6px rgba(91, 61, 245, 0.7)", animation: "lp-tok 8s linear infinite" }}></span>
</div>
<div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "12px", marginTop: "36px" }}>
<div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px" }}><span style={{ width: "56px", height: "56px", borderRadius: "18px", border: "2px solid #E4E2EE", display: "flex", alignItems: "center", justifyContent: "center", animation: "lp-g1 8s linear infinite" }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h13v4" /><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z" /></svg></span><span style={{ fontSize: "16px", fontWeight: "800" }}>Right wallet</span><span style={{ fontSize: "14px", color: "#77748F" }}>It landed in yours</span></div>
<div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px" }}><span style={{ width: "56px", height: "56px", borderRadius: "18px", border: "2px solid #E4E2EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: "800", animation: "lp-g2 8s linear infinite" }}>$</span><span style={{ fontSize: "16px", fontWeight: "800" }}>Right coin</span><span style={{ fontSize: "14px", color: "#77748F" }}>Real USDC, right issuer</span></div>
<div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px" }}><span style={{ width: "56px", height: "56px", borderRadius: "18px", border: "2px solid #E4E2EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: "800", animation: "lp-g3 8s linear infinite" }}>50.00</span><span style={{ fontSize: "16px", fontWeight: "800" }}>Exact amount</span><span style={{ fontSize: "14px", color: "#77748F" }}>To 7 decimals</span></div>
<div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px" }}><span style={{ width: "56px", height: "56px", borderRadius: "18px", border: "2px solid #E4E2EE", display: "flex", alignItems: "center", justifyContent: "center", animation: "lp-g4 8s linear infinite" }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></svg></span><span style={{ fontSize: "16px", fontWeight: "800" }}>Right reference</span><span style={{ fontSize: "14px", color: "#77748F" }}>Matches the request</span></div>
<div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px" }}><span style={{ width: "56px", height: "56px", borderRadius: "18px", border: "2px solid #E4E2EE", display: "flex", alignItems: "center", justifyContent: "center", animation: "lp-g5 8s linear infinite" }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span><span style={{ fontSize: "16px", fontWeight: "800" }}>It went through</span><span style={{ fontSize: "14px", color: "#77748F" }}>Successful on Stellar</span></div>
</div>
<div style={{ display: "flex", justifyContent: "center", marginTop: "34px", height: "52px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "10px", height: "52px", padding: "0 22px", borderRadius: "999px", background: "#12B76A", color: "#FFFFFF", fontSize: "17px", fontWeight: "800", boxShadow: "0 16px 30px -14px rgba(18, 183, 106, 0.8)", animation: "lp-win 8s linear infinite" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Marked Paid · hash saved</span></div>
</div>
</div>
</section>

<section id="recon" style={{ padding: "100px 0", background: "#12102A", color: "#FFFFFF", position: "relative", overflow: "hidden" }}>
<span aria-hidden="true" style={{ position: "absolute", right: "-200px", top: "-200px", width: "620px", height: "620px", borderRadius: "50%", background: "radial-gradient(closest-side, rgba(124, 92, 255, 0.45), rgba(124, 92, 255, 0))", animation: "lp-hue 16s ease-in-out infinite" }}></span>
<div className="wrap" style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: "56px", alignItems: "center" }}>
<div className="rv" style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
<span className="kick" style={{ color: "#A996FF" }}>RECONCILIATION</span>
<h2 className="h2">When it goes wrong,<br />you know why.</h2>
<p className="lead" style={{ color: "#B9B6CC" }}>Short by a cent, wrong coin, paid twice, no reference, too late. Every payment that reaches your wallet gets a line in your books and a plain-English reason, so you can assign it, refund it or let it go.</p>
<a href="/dashboard/reconciliation" className="btn" style={{ alignSelf: "flex-start", marginTop: "4px", background: "#FFFFFF", color: "#4527D9" }}>See reconciliation</a>
</div>
<div className="rv" style={{ flex: "1.3 1 520px", minWidth: "0", borderRadius: "26px", background: "#1C1940", border: "1px solid rgba(255, 255, 255, 0.08)", overflow: "hidden", boxShadow: "0 50px 90px -40px rgba(0, 0, 0, 0.8)" }}>
<div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "18px 22px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}><span style={{ flexGrow: "1", fontSize: "15px", fontWeight: "800" }}>Incoming payments</span><span className="live"></span><span style={{ fontSize: "13px", color: "#B9B6CC" }}>ledger 1,284,519</span></div>
<div style={{ padding: "8px 10px 14px", display: "flex", flexDirection: "column" }}>
<div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 12px", animation: "lp-rowin 9s infinite" }}><span className="mono" style={{ width: "92px", fontSize: "13px", color: "#CFC3FF" }}>MP-7KQ2XF</span><span style={{ flexGrow: "1", fontSize: "15px", fontWeight: "700" }}>50.00 USDC</span><span className="chip ok">Matched</span><span style={{ width: "120px", textAlign: "right", fontSize: "13px", color: "#B9B6CC" }}>Marked Paid</span></div>
<div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 12px", animation: "lp-rowin 9s .5s infinite" }}><span className="mono" style={{ width: "92px", fontSize: "13px", color: "#CFC3FF" }}>MP-R4D8NC</span><span style={{ flexGrow: "1", fontSize: "15px", fontWeight: "700" }}>40.00 USDC</span><span className="chip wait">Wrong amount</span><span style={{ width: "120px", textAlign: "right", fontSize: "13px", color: "#B9B6CC" }}>Expected 45.00</span></div>
<div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 12px", animation: "lp-rowin 9s 1s infinite" }}><span className="mono" style={{ width: "92px", fontSize: "13px", color: "#CFC3FF" }}>MP-7KQ2XF</span><span style={{ flexGrow: "1", fontSize: "15px", fontWeight: "700" }}>50.00 USDC</span><span className="chip bad">Already paid</span><span style={{ width: "120px", textAlign: "right", fontSize: "13px", color: "#B9B6CC" }}>Not counted</span></div>
<div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 12px", animation: "lp-rowin 9s 1.5s infinite" }}><span className="mono" style={{ width: "92px", fontSize: "13px", color: "#CFC3FF" }}>MP-PX29LA</span><span style={{ flexGrow: "1", fontSize: "15px", fontWeight: "700" }}>20.00 XLM</span><span className="chip bad">Wrong asset</span><span style={{ width: "120px", textAlign: "right", fontSize: "13px", color: "#B9B6CC" }}>Wanted USDC</span></div>
<div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 12px", animation: "lp-rowin 9s 2s infinite" }}><span className="mono" style={{ width: "92px", fontSize: "13px", color: "#CFC3FF" }}>no memo</span><span style={{ flexGrow: "1", fontSize: "15px", fontWeight: "700" }}>12.00 USDC</span><span className="chip unk">Unmatched</span><span style={{ width: "120px", textAlign: "right", fontSize: "13px", color: "#B9B6CC" }}>No reference</span></div>
</div>
</div>
</div>
</section>

<section id="faq" style={{ padding: "100px 0" }}>
<div className="wrap" style={{ display: "flex", flexWrap: "wrap", gap: "56px" }}>
<div className="rv" style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "18px" }}><span className="kick">FAQ</span><h2 className="h2">Before you ask.</h2></div>
<div style={{ flex: "2 1 560px", minWidth: "0" }}>
<Faq />
</div>
</div>
</section>

<section style={{ padding: "0 0 32px" }}>
<div className="wrap">
<div className="rv" style={{ position: "relative", overflow: "hidden", borderRadius: "40px", padding: "84px 40px", background: "radial-gradient(120% 160% at 50% 0%, #8B6CFF 0%, #5B3DF5 45%, #2E17A8 100%)", color: "#FFFFFF", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "22px" }}>
<svg aria-hidden="true" width="1200" height="400" viewBox="0 0 1200 400" fill="none" style={{ position: "absolute", left: "50%", marginLeft: "-600px", bottom: "-60px", opacity: "0.3" }}><path d="M0 340C120 90 240 60 330 60c140 0 160 230 270 230S760 60 870 60s240 130 330 280" stroke="#FFFFFF" strokeWidth="2" strokeDasharray="8 12" style={{ animation: "lp-flow 8s linear infinite" }} /></svg>
<span aria-hidden="true" style={{ position: "relative", width: "76px", height: "76px", borderRadius: "24px", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 24px 40px -16px rgba(10, 4, 60, 0.7)", animation: "lp-drift 6s ease-in-out infinite" }}><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#5B3DF5" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18C4.5 10 6 6 8 6c2 0 2.5 7 4 7s2-7 4-7 3.5 4 4 12" /></svg></span>
<h2 className="h2" style={{ position: "relative", maxWidth: "720px" }}>Your next payment could reconcile itself.</h2>
<p style={{ position: "relative", margin: "0", maxWidth: "460px", fontSize: "18px", lineHeight: "1.55", color: "#E4DDFF" }}>Free on Stellar Testnet. Your first pay link takes about a minute.</p>
<a href="/dashboard/requests/new" className="btn" style={{ position: "relative", background: "#FFFFFF", color: "#4527D9" }}>Create your first pay link<svg className="ar" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg></a>
</div>
</div>
</section>

<footer className="wrap" style={{ paddingTop: "28px", paddingBottom: "40px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px", fontSize: "14px", fontWeight: "600", color: "#77748F" }}>
<span style={{ display: "flex", alignItems: "center", gap: "10px" }}><span style={{ width: "26px", height: "26px", borderRadius: "8px", background: "linear-gradient(135deg, #7C5CFF, #4527D9)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 18C4.5 10 6 6 8 6c2 0 2.5 7 4 7s2-7 4-7 3.5 4 4 12" /></svg></span>© 2026 MoyaPay · Stellar Testnet only</span>
<nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", gap: "22px" }}><a href="/dashboard/developers" style={{ color: "#5B5876" }}>API docs</a><a href={REPO_URL || "#"} style={{ color: "#5B5876" }}>GitHub</a><a href={REPO_URL ? `${REPO_URL}/blob/main/docs/TESTING.md` : "#"} style={{ color: "#5B5876" }}>Testing report</a><a href={REPO_URL ? `${REPO_URL}/issues` : "#"} style={{ color: "#5B5876" }}>Contact</a></nav>
</footer>
</div>
  );
}
