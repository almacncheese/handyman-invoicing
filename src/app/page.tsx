import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BrandLogo } from '@/components/BrandLogo';
import { getSession } from '@/lib/session';

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect('/dashboard');

  return (
    <main className="min-h-dvh bg-[var(--canvas)] text-[var(--ink)]">
      {/* Dark top chrome — can't read as unstyled white page */}
      <header className="bg-[var(--graphite)] text-white">
        <div className="mkt-nav">
          <BrandLogo href="/" inverted size={30} />
          <div className="flex items-center gap-2">
            <Link
              href="/pricing"
              className="btn btn-ghost !hidden !text-white/80 hover:!bg-white/10 sm:!inline-flex"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="btn btn-secondary !border-white/25 !bg-transparent !text-white hover:!bg-white/10"
            >
              Sign in
            </Link>
            <Link href="/signup" className="btn btn-primary">
              Start trial
            </Link>
          </div>
        </div>

        <section className="mkt-hero !pt-6 !pb-16">
          <div>
            <span className="mkt-kicker !bg-[rgba(62,207,154,0.15)] !text-[#3ecf9a]">
              Field estimating software
            </span>
            <h1 className="mkt-h1 !text-white">
              Estimates that look
              <br />
              as solid as the work.
            </h1>
            <p className="mkt-lead !text-white/70">
              Build line items with material margins and labor rates, send a branded link for
              e-signature, then convert accepted work into invoices — from the truck or the shop.
            </p>
            <div className="mkt-actions">
              <Link href="/signup" className="btn btn-primary !px-6 !text-base">
                Create workspace
              </Link>
              <Link
                href="/pricing"
                className="btn btn-secondary !border-white/30 !bg-transparent !text-white hover:!bg-white/10"
              >
                See pricing
              </Link>
            </div>
            <p className="mkt-trust !text-white/45">
              14-day free trial · Then $29/mo · Demo: demo@quickhandyquote.com
            </p>
          </div>

          <div className="product-frame" aria-hidden>
            <div className="product-frame-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="product-frame-body">
              <div className="product-frame-inner">
                <div className="product-frame-side hidden min-[480px]:block">
                  <div className="active">Estimates</div>
                  <div className="item">Invoices</div>
                  <div className="item">Customers</div>
                  <div className="item">Price list</div>
                </div>
                <div className="product-frame-main">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
                        Pipeline
                      </div>
                      <div className="font-mono text-xl font-semibold tracking-tight text-[var(--ink)]">
                        $12,480
                      </div>
                    </div>
                    <span className="badge badge-accepted">Accepted</span>
                  </div>
                  <div className="ledger !shadow-none">
                    <div className="ledger-row !grid-cols-[1fr_auto] sm:!grid-cols-[5.5rem_1fr_auto]">
                      <span className="ledger-num hidden sm:inline">EST-412</span>
                      <div>
                        <div className="ledger-title">Back deck repair</div>
                        <div className="ledger-meta">Martinez · materials + labor</div>
                      </div>
                      <span className="ledger-amount">$746.93</span>
                    </div>
                    <div className="ledger-row !grid-cols-[1fr_auto] sm:!grid-cols-[5.5rem_1fr_auto]">
                      <span className="ledger-num hidden sm:inline">EST-409</span>
                      <div>
                        <div className="ledger-title">Kitchen faucet + shutoffs</div>
                        <div className="ledger-meta">Nguyen · sent yesterday</div>
                      </div>
                      <span className="ledger-amount">$285.00</span>
                    </div>
                    <div className="ledger-row !grid-cols-[1fr_auto] sm:!grid-cols-[5.5rem_1fr_auto]">
                      <span className="ledger-num hidden sm:inline">EST-401</span>
                      <div>
                        <div className="ledger-title">Basement egress window</div>
                        <div className="ledger-meta">Cole · draft</div>
                      </div>
                      <span className="ledger-amount">$2,140.00</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </header>

      <section className="mkt-section bg-white">
        <p className="mkt-section-label">How it works</p>
        <h2>From job walk to signed total</h2>
        <div className="flow-strip">
          <div className="flow-step">
            <div className="flow-num">01 · Quote</div>
            <h3>Price with real margins</h3>
            <p>
              Enter supplier cost and markup. Labor is hours × rate. Totals calculate on the
              server — no spreadsheet drift.
            </p>
          </div>
          <div className="flow-step">
            <div className="flow-num">02 · Sign</div>
            <h3>Customer e-signature</h3>
            <p>
              Send one link. They review line items and photos on their phone, then sign on the
              spot.
            </p>
          </div>
          <div className="flow-step">
            <div className="flow-num">03 · Invoice</div>
            <h3>Convert and collect</h3>
            <p>
              Accepted estimates become invoices. Record cash, check, or Zelle when payment lands.
            </p>
          </div>
        </div>
      </section>

      <section className="mkt-cta-band">
        <div className="inner">
          <div>
            <h2>Ready when your next walkthrough is.</h2>
            <p>14-day free trial. Then Pro at $29/mo — no free forever plan.</p>
          </div>
          <Link href="/signup" className="btn btn-primary !px-6">
            Start free trial
          </Link>
        </div>
      </section>

      <footer className="mkt-footer">
        <BrandLogo href="/" size={24} />
        <div className="flex gap-5 font-medium">
          <Link href="/pricing">Pricing</Link>
          <Link href="/login">Sign in</Link>
        </div>
      </footer>
    </main>
  );
}
