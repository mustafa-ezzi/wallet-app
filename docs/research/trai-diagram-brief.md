# Brief: draw how Trai talks

Give this file to Claude or GPT and ask for **one easy diagram**. A left-to-right flow is enough. Use the box names below. Do not add boxes that are not listed.

Trai is the bookkeeper inside WalletTrails. A person says or types one sentence. Trai either answers, asks one short question, or shows a card and waits. **Nothing is written into the books until the person agrees.**

There are two bots. They do not share a microphone, and they do not share the books. They only pass short text.

## The two bots

Draw this as its own picture, or as the left and right of the bigger flow. The listening bot is the phone. The server bot is everything after the text arrives.

**Listening bot — on the phone**

- The app is open. It hears “Hey Trai” and starts the conversation.
- Speech becomes text on the phone. The microphone recording is never uploaded.
- Typing uses this same bot. The typed sentence is already text.
- It shows whatever the server bot sends back: an answer, one question, or a save card.
- It keeps listening when the reply is a question or a card, so the person can answer out loud.
- It stops listening when the entry is saved, when the answer is finished, or when the person says “stop”.
- “Stop” only turns the microphone off. It does not cancel the card.

**Server bot — on the server**

- It receives one sentence of text from a logged-in person.
- It loads that person’s catalog: wallets, categories, bills, income sources, people. No passwords.
- It answers a known question itself when it can, and skips Gemini.
- Otherwise it makes **one** JSON action with Gemini, then checks that JSON.
- It replies with an answer, a question, or a card. The card is not saved yet.
- It writes the books only when a later message is “yes save it”.

**Messages they send each other**

Draw these four arrows between the two bots. Number them.

1. Listening bot → Server bot: the sentence. Label: **Text only**.
2. Server bot → Listening bot: the result. Label: **Answer, question, or card**.
3. Listening bot → Server bot, only if the person agrees: **Yes, save it**.
4. Server bot → Listening bot: **Saved**. The listening bot then stops and shows that line.

If arrow 2 was a question (“Which wallet?”), the listening bot stays on. The next thing the person says goes out as arrow 1 again. The server bot fills in the waiting card and does not call Gemini a second time.

## How to draw it

- One picture. Plain boxes and arrows. Short labels.
- Read it left to right, then the three endings at the right.
- Color is optional. If you use color: phone = green, server = white, “not saved yet” = amber, “saved” = green.
- No code, no class names, no database tables, no logos.
- The hearing step stays on the phone. The JSON step stays on the server. Do not merge them into one box.

## The boxes

Draw these, and only these.

1. **Person**  
   Speaks or types. Examples: “I bought milk, Rp 150”, “what’s my balance?”, “yes save it”, “cancel”.

2. **Phone**  
   Two ways in, then one way out.
   - **Hey Trai** — the phone is already open and listening for the wake words. “Hey Trai” starts a conversation. The rest of the sentence, if any, is the command. Audio never leaves the phone.
   - **Typing** — the same sentence, typed. No microphone.
   - The phone turns speech into text on the device, then sends **only the text** to the server. It does not send audio.

3. **Trai door**  
   The server receives the text. The person must be logged in. Empty text is refused. More than 500 characters is refused.

4. **Sorter**  
   The server labels the sentence before it asks anyone else:
   - **Yes / save it** — confirm. “ok” alone is not a yes.
   - **No / cancel** — throw away the waiting card. “stop” only stops the microphone. It does not cancel the card.
   - **Correction** — “make it 200”, “put it on Cash”, “category food”, “call it milk”.
   - **Anything else** — a new request.

5. **Waiting card**  
   The last proposal for this person, if one is still open. It expires after 10 minutes.  
   If the person is answering a question Trai already asked (usually “which wallet?”), Trai fills in the card from this memory and **does not call the JSON maker again**.

6. **Catalog**  
   This person’s own list, loaded for the request: wallet names and ids, income sources, expense and income categories, bills, people names.  
   No passwords, no email, no other person’s books. Person accounts are not wallets.

7. **Known questions**  
   Some sentences are answered from the catalog with no model: theme, hide or show amounts, open a page, budget, travel, reminder, and a few bookkeeping phrases the server already recognizes. If this box can answer, the JSON maker is skipped.

