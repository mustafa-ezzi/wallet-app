# Lovable brief: Trai section for the WalletTrails marketing site

Build **one new section** on the existing WalletTrails marketing page. Do not create a new app, a new page, or a chatbot product. Trai is the assistant already inside the WalletTrails app. This section explains it and shows one short conversation.

Match the site that is already there. Do not invent a purple SaaS theme, a dark cyber look, or a generic “AI chat” grid.

## Where it goes

- Insert the section after the product-depth block (“One app for the details that keep life moving”) and before the screenshots section.
- Section id: `trai`
- Add a nav link labeled **Trai** in the existing header, in the same style as the other section links.

## What Trai is

Trai is short for Transaction Record Account Intelligence (TRAI). It lives inside WalletTrails. You type or say a sentence, Trai turns it into a money entry, and nothing is written until you say to save it.
 
It is a bookkeeper in the app. It is not a general chatbot, and it does not browse the web.

Voice stays on the phone. The recording is not uploaded. The model key stays on the server.

## The conversation to show

Render this as a phone-style chat mock, not as a screenshot you invent. Use the copy below word for word.

1. **You:** Hey Trai, add an expense of Rp 250
2. **Trai:** Which wallet should I use?
3. **You:** From Meezan bank
4. **Trai:** Rs 250 from Meezan, Food & Drink. Save it?
5. **You:** Yes, save it
6. **Trai:** Saved. Meezan is updated.

Under the last Trai line, show a small confirmation card:

- **Rs 250**
- Meezan
- Food & Drink
- A green **Save** pill and a quiet **Change** pill

Above the thread, a small listening row: a pulsing emerald dot, the word **Listening**, and **Stop**. This is the hands-free state. The person does not tap the mic again between turns.

## Headline and intro

Eyebrow: `MEET TRAI`

Heading:

```text
Say it once.
Trai writes it down.
```

The words “Trai writes it down.” are the green emphasis, using the same `em` treatment as the other headings.

Supporting line:

```text
Tell Trai an expense, a bill, or a question about this month. It asks when something is missing, shows you the card, and saves only after you say yes.
```

Primary button: **Get the app**, linking to `#download`, same button style as the rest of the site.

Secondary text button: **See it listen**, which scrolls to the chat mock on this section. Do not open a modal and do not play audio.

## Feature cards

Six cards. Keep the sentences short. Do not add features that are not in this list.

1. **Talks it through**
   Say “add an expense of Rp 250.” Trai asks which bank. You answer “from Meezan.” It keeps the whole sentence and then asks if it should save.

2. **Saves only when you say so**
   “Yes, save it” writes the entry. “Stop” only turns the microphone off. “No” throws the card away. A second yes does not write a second row.

3. **Answers without guessing**
   “What was my recent transaction?”, “What’s my balance?”, and “How was my month?” are answers, not new expenses. Trai does not ask you for an amount just to look something up.

4. **Bills, wallets, and people**
   Mark a bill paid, move money between your wallets, lend or borrow with someone you already track, or add a wallet. Each one waits for Save.

5. **Budgets and travel**
   “Am I over food?” reads this month and does not save. “Set food to 8000” and “Turn on travel mode in dirhams” show a card first. The trip uses the rate the app already has. Trai does not invent a rate.

6. **Stays in its lane**
   It will not sign you out, take a PIN, change a password, email a report, or touch a shared household ledger. Hide the amounts and the PIN sheet stay on your phone.

## Three quiet facts under the cards

One strip, four short notes:

- **On the phone.** Say “Hey Trai” while the app is open. The lock screen does not wake it.
- **In the browser.** Tap the mic once, then keep talking. There is no always-on wake word.
- **Your books only.** Another person’s wallets, budgets, and reports are refused.
- **Pakistan first.** Rupees, Meezan, cash, and the month you are in. “50 thousand” means 50000.

## What not to claim

Do not write any of these:

- Trai can chat about anything
- Trai sends email or WhatsApp
- Trai logs you out or sets your PIN
- Trai shares household expenses
- Trai deletes all your expenses
- Trai makes up an exchange rate
- Audio is stored or sent to the cloud
- There is a web wake word

