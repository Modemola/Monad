"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";

import { anvil, monadTestnet } from "@/lib/chains";
import { deploymentFor } from "@/lib/addresses";
import { shortAddress } from "@/lib/format";

const BASE = "gloss relative px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.18em] transition-colors duration-300";

/// The wallets this browser can connect with, in the order a visitor should see them.
///
/// Extension wallets that announce themselves (EIP-6963) each get their own entry, by name and
/// icon. The generic `window.ethereum` connector is offered only when nothing announced itself —
/// otherwise it would duplicate one of them, usually under whichever name won the race to
/// `window.ethereum` (which is how every wallet ended up looking like MetaMask).
function useWalletOptions() {
  const { connectors } = useConnect();
  const [hasProvider, setHasProvider] = useState(false);
  useEffect(() => setHasProvider(typeof window !== "undefined" && "ethereum" in window && Boolean(window.ethereum)), []);

  const seen = new Set<string>();
  const announced = connectors.filter((c) => {
    if (c.type !== "injected" || c.id === "injected" || seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
  const generic = connectors.find((c) => c.id === "injected");
  const browser = announced.length > 0 ? announced : generic && hasProvider ? [generic] : [];
  const walletConnect = connectors.find((c) => c.type === "walletConnect");
  return { browser, walletConnect };
}

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, isPending, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const { browser, walletConnect } = useWalletOptions();
  const [open, setOpen] = useState(false);

  const supported = chainId === monadTestnet.id || chainId === anvil.id;
  const deployed = deploymentFor(chainId) !== undefined;

  useEffect(() => {
    if (isConnected) setOpen(false);
  }, [isConnected]);

  const choose = (connector: Connector) => {
    reset();
    connect({ connector });
  };

  if (!isConnected) {
    // One browser wallet and nothing else to offer: connect straight away, no picker.
    const direct = browser.length === 1 && !walletConnect ? browser[0] : undefined;
    return (
      <>
        <button
          type="button"
          disabled={isPending}
          onClick={() => (direct ? choose(direct) : (reset(), setOpen(true)))}
          className={`${BASE} border border-gold bg-gold text-[#140e05] hover:bg-gold-soft disabled:opacity-40`}
        >
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>
        <WalletPicker
          open={open}
          onClose={() => setOpen(false)}
          browser={browser}
          walletConnect={walletConnect}
          onChoose={choose}
          pending={isPending}
          error={error?.message}
        />
      </>
    );
  }

  if (!supported || !deployed) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: monadTestnet.id })}
        className={`${BASE} border border-critical/60 text-critical hover:bg-critical/10`}
      >
        Switch to Monad
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => disconnect()}
      title="Disconnect"
      className={`${BASE} tnum flex items-center gap-2 border border-hairline text-ink-secondary hover:border-gold/50 hover:text-ink`}
    >
      <span className="h-1.5 w-1.5 bg-good shadow-[0_0_10px_rgba(127,209,166,0.9)]" />
      {address ? shortAddress(address) : ""}
    </button>
  );
}

/// Wallet apps whose built-in browser can open this page directly — the way in on a phone, where
/// there is no extension to find.
function appLinks(url: string) {
  const bare = url.replace(/^https?:\/\//, "");
  const encoded = encodeURIComponent(url);
  return [
    { name: "MetaMask", href: `https://metamask.app.link/dapp/${bare}` },
    { name: "Phantom", href: `https://phantom.app/ul/browse/${encoded}?ref=${encodeURIComponent(new URL(url).origin)}` },
    { name: "Coinbase Wallet", href: `https://go.cb-w.com/dapp?cb_url=${encoded}` },
    { name: "OKX Wallet", href: `okx://wallet/dapp/url?dappUrl=${encoded}` },
    { name: "Trust Wallet", href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encoded}` },
  ];
}

function WalletPicker({
  open,
  onClose,
  browser,
  walletConnect,
  onChoose,
  pending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  browser: Connector[];
  walletConnect: Connector | undefined;
  onChoose: (connector: Connector) => void;
  pending: boolean;
  error: string | undefined;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // The header blurs its backdrop, which makes it the containing block for anything fixed inside
  // it; the picker is portalled to the body so it covers the page, not the header.
  if (!mounted) return null;
  const here = typeof window === "undefined" ? "" : window.location.href;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-picker-title"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            onClick={(event) => event.stopPropagation()}
            className="relative w-full max-w-sm border border-hairline bg-coal p-5 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="eyebrow">Monad testnet</div>
                <h2 id="wallet-picker-title" className="mt-2 font-display text-[22px] font-light text-ink">
                  Connect a wallet
                </h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-ink-muted transition-colors hover:text-ink">
                ×
              </button>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-secondary">
              Any EVM wallet works. If it does not know Monad testnet yet, it will ask to add it.
            </p>

            <ul className="mt-4 space-y-2">
              {browser.map((connector) => (
                <li key={connector.uid}>
                  <WalletRow
                    name={connector.id === "injected" ? "Browser wallet" : connector.name}
                    detail={connector.id === "injected" ? "The wallet in this browser" : "Detected in this browser"}
                    icon={connector.icon}
                    disabled={pending}
                    onClick={() => onChoose(connector)}
                  />
                </li>
              ))}
              {walletConnect && (
                <li>
                  <WalletRow
                    name="WalletConnect"
                    detail="Scan with a mobile wallet"
                    disabled={pending}
                    onClick={() => onChoose(walletConnect)}
                  />
                </li>
              )}
            </ul>

            {browser.length === 0 && (
              <div className="mt-5 border-t border-hairline pt-4">
                <div className="label">No browser wallet found</div>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-secondary">
                  On a phone, open this page inside your wallet app&apos;s browser:
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {appLinks(here).map((link) => (
                    <a
                      key={link.name}
                      href={link.href}
                      className="border border-hairline px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-secondary transition-colors hover:border-gold/50 hover:text-ink"
                    >
                      {link.name}
                    </a>
                  ))}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
                  On a computer, install any EVM wallet extension —{" "}
                  <a href="https://ethereum.org/en/wallets/find-wallet/" target="_blank" rel="noreferrer" className="text-gold/80 hover:text-gold">
                    find one here
                  </a>{" "}
                  — and reload.
                </p>
              </div>
            )}

            {error && <p className="mt-3 break-words text-[12px] text-critical">{error.split("\n")[0]}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function WalletRow({
  name,
  detail,
  icon,
  disabled,
  onClick,
}: {
  name: string;
  detail: string;
  icon?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 border border-hairline bg-void/40 px-3.5 py-3 text-left transition-colors hover:border-gold/50 disabled:opacity-50"
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs from the wallet itself
        <img src={icon} alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
      ) : (
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center border border-gold/40 font-mono text-[11px] text-gold">
          {name.charAt(0)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[13.5px] text-ink">{name}</span>
        <span className="block text-[11.5px] text-ink-muted">{detail}</span>
      </span>
    </button>
  );
}