8. **JSON maker**  
   One call to Gemini, on the server only. The key never goes to the phone.  
   Gemini is given the catalog, today’s date, and the sentence, and must return **one JSON object**. That object names one action. It must copy wallet ids from the catalog. It must not say the entry is already saved.  
   If Gemini is down or the reply is not JSON, the person sees “Trai is unavailable right now.” Nothing is written.

9. **Checker**  
   The server accepts the JSON only if the action is on the allowed list, the wallet exists, and the request is this person’s own money. Unknown actions, other people’s data, passwords, sign-out, PIN, and emailing the books become **refuse**. A missing amount or wallet becomes **ask**, not a guess.

10. **Three endings** (draw as three separate boxes on the right)
    - **Answer** — a read. Balance, this month, a category total, or the latest transaction. Numbers are filled in by the server, not by Gemini. Nothing is saved.
    - **Ask** — one short question, such as “Which wallet?”. If Trai already has the amount and the note, it remembers them and waits.
    - **Card** — a proposal on screen: amount, wallet, category, note. The person must say “yes save it” (or tap save). Until then, `saved` is false.

11. **Books**  
    Only the confirm step writes here. Confirm checks the card again, then writes the expense, income, transfer, bill payment, wallet, budget, theme, travel, or reminder. The phone then refreshes.

## Arrows, in order

Use these labels on the arrows.

1. Person → Phone: “speaks or types”
2. Phone → Trai door: “text only”
3. Trai door → Sorter: “what kind of sentence?”
4. Sorter → Waiting card: “yes, no, or a correction of the open card”
5. Waiting card → Card, or Waiting card → Books:  
   - “yes” on a finished card goes to Books.  
   - “which wallet? … Cash” stays on the Card and still waits for yes.  
   - “cancel” drops the card. Nothing is written.
6. Sorter → Catalog: “a new request”
7. Catalog → Known questions: “can we answer this ourselves?”
8. Known questions → Answer: “yes, skip Gemini”
9. Known questions → JSON maker: “no, one Gemini call”
10. JSON maker → Checker: “one JSON action”
11. Checker → Answer, Ask, or Card

From **Card**, draw a loop back to the Person: “yes save it” returns through the Sorter and then into **Books**. “cancel” ends with nothing saved.

## What each ending is allowed to do

**Answer** (no save): month summary, category spent, recent transaction, balance, budget status.

**Ask** (no save): missing amount, missing wallet, two wallets match, unknown category, unknown theme color.

**Card, then Books only after yes:**

- add an expense or income
- mark this month’s income or a bill paid
- transfer between two wallets
- lend, borrow, pay, or receive with a person
- add a wallet or an income source
- delete or correct the last entry Trai saved
- set a budget, a theme, travel mode, or a bill reminder

**Phone-only after the reply comes back** (small note under the Phone box, not a new column):

- open a page (home, wallets, budgets, bills, reports, settings, travel)
- hide amounts, or ask before showing them
- apply a saved theme, travel mode, or reminder on the device

## Words to print on the diagram

Put this sentence under the title:

“Trai hears on the phone, decides on the server, and writes only after yes.”

Put this on the JSON maker box:

“One call. One JSON object. No second guess.”

Put this on the Books box:

“Writes only after yes save it.”

## Do not draw

- A second AI that “performs the task”. The JSON names the task. The Checker allows it. The Books box performs it, and only after yes.
- Audio, a recording, or the microphone going to the server.
- The Gemini key on the phone.
- Household books, sign-out, PIN, password, or emailing a report. Those are refused.
- A person account used as a wallet.
- More than one Gemini call for a single sentence.

## A sketch to redraw, not to obey

The picture should feel like this. Redraw it cleaner. Keep the same boxes and the same order.

```text
Person
  → Phone  (Hey Trai or typing → text only)
    → Trai door
      → Sorter
          → Waiting card → Card → (yes) → Books
          → Catalog → Known questions → Answer
                              ↓
                         JSON maker → Checker → Answer | Ask | Card
```

Card loops back to the Person until they say yes or cancel.
