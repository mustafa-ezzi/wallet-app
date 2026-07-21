import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

app.innerHTML = `
  <div class="layout-shell">
    <aside class="sidebar desktop-only">
      <div class="brand">
        <div class="brand__logo">WM</div>
        <div>
          <p class="brand__title">Wallet Manager</p>
          <p class="brand__subtitle">Personal Finance Command Center</p>
        </div>
      </div>
      <nav class="sidebar__nav">
        <button class="nav-item nav-item--active">Dashboard</button>
        <button class="nav-item">Projects</button>
        <button class="nav-item">Accounts</button>
        <button class="nav-item">Reports</button>
      </nav>
      <div class="sidebar__insight">
        <p class="muted-label">This month</p>
        <p class="insight-amount positive">+ PKR 7,000</p>
        <p class="insight-note">Forecasted net savings</p>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div>
          <p class="muted-label">Welcome back</p>
          <h1>Financial Overview</h1>
        </div>
        <button class="primary-cta">+ Add Transaction</button>
      </header>

      <section class="hero-card">
        <div>
          <p class="muted-label">Total Balance</p>
          <h2>PKR 243,600</h2>
          <p class="hero-card__sub">Across bank accounts and cash in hand</p>
        </div>
        <div class="forecast-chip">
          <span>Expected Income</span>
          <strong>PKR 38,000</strong>
        </div>
        <div class="forecast-chip danger">
          <span>Expected Outgoing</span>
          <strong>PKR 31,000</strong>
        </div>
      </section>

      <section class="content-grid">
        <article class="panel">
          <div class="panel__header">
            <h3>Accounts</h3>
            <button class="text-btn">View all</button>
          </div>
          <ul class="list">
            <li><span>Meezan Bank</span><strong>PKR 124,000</strong></li>
            <li><span>NayaPay</span><strong>PKR 39,400</strong></li>
            <li><span>SadaPay</span><strong>PKR 22,600</strong></li>
            <li><span>Cash in Hand</span><strong>PKR 57,600</strong></li>
          </ul>
        </article>

        <article class="panel">
          <div class="panel__header">
            <h3>Projects</h3>
            <button class="text-btn">Manage</button>
          </div>
          <ul class="list">
            <li><span>Contract Project</span><em>PKR 25,000 / month</em></li>
            <li><span>ERP Maintenance</span><em>PKR 8,000 / month</em></li>
            <li><span>Sooicy</span><em>PKR 5,000 installment</em></li>
          </ul>
        </article>

        <article class="panel panel--wide">
          <div class="panel__header">
            <h3>Recent Transactions</h3>
            <button class="text-btn">See history</button>
          </div>
          <ul class="transaction-list">
            <li><span>Income • Contract Project</span><strong class="positive">+ PKR 25,000</strong></li>
            <li><span>Expense • Utilities</span><strong class="negative">- PKR 10,000</strong></li>
            <li><span>Expense • Server Charges</span><strong class="negative">- PKR 1,000</strong></li>
            <li><span>Expense • Engagement Loan</span><strong class="negative">- PKR 10,000</strong></li>
          </ul>
        </article>
      </section>
    </main>

    <button class="floating-add mobile-only" aria-label="Add income or expense">+</button>
    <nav class="mobile-nav mobile-only">
      <button class="mobile-nav__item mobile-nav__item--active">Dashboard</button>
      <button class="mobile-nav__item">Projects</button>
      <button class="mobile-nav__item">Accounts</button>
      <button class="mobile-nav__item">Reports</button>
    </nav>
  </div>
`;
