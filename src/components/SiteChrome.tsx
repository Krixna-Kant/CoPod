import Image from "next/image";
import Link from "next/link";

export function Logo({ small }: { small?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-3 focus:outline-none">
      <Image
        src="/logo.png"
        alt="CoPod"
        width={96}
        height={96}
        priority
        className={`${small ? "h-9 w-9" : "h-12 w-12"} scale-125 object-contain transition-transform duration-200 group-hover:scale-[1.35]`}
      />
      {!small && (
        <div className="flex flex-col">
          <span className="text-xl font-extrabold tracking-tight text-slate-900 transition-colors group-hover:text-copod-600">
            CoPod
          </span>
          <span className="hidden text-[11px] font-medium tracking-tight text-slate-500 sm:inline">Fractional Compute Escrow</span>
        </div>
      )}
    </Link>
  );
}

const links = [
  { href: "/#how-it-works", label: "How it Works" },
  { href: "/#pools", label: "Compute Pools" },
  { href: "/#escrow", label: "Autonomous Escrow" },
  { href: "/pools/new", label: "Host a Pool" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  return (
    <header className="glass-nav sticky top-0 z-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        <Logo />
        <nav className="hidden items-center gap-1 text-sm font-semibold text-slate-600 md:flex lg:gap-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3.5 py-2 transition-all hover:bg-slate-100/70 hover:text-copod-600">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/60 px-3 py-1.5 font-mono text-xs text-slate-600 xl:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <span>PayPal Sandbox</span>
          </div>
          <Link
            href="/rooms/room_gptoss120b"
            className="shimmer-btn inline-flex items-center justify-center rounded-xl bg-copod-600 px-4 py-2.5 text-sm font-semibold text-white shadow-blue-glow transition-all duration-200 hover:bg-copod-700 active:scale-95"
          >
            Launch App
            <svg className="ml-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-slate-200/80 bg-white pb-8 pt-12 text-sm text-slate-600">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 border-b border-slate-100 pb-8 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <Logo small />
            <div>
              <div className="font-bold text-slate-900">CoPod</div>
              <div className="text-xs text-slate-400">Autonomous escrow for shared dedicated AI compute</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-6 text-xs font-medium text-slate-600">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="transition-colors hover:text-copod-600">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <span>Built on PayPal Orders &amp; Payments v2</span>
          </div>
        </div>
        <div className="mt-8 flex flex-col items-center justify-between gap-4 text-xs text-slate-400 sm:flex-row">
          <p>CoPod - built for the PayPal AI Hackathon. Sandbox only; no real funds move.</p>
          <p className="font-mono">PayPal Orders v2 / Payments v2 - Google Gemini - AG Grid</p>
        </div>
      </div>
    </footer>
  );
}