## Visual direction

Use the tokens already on the site. Do not introduce a new font or a new green.

```css
:root {
  --ink: #0f1f18;
  --muted: #3f6153;
  --blue: #059669;
  --primary: #059669;
  --primary-dark: #047857;
  --primary-soft: #10b981;
  --bg: #f2f7f4;
  --line: #d7e8de;
  --display: Outfit, sans-serif;
  --sans: 'DM Sans', sans-serif;
}
```

Fonts already loaded: **Outfit** for headings, **DM Sans** for body.

The section should feel like the existing `.freelancers` and `.product-depth` blocks: a wide shell (`width: min(1140px, calc(100% - 48px))`), 20–22px rounded cards, soft borders, and a heading with one green emphasis.

Layout on desktop:

- Left: eyebrow, heading, supporting line, the six feature cards in a 2-column grid, then the four-note strip.
- Right: a sticky phone frame, about 300px wide, dark green bezel (`#10251c`), 36px radius, the chat inside on `#f2f7f4`.
- The listening row sits at the top of the phone. The confirmation card sits under Trai’s last line.

User bubbles are white with a `#d7e8de` border, aligned right. Trai bubbles are `#e8f5ee`, aligned left, with a small emerald orb instead of an avatar photo. Trai’s name is 12px, weight 700, color `#047857`.

The listening dot pulses gently. Respect `prefers-reduced-motion: reduce` by turning the pulse off.

Mobile, under 650px:

- Stack the copy above the phone.
- The phone is centered and slightly smaller.
- Feature cards become one column.
- The four-note strip becomes one column.
- Section padding drops from 112px to 70px, matching the other sections.
- Body copy stays at least 15px. Do not shrink the chat text below 13px.

## CSS to use

Paste this with the section. Class names are prefixed `trai-` so they do not collide with the rest of the page.

