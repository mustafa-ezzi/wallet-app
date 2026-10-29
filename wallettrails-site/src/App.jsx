import { useEffect, useState } from 'react'
import { ConsentBanner, track } from './analytics'
import './screenshots.css'
import './reference-sections.css'
import './brand.css'
import './trai.css'

const icons = {
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  play: <path d="m9 7 7 5-7 5V7Z" fill="currentColor" stroke="none" />,
  wallet: <><path d="M4 7.5h15a1 1 0 0 1 1 1V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h11" /><path d="M16 13h.01" /></>,
  chart: <><path d="M4 19V5M4 19h16" /><path d="m7 15 4-5 3 2 5-7" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  lock: <><rect width="14" height="11" x="5" y="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  cloud: <path d="M17.5 19H9a7 7 0 1 1 6.71-9.01A5 5 0 1 1 17.5 19Z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  sms: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8M8 13h5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  briefcase: <><rect width="18" height="13" x="3" y="7" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11h14V9M10 20v-6h4v6" /></>,
  badge: <><rect width="16" height="18" x="4" y="3" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M8 17c.8-1.8 2.2-2.7 4-2.7s3.2.9 4 2.7" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" /><path d="M4 19a2 2 0 0 1 2-2h13M9 7h6" /></>,
  plane: <><path d="M10.5 13.5 3 11l1.5-1.5 8 1 4-4a2.1 2.1 0 0 1 3 3l-4 4 1 8L15 23l-2.5-7.5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
}
const Icon = ({ name, size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>
const Reveal = ({ children, className = '' }) => <div className={`reveal ${className}`}>{children}</div>
const Logo = ({ inverse = false }) => <a className={`logo ${inverse ? 'logo--inverse' : ''}`} href="#home"><img src="/media/wallettrail-logo.png" alt="WalletTrails" /><span>Wallet<span>Trails</span></span></a>

const productFeatures = [
  ['wallet', 'All your wallets', 'Bring bank accounts and cash wallets into one simple total.', 'blue'],
  ['sms', 'Bank SMS auto-detect', 'Opt in on Android so bank alerts become a draft. You Approve, Reject, or edit — nothing posts silently.', 'purple'],
  ['chart', 'Monthly reports & forecast', 'Compare expected and actual money, then understand spending by category.', 'purple'],
  ['bell', 'Bill & installment reminders', 'Track monthly costs, loans, and money owed to you before a due date sneaks up.', 'orange'],
  ['users', 'Household sharing', 'Create a private family ledger, invite people, and see shared costs together.', 'green'],
  ['lock', 'Privacy lock', 'Hide amounts in public, then reveal them with your device biometrics or PIN.', 'gold'],
  ['cloud', 'Works offline', 'Add personal income, expenses, and transfers without data; they sync when you are back.', 'coral'],
  ['chart', 'Income that fits your work', 'Record salary, recurring work, one-time jobs, advances, and payments received in parts.', 'blue'],
  ['wallet', 'Transfers without double counting', 'Move money between your own wallets while keeping your overall total correct.', 'purple'],
  ['users', 'Fair split suggestions', 'For shared trips and events, see contributions, who paid, and who owes whom.', 'green'],
  ['bell', 'Local & push notifications', 'Choose reminder lead times for bills; privacy mode keeps exact amounts out of alerts.', 'orange'],
  ['cloud', 'Exports when you need them', 'Share personal and household reports as CSV, with PDF reporting available on web.', 'coral'],
]

function PhonePreview() {
  return <div className="phone phone--real-screenshot" aria-label="WalletTrails reports screen preview"><div className="notch" /><img src="/media/screenshots/report.png" alt="WalletTrails reports screen" /></div>
}

const NAV_LINKS = [
  ['features', 'Features'],
  ['use-cases', 'Use cases'],
  ['trai', 'Trai'],
  ['screenshots', 'Screenshots'],
  ['how', 'How it works'],
  ['faqs', 'FAQs'],
  ['support', 'Support'],
]

function Header({ menu, setMenu, active, setActive }) {
  return (
    <header className="site-header">
      <Logo />
      <button className="hamburger" onClick={() => setMenu(!menu)} aria-label="Open navigation" aria-expanded={menu}><i /><i /><i /></button>
      <nav className={menu ? 'site-nav open' : 'site-nav'} aria-label="Page sections">
        {NAV_LINKS.map(([id, label]) => (
          <a
            href={`#${id}`}
            key={id}
            className={active === id ? 'active' : undefined}
            aria-current={active === id ? 'location' : undefined}
            onClick={() => {
              setActive(id)
              setMenu(false)
            }}
          >
            {label}
          </a>
        ))}
      </nav>
      <a className="button compact" href="#download">Get the app <Icon name="arrow" size={16} /></a>
    </header>
  )
}

function ProductDepth() {
  const blocks = [
    ['01 · EARN & PLAN', 'Know what is coming in.', 'Add a salary, a monthly client, a one-time payment, or a job paid in parts. Record an advance and keep the remaining amount in view.', ['Recurring and one-time income', 'Payment-in-parts tracking', 'Received, paused, and complete states'], 'income'],
    ['02 · STAY AHEAD', 'Give due dates a calm place to live.', 'Monthly costs, loan installments, and money people owe you are all visible in one bills space—so your monthly forecast is not a surprise.', ['Due-soon cues and scheduled reminders', 'Payables, receivables, and recurring costs', 'Privacy-safe notification wording'], 'bills'],
    ['03 · SHARE FAIRLY', 'Keep shared money separate—and clear.', 'Personal wallets stay yours. A Household gives family, roommates, or trip groups a shared expense book with member reports and equal-split suggestions.', ['Invite by secure code or shareable link', 'Ongoing home and closeable event ledgers', 'Contributions, settlement suggestions, and reports'], 'family'],
    ['04 · AUTO DETECT', 'Bank SMS in. Draft ready. You approve.', 'On Android, WalletTrails can optionally notice a bank transaction message, match the wallet, and queue a draft. ATM cash-outs become a bank-to-cash move—not a spend. You stay in the loop.', ['Permission first — no SMS access until you opt in', 'Parses amount, type, and bank from Pakistani alerts', 'Approve, Reject, or edit. Never silent posting'], 'sms'],
  ]
  return <section className="product-depth"><div className="shell"><Reveal className="heading center"><span className="eyebrow">Built around real money life</span><h2>One app for the details<br />that keep life <em>moving.</em></h2><p>WalletTrails is designed around real Pakistan-first routines—from salary day and a client payment to a family grocery run, a trip with friends, or a bank SMS you tap Approve on.</p></Reveal><div className="depth-grid">{blocks.map(([tag, title, body, points, tone]) => <Reveal className={`depth-card depth-card--${tone}`} key={tag}><small>{tag}</small><h3>{title}</h3><p>{body}</p><ul>{points.map((point) => <li key={point}>{point}</li>)}</ul></Reveal>)}</div><Reveal className="privacy-promise"><span className="ficon gold"><Icon name="lock" size={22} /></span><div><small>OUR PRIVACY PROMISE</small><h3>Your personal wallets stay personal.</h3><p>People in a Household can see only the shared ledger—not each other’s bank wallets, income, loans, or unrelated transactions. Your values can also be hidden on-screen when you need privacy.</p></div><a href="/privacy.html">Read privacy policy <Icon name="arrow" size={16} /></a></Reveal></div></section>
}

const traiFeatures = [
  ['Talks it through', 'Say “add an expense of Rp 250.” Trai asks which bank. You answer “from Meezan.” It keeps the whole sentence and then asks if it should save.'],
  ['Saves only when you say so', '“Yes, save it” writes the entry. “Stop” only turns the microphone off. “No” throws the card away. A second yes does not write a second row.'],
  ['Answers without guessing', '“What was my recent transaction?”, “What’s my balance?”, and “How was my month?” are answers, not new expenses. Trai does not ask you for an amount just to look something up.'],
  ['Bills, wallets, and people', 'Mark a bill paid, move money between your wallets, lend or borrow with someone you already track, or add a wallet. Each one waits for Save.'],
  ['Budgets and travel', '“Am I over food?” reads this month and does not save. “Set food to 8000” and “Turn on travel mode in dirhams” show a card first. The trip uses the rate the app already has. Trai does not invent a rate.'],
  ['Stays in its lane', 'It will not sign you out, take a PIN, change a password, email a report, or touch a shared household ledger. Hide the amounts and the PIN sheet stay on your phone.'],
]

const traiNotes = [
  ['On the phone.', 'Say “Hey Trai” while the app is open. The lock screen does not wake it.'],
  ['In the browser.', 'Tap the mic once, then keep talking. There is no always-on wake word.'],
  ['Your books only.', 'Another person’s wallets, budgets, and reports are refused.'],
  ['Pakistan first.', 'Rupees, Meezan, cash, and the month you are in. “50 thousand” means 50000.'],
]

function TraiSection() {
  return <section className="trai-band" id="trai">
    <div className="shell trai-layout">
      <div className="trai-copy">
        <span className="eyebrow">MEET TRAI</span>
        <h2>Say it once.<br /><em>Trai writes it down.</em></h2>
        <p className="trai-identity">Transaction Record Account Intelligence. A bookkeeper inside WalletTrails—not a general chatbot, and it doesn’t browse the web.</p>
        <p className="trai-lead">Tell Trai an expense, a bill, or a question about this month. It asks when something is missing, shows you the card, and saves only after you say yes.</p>
        <div className="trai-actions">
          <a className="button" href="#download">Get the app <Icon name="arrow" size={16} /></a>
          <a className="trai-textlink" href="#trai-phone">See it listen</a>
        </div>
        <div className="trai-grid">
          {traiFeatures.map(([title, copy]) => <article className="trai-card" key={title}><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
        <div className="trai-strip">
          {traiNotes.map(([title, copy]) => <article key={title}><b>{title}</b><span>{copy}</span></article>)}
        </div>
      </div>
      <div className="trai-phone-column">
        <div className="trai-phone-wrap" id="trai-phone">
          <div className="trai-phone" aria-label="A sample conversation with Trai">
            <div className="trai-listen"><i className="trai-dot" aria-hidden="true" /><span>Listening</span><span className="trai-stop">Stop</span></div>
            <div className="trai-turn trai-turn--you"><div className="trai-bubble">Hey Trai, add an expense of Rp 250</div></div>
            <div className="trai-turn trai-turn--bot"><i className="trai-orb" aria-hidden="true" /><div className="trai-message-group"><div className="trai-bubble"><small>Trai</small>Which wallet should I use?</div></div></div>
            <div className="trai-turn trai-turn--you"><div className="trai-bubble">From Meezan bank</div></div>
            <div className="trai-turn trai-turn--bot"><i className="trai-orb" aria-hidden="true" /><div className="trai-message-group"><div className="trai-bubble"><small>Trai</small>Rs 250 from Meezan, Food &amp; Drink. Save it?</div></div></div>
            <div className="trai-turn trai-turn--you"><div className="trai-bubble">Yes, save it</div></div>
            <div className="trai-turn trai-turn--bot"><i className="trai-orb" aria-hidden="true" /><div className="trai-message-group"><div className="trai-bubble"><small>Trai</small>Saved. Meezan is updated.</div>
              <div className="trai-confirm"><b>Rs 250</b><p>Meezan<br />Food &amp; Drink</p><div className="trai-confirm-actions"><span className="save">Save</span><span className="change">Change</span></div></div>
            </div></div>
          </div>
        </div>
        <p className="trai-privacy-note">Voice stays on your phone. The recording is not uploaded. The model key stays on the server.</p>
      </div>
    </div>
  </section>
}

const screenshots = [
  ['/media/screenshots/dashboard.png', 'Home', 'Cash and bank wallets in one total'],
  ['/media/screenshots/incomes.png', 'Income', 'Salary, clients, and payments'],
  ['/media/screenshots/bills.png', 'Bills', 'Monthly costs, loans, and due dates'],
  ['/media/screenshots/report.png', 'Reports', 'Your month, explained in one place'],
  ['/media/screenshots/budgets.png', 'Budgets', 'Category limits for the month'],
  ['/media/screenshots/travel_mode.png', 'Travel', 'Another currency when you are away'],
]
function ScreenshotGallery() {
  return <section className="screenshots" id="screenshots"><div className="shell"><Reveal className="heading center"><span className="eyebrow">The real app</span><h2>Designed for the moments<br />when you need <em>clarity.</em></h2><p>Explore WalletTrails across home, income, bills, reports, budgets, and travel.</p></Reveal><div className="screenshot-grid">{screenshots.map(([src, title, description], index) => <Reveal className={`screenshot-card screenshot-card--${index + 1}`} key={src}><a href={`#screen-${index + 1}`}><div className="screenshot-frame"><img src={src} alt={`WalletTrails ${title} screen`} loading="lazy" /></div><div className="screenshot-caption"><span><small>WALLETTRAILS APP</small><b>{title}</b><p>{description}</p></span><i aria-hidden="true">↗</i></div></a></Reveal>)}</div><p className="screenshots-note">Tap a screen to view it in full detail.</p></div>{screenshots.map(([src, title], index) => <div className="screenshot-lightbox" id={`screen-${index + 1}`} key={`screen-${index + 1}`}><a className="lightbox-close" href="#screenshots" aria-label="Close screenshot preview">×</a><a className="lightbox-backdrop" href="#screenshots" aria-label="Close screenshot preview" /><div><img src={src} alt={`WalletTrails ${title} screen`} /><p>{title} <span>WalletTrails for Android</span></p></div></div>)}</section>
}

const personas = [
  {
    id: 'freelancers',
    icon: 'briefcase',
    label: 'Freelancers',
    title: 'Client money, finally in one place.',
    body: 'Retainers, one-off projects, advances, and jobs paid in parts each get their own income source. You see what has landed, what is still owed, and what the month will look like before you take the next job.',
    month: [
      ['Retainer', 'A monthly client is set as recurring income, so the forecast already expects it.'],
      ['Project', 'A website job paid in three parts shows the advance received and the amount remaining.'],
      ['Tools', 'Hosting, domains, and design tools live as monthly bills with due-date reminders.'],
    ],
    features: ['Income sources', 'Money owed to you', 'Monthly forecast', 'Bank SMS drafts'],
    shot: '/media/screenshots/incomes.png',
    note: ['Client B website', 'Rs 8,000 remaining'],
  },
  {
    id: 'creators',
    icon: 'camera',
    label: 'Influencers & creators',
    title: 'Brand deals, payouts, and gear, without the guesswork.',
    body: 'Creator income comes in bursts: a brand deal with an advance, a platform payout, a sponsored trip. WalletTrails keeps each one visible, along with the subscriptions and equipment that keep the channel running.',
    month: [
      ['Brand deal', 'Add the full fee as a one-time income, record the advance, and keep the balance in view.'],
      ['Subscriptions', 'Editing apps, music libraries, and cloud storage are monthly bills, so renewals are not a surprise.'],
      ['Gear', 'A camera bought on installments is a payable, so the remaining payments show in the forecast.'],
    ],
    features: ['One-time income with advances', 'Installment payables', 'Credit card wallets', 'Privacy lock'],
    shot: '/media/screenshots/bills.png',
    note: ['Hide amounts on camera', 'Privacy lock'],
  },
  {
    id: 'home',
    icon: 'home',
    label: 'Home managers',
    title: 'Run the house budget, and share it fairly.',
    body: 'Groceries, school fees, electricity, and the maid’s salary all go through one person’s hands. WalletTrails gives the household its own shared ledger, while each member’s personal wallets stay private.',
    month: [
      ['Budgets', 'Set a monthly limit for groceries and see how much is left before the next shop.'],
      ['Bills', 'Electricity, gas, internet, and school fees remind you three days, one day, or on the due date.'],
      ['Household', 'Family members add shared costs, put money into the pot, and see who has paid what.'],
    ],
    features: ['Household ledger', 'Category budgets', 'Bill reminders', 'Settle-up suggestions'],
    shot: '/media/screenshots/budgets.png',
    note: ['Groceries this month', 'On track'],
  },
  {
    id: 'salaried',
    icon: 'badge',
    label: 'Salaried professionals',
    title: 'From payday to payday, with fewer surprises.',
    body: 'Your salary lands in one account, the credit card bill arrives in another, and a car or phone installment sits in between. WalletTrails puts them in one total and tells you what the rest of the month looks like.',
    month: [
      ['Payday', 'Salary is recurring income, so expected and actual money line up in your report.'],
      ['Card', 'A credit card wallet tracks what you owe, your limit, and the statement and due days.'],
      ['Bank alerts', 'On Android, a bank SMS can become a draft. You approve it instead of retyping it.'],
    ],
    features: ['Recurring salary', 'Credit card wallets', 'Bank SMS drafts', 'Trai voice entries'],
    shot: '/media/screenshots/dashboard.png',
    note: ['What you have', 'Across all wallets'],
  },
  {
    id: 'students',
    icon: 'book',
    label: 'Students',
    title: 'Make pocket money and part-time pay last the month.',
    body: 'An allowance, some tuition income, and cash for the canteen add up quickly. WalletTrails keeps it simple: a few wallets, a budget for food and transport, and a record of who owes whom.',
    month: [
      ['Allowance', 'Monthly pocket money is recurring income. Tutoring or gig pay is one-time income.'],
      ['Budgets', 'Food, transport, and outings each get a limit, so you see the month before it runs out.'],
      ['Friends', 'Lend or borrow with a friend and WalletTrails keeps the balance between you.'],
    ],
    features: ['Cash and mobile wallets', 'Category budgets', 'Lend and borrow', 'Works offline'],
    shot: '/media/screenshots/report.png',
    note: ['Your month', 'Expected vs actual'],
  },
  {
    id: 'travelers',
    icon: 'plane',
    label: 'Travelers & groups',
    title: 'Spend in dirhams. Keep your books in rupees.',
    body: 'Travel Mode lets you enter amounts in the local currency while your wallets stay in PKR. For a group trip, an event ledger shows contributions, who paid for what, and how to settle up at the end.',
    month: [
      ['Travel Mode', 'Turn it on for AED, use the live rate or the one the exchange booth gave you, and log spending as usual.'],
      ['Group trip', 'Create a closeable event ledger, invite friends with a code, and add shared costs as you go.'],
      ['Settle up', 'When the trip ends, WalletTrails suggests who should pay whom so the group is even.'],
    ],
    features: ['Travel Mode', 'Event ledgers', 'Equal-split suggestions', 'Works offline'],
    shot: '/media/screenshots/travel_mode.png',
    note: ['1 AED = 75.62 PKR', 'Live rate'],
  },
]

function UseCases() {
  const [activeId, setActiveId] = useState(personas[0].id)
  const index = personas.findIndex((persona) => persona.id === activeId)
  const persona = personas[index]

  const onKeyDown = (event) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = personas[(index + step + personas.length) % personas.length]
    choose(next.id)
    document.getElementById(`uc-tab-${next.id}`)?.focus()
  }

  const choose = (id) => {
    setActiveId(id)
    track('use_case_tab', { persona: id })
  }

  return (
    <section className="uc" id="use-cases">
      <div className="shell">
        <Reveal className="heading center">
          <span className="eyebrow">Use cases</span>
          <h2>Built for the way<br /><em>you</em> handle money.</h2>
          <p>Everyone’s month looks different. Pick the one closest to yours and see how WalletTrails fits in.</p>
        </Reveal>
        <Reveal className="uc-tabs">
          <div role="tablist" aria-label="Who uses WalletTrails" onKeyDown={onKeyDown}>
            {personas.map((item) => (
              <button
                type="button"
                role="tab"
                key={item.id}
                id={`uc-tab-${item.id}`}
                aria-selected={item.id === activeId}
                aria-controls="uc-panel"
                tabIndex={item.id === activeId ? 0 : -1}
                className={item.id === activeId ? 'is-active' : undefined}
                onClick={() => choose(item.id)}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </Reveal>
        <Reveal>
          <div className="uc-panel" id="uc-panel" role="tabpanel" aria-labelledby={`uc-tab-${persona.id}`} key={persona.id}>
            <div className="uc-copy">
              <small>For {persona.label.toLowerCase()}</small>
              <h3>{persona.title}</h3>
              <p>{persona.body}</p>
              <ol className="uc-month">
                {persona.month.map(([step, copy]) => (
                  <li key={step}><b>{step}</b><span>{copy}</span></li>
                ))}
              </ol>
              <div className="uc-features" aria-label="Features you will use">
                {persona.features.map((feature) => <span key={feature}><Icon name="check" size={14} />{feature}</span>)}
              </div>
              <a className="button" href="#download">Get WalletTrails <Icon name="arrow" size={16} /></a>
            </div>
            <div className="uc-visual">
              <div className="uc-glow" aria-hidden="true" />
              <div className="uc-phone"><img src={persona.shot} alt={`WalletTrails screen for ${persona.label.toLowerCase()}`} loading="lazy" /></div>
              <div className="uc-note"><span><Icon name={persona.icon} size={16} /></span><p><small>{persona.note[0]}</small><b>{persona.note[1]}</b></p></div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

const faqs = [
  ['Who is WalletTrails for?', 'Anyone whose money moves through more than one place. Freelancers track client income, advances, and payments in parts. Creators follow brand deals, subscriptions, and gear installments. Home managers run a shared household ledger and budgets. Salaried people, students, and travelers use wallets, bills, budgets, and Travel Mode. Start with one wallet and add the rest only when you need it.'],
  ['Can I use WalletTrails without an internet connection?', 'Yes. Personal wallets and recent transactions can be available from your local cache, and personal income, expense, and transfer entries can be queued offline. They sync when your device is online again. Shared Household changes intentionally need an internet connection.'],
  ['Can other Household members see my bank balance?', 'No. Household members see only entries added to the shared Household ledger, including who paid a shared item. Your personal wallets, income, loans, and unrelated transactions stay private to your account.'],
  ['What can WalletTrails remind me about?', 'You can set reminders around monthly costs, loans, installments, and money you expect to receive. Reminder lead times can include three days before, one day before, and the due day.'],
  ['How does WalletTrails protect amounts on a shared or public phone?', 'You can hide values across the app and reveal them with your device biometrics or your WalletTrails PIN. The app remains usable while values are masked, and it can re-hide values after you leave the app.'],
  ['Does WalletTrails connect to my bank automatically?', 'WalletTrails does not log into your bank or move money. On Android you can opt in so eligible bank SMS (and optional bank-app alerts) become a bookkeeping draft. You Approve, Reject, or edit it. OTPs and marketing messages are not meant for this. You can also paste an alert by hand, or turn Bank alerts off anytime.'],
  ['Can I export my information?', 'WalletTrails supports CSV sharing for personal and Household reports. The web experience also supports report export options, giving you a useful copy when you need it.'],
]
function FAQSection() {
  return <section className="faqs" id="faqs"><div className="shell"><Reveal className="heading center"><span className="eyebrow">Helpful answers</span><h2>Questions, answered<br /><em>without the jargon.</em></h2></Reveal><Reveal className="faq-list">{faqs.map(([question, answer], index) => <details key={question} open={index === 0}><summary><span>{question}</span><i>+</i></summary><p>{answer}</p></details>)}</Reveal></div></section>
}

function SupportSection() {
  return <section className="support" id="support"><div className="shell support-grid"><Reveal className="support-copy"><span className="eyebrow">Help & support</span><h2>A little help goes<br />a <em>long way.</em></h2><p>Whether you are getting started, managing a reminder, or have a question about your account, WalletTrails includes Help & Support inside the app.</p><a href="#download" className="button">Get WalletTrails <Icon name="arrow" size={17} /></a></Reveal><Reveal className="support-panel"><article><span className="support-icon">?</span><div><small>GETTING STARTED</small><h3>New to WalletTrails?</h3><p>Begin with your wallets, then record your first income or expense—or approve a bank SMS draft. The app is built for small, useful steps.</p></div></article><article><span className="support-icon">⌁</span><div><small>IN-APP SUPPORT</small><h3>Need a hand?</h3><p>Open Settings, then Help & Support to send a ticket directly from WalletTrails.</p></div></article><article><span className="support-icon">♙</span><div><small>ACCOUNT & PRIVACY</small><h3>Stay in control.</h3><p>Use your app settings to manage amount privacy, reminders, Bank alerts, themes, and account requests.</p></div></article></Reveal></div></section>
}

function AboutSection() {
  return (
    <section className="about about--story" id="about">
      <div className="shell about-grid">
        <Reveal className="about-art about-art--screens">
          <div className="about-orb" />
          <div className="about-dots" />
          <div className="about-screen about-screen--back">
            <img src="/media/screenshots/dashboard.png" alt="WalletTrails home screen with wallets" />
          </div>
          <div className="about-screen about-screen--main">
            <img src="/media/screenshots/report.png" alt="WalletTrails monthly reports screen" />
          </div>
          <div className="about-rating"><span>✦</span> Private by design</div>
          <div className="about-note">Personal money stays private.<br /><b>Shared expenses stay clear.</b></div>
        </Reveal>
        <Reveal className="about-copy">
          <span className="eyebrow">About WalletTrails</span>
          <h2>Clear money,<br />for <em>real life.</em></h2>
          <p>WalletTrails is a Pakistan-first money companion for the everyday decisions behind your cash, bank wallets, income, bills, and future plans. It replaces scattered notes, chat IOUs, and stressful guesswork with one calm, useful picture of what you have and what is coming.</p>
          <p>We built it for the way money actually moves here: a salary landing in one wallet, a client payment in another, cash for the week, a bill that always arrives before payday, a bank SMS that should not be retyped by hand, and a household expense that should be shared fairly—without handing over your whole financial life.</p>
          <p>Salaried people, freelancers, families, and roommates can follow every rupee without turning personal finance into a spreadsheet project. You add what you need, when you need it. The app stays out of the way the rest of the time.</p>
          <div className="about-promises">
            <span><i>✓</i> Personal wallets stay personal</span>
            <span><i>✓</i> Track money even when you are offline</span>
            <span><i>✓</i> Share Household costs without sharing everything</span>
            <span><i>✓</i> Reminders that do not leak exact amounts</span>
            <span><i>✓</i> Optional bank SMS detect — you approve every draft</span>
          </div>
          <a href="#how">See how WalletTrails works <Icon name="arrow" size={16} /></a>
        </Reveal>
      </div>
      <div className="shell about-more">
        <Reveal className="about-more-card">
          <small>WHY WE EXIST</small>
          <h3>Money is already noisy.</h3>
          <p>Most people do not fail at money because they lack a ledger. They lose the thread: a forgotten subscription, a loan installment, a client who still owes a part payment, or a trip that mixed personal and shared spend. WalletTrails exists to hold those threads in one place that still feels human.</p>
          <p>That means fewer “where did it go?” evenings, and a month you can actually read—expected income next to actual spending, bills next to wallets, and a household book that stays separate from your private accounts.</p>
        </Reveal>
        <Reveal className="about-more-card">
          <small>WHO IT IS FOR</small>
          <h3>If your money has more than one story.</h3>
          <p>Use it if you keep cash and bank wallets together. Use it if you freelance and income arrives in retainers, one-off jobs, or parts. Use it if your home splits groceries and rent. Use it if you travel and still want the books at home to stay accurate.</p>
          <p>You do not need to be a finance person. Start with one wallet and one expense. Add bills, income sources, or a Household only when those parts of life show up.</p>
        </Reveal>
        <Reveal className="about-more-card">
          <small>HOW WE STAY HONEST</small>
          <h3>Private by default. Clear on purpose.</h3>
          <p>WalletTrails does not log into your bank or move your money. You record activity yourself, including optional bank-alert drafts you review. Household members see only the shared ledger—not your bank balance, salary, or unrelated transactions.</p>
          <p>When you hide amounts, the app still works; values wait behind your device biometrics or PIN. We would rather be precise about what the product does than dress it up as something it is not.</p>
        </Reveal>
      </div>
    </section>
  )
}

function App() {
  const [menu, setMenu] = useState(false)
  const [tour, setTour] = useState(false)
  const [active, setActive] = useState('')
  useEffect(() => { const observer = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('visible')), { threshold: 0.12 }); document.querySelectorAll('.reveal').forEach((item) => observer.observe(item)); return () => observer.disconnect() }, [])
  useEffect(() => { document.body.style.overflow = tour ? 'hidden' : ''; return () => { document.body.style.overflow = '' } }, [tour])
  useEffect(() => {
    const ids = NAV_LINKS.map(([id]) => id)
    let ticking = false
    const sync = () => {
      ticking = false
      const y = window.scrollY + 96
      const ordered = ids
        .map((id) => {
          const el = document.getElementById(id)
          if (!el) return null
          return { id, top: el.getBoundingClientRect().top + window.scrollY }
        })
        .filter(Boolean)
        .sort((a, b) => a.top - b.top)
      let current = ''
      for (const item of ordered) {
        if (item.top <= y) current = item.id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(sync)
    }
    sync()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('hashchange', sync)
    const onClick = (event) => {
      const el = event.target.closest('a, button')
      if (!el) return
      const href = el.getAttribute('href') || ''
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      if (href === '#download' || el.classList.contains('playstore')) {
        track('get_app_click', { link_text: text })
        return
      }
      if (href === '#support') track('support_click', { link_text: text })
    }
    const onToggle = (event) => {
      const details = event.target
      if (details.tagName === 'DETAILS' && details.open && details.closest('#faqs')) {
        const question = (details.querySelector('summary')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120)
        track('faq_open', { question })
      }
    }
    document.addEventListener('click', onClick)
    document.addEventListener('toggle', onToggle, true)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('hashchange', sync)
      document.removeEventListener('click', onClick)
      document.removeEventListener('toggle', onToggle, true)
    }
  }, [])
  return <><Header menu={menu} setMenu={setMenu} active={active} setActive={setActive} /><main>
    <section className="hero" id="home"><div className="shell hero-grid"><Reveal className="hero-copy"><span className="eyebrow"><i />Pakistan-first · Privacy · Auto SMS</span><h1>Follow every <em>rupee.</em><br />Feel more <span>free.</span></h1><p>WalletTrails brings wallets, bills, family ledgers, and optional bank SMS auto-detect together in one calm place. A bank alert can become a draft. You tap Approve.</p><div className="hero-actions"><a className="button" href="#download">Start tracking free <Icon name="arrow" size={17} /></a><button className="watch" onClick={() => setTour(true)}><span><Icon name="play" size={12} /></span>See how it works</button></div><div className="human-note"><div><i>H</i><i>S</i><i>M</i></div>Made for real life, not spreadsheets</div></Reveal><Reveal className="hero-visual"><div className="orb one" /><div className="orb two" /><PhonePreview /><div className="float spent"><span>↘</span><p><small>Spent this week</small><b>Rs. 14,850</b></p><strong>−12%</strong></div><div className="float budget"><span>✓</span><p><small>Budget</small><b>On track</b></p></div></Reveal></div></section>
    <section className="trust"><div className="shell"><p>ONE SIMPLE HOME FOR THE FINANCIAL THINGS THAT MATTER</p><div><span>Personal money</span><i /><span>Freelance work</span><i /><span>Shared living</span><i /><span>Bank SMS drafts</span></div></div></section>
    <section className="showcase" id="preview"><div className="shell"><Reveal className="heading center"><span className="eyebrow">A look inside</span><h2>Clear money moments,<br /><em>beautifully connected.</em></h2><p>From a quick expense to your monthly picture, every detail is designed to feel simple and human.</p></Reveal><div className="showcase-grid"><Reveal className="overview"><header><span>◔</span><p><small>Monthly overview</small><b>September 2026</b></p><i>•••</i></header><div className="total"><small>You have spent</small><b>Rs. 42,780</b><span>of Rs. 55,000 planned</span></div><div className="donut-content"><div className="donut"><span><b>78%</b><small>used</small></span></div><div>{[['Food & dining', 'Rs. 15,200', 'blue'], ['Home & bills', 'Rs. 12,500', 'purple'], ['Travel', 'Rs. 6,750', 'orange'], ['Other', 'Rs. 8,330', 'gray']].map(([label, amount, tone]) => <p className="legend" key={label}><i className={tone} />{label}<b>{amount}</b></p>)}</div></div><footer>Spending by category <a>See details →</a></footer></Reveal><Reveal className="tour-card"><div className="tour-art"><div /><button onClick={() => setTour(true)} aria-label="Play product tour"><Icon name="play" size={18} /></button><span>01:00</span></div><article><small>PRODUCT TOUR</small><h3>Your day, in one minute.</h3><p>See how WalletTrails helps you capture expenses, approve a bank SMS, and stay on course.</p><button onClick={() => setTour(true)}>Play video →</button></article></Reveal><Reveal className="quick-card"><span className="ficon purple">⇄</span><small>BANK SMS IN</small><h3>Drafts you approve.</h3><p>Opt in on Android. Eligible bank alerts become a suggestion—not a silent post.</p><div>SMS <i>→</i> Approve</div></Reveal><Reveal className="people-card"><span className="people"><i>H</i><i>S</i><i>M</i></span><small>SHARED SPENDING</small><h3>Fairness without the maths.</h3><p>Split household expenses and keep everyone in the loop.</p><a href="#features">↗</a></Reveal></div></div></section>
    <section className="features shell" id="features"><Reveal className="heading split"><div><span className="eyebrow">Everything in reach</span><h2>Less money stress.<br /><em>More clarity.</em></h2></div><p>Helpful tools for understanding each rupee—without making personal finance feel like work.</p></Reveal><div className="feature-grid">{productFeatures.map(([icon, title, text, tone], index) => <Reveal className="feature" key={title}><span className={`ficon ${tone}`}><Icon name={icon} size={21} /></span><i>{String(index + 1).padStart(2, '0')}</i><h3>{title}</h3><p>{text}</p></Reveal>)}</div></section>
    <UseCases />
    <ProductDepth />
    <TraiSection />
    <ScreenshotGallery />
    <AboutSection />
    <section className="how" id="how"><div className="shell"><Reveal className="heading center"><span className="eyebrow">Simple from the start</span><h2>How it <em>works.</em></h2><p>Start with the money you already have, capture the moments that matter—by hand or from a bank SMS—and let WalletTrails make the month easier to understand.</p></Reveal><div className="how-flow">{[["↓", 'Get WalletTrails', 'Download the Android app and create your private WalletTrails account. Your money starts with you.'], ['♙', 'Add your wallets', 'Add your cash and bank wallets with their opening balances. You will see one clear total straight away.'], ['✓', 'Follow every rupee', 'Log income, expenses, and transfers—or opt in so a bank SMS becomes a draft you approve. Use reports, reminders, privacy lock, and Household when you need them.']].map(([symbol, title, body], index) => <Reveal className="how-step" key={title}><span className={`how-step__icon how-step__icon--${index + 1}`}>{symbol}</span><span className="how-step__number">0{index + 1}</span><h3>{title}</h3><p>{body}</p>{index < 2 && <i className="how-connector" aria-hidden="true">···</i>}</Reveal>)}</div><Reveal className="how-callout"><span>✦</span><p><b>Start small.</b> Add one wallet, log an expense, or approve a detected bank message. The clearer picture follows naturally.</p><a href="#download">Get the app <Icon name="arrow" size={16} /></a></Reveal></div>    </section>
    <FAQSection />
    <SupportSection />
    <section className="download shell" id="download"><Reveal><span className="eyebrow light">Ready when you are</span><h2>Start following<br />every <em>rupee.</em></h2><p>Take the first small step towards feeling more at ease with your money.</p><div className="dl-actions"><a className="playstore" href="#home"><i>▶</i><span><small>GET IT ON</small><b>Google Play</b></span></a><a className="button white" href="#home">Explore WalletTrails <Icon name="arrow" size={16} /></a></div></Reveal><div className="mini-phone"><i /><p>WalletTrails</p><article><small>Available balance</small><b>Rs. 86,420</b></article><span /><span /><span /><strong>+</strong></div></section>
  </main><footer><div className="shell foot-main"><Logo inverse /><p>Follow every rupee. Feel more free.</p><nav><a href="#screenshots">Screenshots</a><a href="#features">Features</a><a href="#use-cases">Use cases</a><a href="#about">About</a><a href="#how">How it works</a><a href="/privacy.html">Privacy</a></nav></div><div className="shell foot-bottom"><span>© 2026 WalletTrails. Made for everyday money.</span><a href="#home">Back to top ↑</a></div></footer>{tour && <TourModal onClose={() => setTour(false)} />}<ConsentBanner /></>
}
function TourModal({ onClose }) { return <div className="modal" role="dialog" aria-modal="true" aria-label="WalletTrails product tour"><button className="backdrop" onClick={onClose} aria-label="Close tour" /><article><button className="x" onClick={onClose} aria-label="Close"><Icon name="close" /></button><Logo inverse /><small>PRODUCT TOUR · 01:00</small><div><span><Icon name="plus" size={30} /></span><h2>Track it as it happens.</h2><p>Log a spend, or approve a bank SMS draft. Every rupee has a place.</p></div><nav><i /><i /><i /></nav></article></div> }
export default App