```css
.trai-band {
  padding: 112px 0;
  background:
    radial-gradient(circle at 88% 12%, #10b9812e, transparent 28%),
    linear-gradient(180deg, #f8fbf9 0%, #f2f7f4 100%);
  color: var(--ink);
}
.trai-band .shell {
  width: min(1140px, calc(100% - 48px));
  margin: auto;
}
.trai-layout {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 48px;
  align-items: start;
}
.trai-band .eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border-radius: 20px;
  background: #e8f5ee;
  color: #047857;
  font-size: 10px;
  letter-spacing: 0.075em;
  font-weight: 700;
  text-transform: uppercase;
}
.trai-band h2 {
  margin: 16px 0;
  font: 800 clamp(40px, 5vw, 64px) / 0.98 var(--display);
  letter-spacing: -0.055em;
}
.trai-band h2 em {
  font-style: normal;
  color: #059669;
}
.trai-lead {
  max-width: 520px;
  margin: 0;
  color: var(--muted);
  font-size: 17px;
  line-height: 1.7;
}
.trai-actions {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-top: 26px;
}
.trai-band .button {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 15px 20px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(110deg, #059669, #047857);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 10px 24px #0596693a;
  text-decoration: none;
}
.trai-textlink {
  border: 0;
  background: transparent;
  color: #3f6153;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.trai-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 36px;
}
.trai-card {
  padding: 22px;
  border: 1px solid #d7e8de;
  border-radius: 18px;
  background: #fff;
}
.trai-card h3 {
  margin: 0 0 8px;
  font: 700 18px var(--display);
  letter-spacing: -0.35px;
}
.trai-card p {
  margin: 0;
  color: #3f6153;
  font-size: 13px;
  line-height: 1.6;
}
.trai-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 16px;
}
.trai-strip article {
  padding: 14px 16px;
  border-radius: 14px;
  background: #10251c;
  color: #e8f6ee;
}
.trai-strip b {
  display: block;
  font: 700 13px var(--display);
}
.trai-strip span {
  display: block;
  margin-top: 4px;
  color: #b7d4c6;
  font-size: 12px;
  line-height: 1.45;
}
.trai-phone-wrap {
  position: sticky;
  top: 104px;
}
.trai-phone {
  width: min(320px, 100%);
  margin-left: auto;
  padding: 14px 12px 18px;
  border: 8px solid #10251c;
  border-radius: 36px;
  background: #f2f7f4;
  box-shadow: 0 32px 58px #0c1f184d;
}
.trai-listen {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: #047857;
  font-size: 12px;
  font-weight: 800;
}
.trai-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #059669;
  box-shadow: 0 0 0 5px #05966933;
  animation: trai-pulse 1.4s ease-in-out infinite;
}
@keyframes trai-pulse {
  50% { transform: scale(0.86); opacity: 0.7; }
}
.trai-turn {
  display: flex;
  gap: 8px;
  margin: 8px 0;
}
.trai-turn--you {
  justify-content: flex-end;
}
.trai-orb {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  margin-top: 2px;
  border-radius: 50%;
  background: linear-gradient(135deg, #059669, #0d9488);
}
.trai-bubble {
  max-width: 78%;
  padding: 8px 10px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.45;
}
.trai-turn--bot .trai-bubble {
  background: #e8f5ee;
  color: #0f1f18;
}
.trai-turn--you .trai-bubble {
  background: #fff;
  border: 1px solid #d7e8de;
}
.trai-bubble small {
  display: block;
  margin-bottom: 2px;
  color: #047857;
  font-size: 10px;
  font-weight: 700;
}
.trai-confirm {
  margin-top: 8px;
  padding: 10px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #d7e8de;
}
.trai-confirm b {
  font: 700 16px var(--display);
}
.trai-confirm p {
  margin: 2px 0 8px;
  color: #3f6153;
  font-size: 12px;
}
.trai-confirm-actions {
  display: flex;
  gap: 8px;
}
.trai-confirm-actions span {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.trai-confirm-actions .save {
  background: #059669;
  color: #fff;
}
.trai-confirm-actions .change {
  background: #eef6f1;
  color: #047857;
}
@media (max-width: 900px) {
  .trai-layout,
  .trai-grid,
  .trai-strip { grid-template-columns: 1fr 1fr; }
  .trai-phone-wrap { position: static; }
  .trai-phone { margin: 0 auto; }
}
@media (max-width: 650px) {
  .trai-band { padding: 70px 0; }
  .trai-band .shell { width: calc(100% - 32px); }
  .trai-layout,
  .trai-grid,
  .trai-strip { grid-template-columns: 1fr; }
  .trai-band h2 { font-size: 38px; }
  .trai-lead { font-size: 15px; }
  .trai-actions { flex-direction: column; align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  .trai-dot { animation: none; }
}
```

## HTML shape

Use this structure. Keep the copy from this brief. You may adjust spacing, not the claims.

```html
<section class="trai-band" id="trai">
  <div class="shell trai-layout">
    <div>
      <span class="eyebrow">Meet Trai</span>
      <h2>Say it once.<br><em>Trai writes it down.</em></h2>
      <p class="trai-lead">Tell Trai an expense, a bill, or a question about this month. It asks when something is missing, shows you the card, and saves only after you say yes.</p>
      <div class="trai-actions">
        <a class="button" href="#download">Get the app</a>
        <a class="trai-textlink" href="#trai-phone">See it listen</a>
      </div>
      <div class="trai-grid">
        <!-- six .trai-card blocks from the feature list -->
      </div>
      <div class="trai-strip">
        <!-- four notes: On the phone, In the browser, Your books only, Pakistan first -->
      </div>
    </div>
    <div class="trai-phone-wrap" id="trai-phone">
      <div class="trai-phone" aria-label="A sample conversation with Trai">
        <div class="trai-listen"><i class="trai-dot"></i> Listening</div>
        <!-- turns, then the Rs 250 confirmation card -->
      </div>
    </div>
  </div>
</section>
```

## Done when

- The section uses Outfit and DM Sans and the greens above.
- The chat shows the Meezan example and the Save card.
- All six features match this brief, and none of the refused claims appear.
- Desktop is two columns. At 650px everything stacks and the text stays readable.
- The header has a Trai link that scrolls to `#trai`.
