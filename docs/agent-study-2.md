
## 8. Second deep study (27 Oct): what to add beyond sections 1 to 7
From BrowserOS, Nanobrowser (current single-loop rewrite), browser-use and Skyvern source.

Agent safety and truth
- Approvals bound to a basis (Nanobrowser gate.ts): the yes is tied to category + button + nearby amount + form target ("Pay ₦5,000 to X"). Re-classify just before the click; if the basis changed or the site changed while she decided, ask again. Late spoken yeses make this essential.
- Deterministic sensitivity classifier (classify.ts): word lists for pay, delete, submit, grant; "Continue/OK" next to an amount counts as pay; consent "Allow" counts as grant; cookie "Reject all" exempt. Add ₦, Recharge, Buy airtime, Transfer, Paystack, Flutterwave and labels in all five languages.
- Secret fields (masking.ts): type, autocomplete, name/id patterns, Luhn check for cards; add NIN/BVN (11 digits) and PIN. Typing into them is always her step (ask_private).
- Domain-bound placeholder secrets (browser-use): the model sees only a name; the real value is inserted at action time and only on the matching domain.
- "The model locates, never transcribes" (Skyvern otp_service): every reference number, account number or price we read out is snapped to an exact string copied from the page; if ambiguous, read again.
- Verification debt plus the pre-done rule: every URL, price, name and value in the final answer must appear word for word in tool outputs; partial results marked as partial beat overclaiming.
- Takeover: one short sentence ("Sign in here, then press Done"); no input is sent while she acts; captchas always go to her. "A declined action or a blocked site is her answer, not an error to work around."
- Nonce-fenced page text; if a page asks for something she did not ask for, carry on and mention it at the end; never type credentials into a page Jagora navigated to on its own.
- Navigation guard at the request stage (Playwright route + framenavigated): blocked sites aborted, including redirects; javascript:, data:, file: always blocked.
- Downloads and uploads honesty: "download started" is not "saved"; read back the input's file list after an upload.
- Approve-and-remember per site for plain submits only, never for pay or grant.

Reliability and cost
- Steering queue: what she says mid-run is queued and delivered at the next turn; Stop hands it back to the composer.
- Restart-safe runs and reconnecting UI: an interrupted read is safe to retry, an interrupted change is "look before retrying"; events carry sequence numbers and a reconnecting phone replays what it missed (flaky mobile data).
- Context: old page payloads become stubs ("tab 3 rev 7: content elided"), receipts kept word for word, compaction = code-written ledger + model summary, user messages always kept; after actions send a line diff, not a full snapshot.
- Grep the page snapshot instead of dumping it; screenshots only as a tool; static system prompt for prefix caching.
- Settle = MutationObserver quiet within a budget; attach recent console errors and open dialogs to each result.
- Cached script replay (Skyvern): a successful run on a site is saved as a script and replayed next time, with the AI as fallback. Biggest cost cut for sites people repeat (JAMB, NIMC, airtime).

Product
- Skills: reusable task templates with typed parameters (text, file, credential), completion and terminate criteria, and site error codes mapped to spoken messages in each language. After a success, offer "Save as a skill" with variables detected automatically.
- Step-scoped goal check: certify only the current step, with the whole goal as context.
- Schedules: after a task that could recur, suggest a schedule; results show on the new tab, running ones first.
- Live-activity visuals: glow with an in-page Stop, curved cursor paths with a click ripple, confetti on completion; hide overlays before screenshots.
- Memory and personalise: "About me", "Expectations", "Common actions", filled by voice; empty template lines stripped.
- Small touches: a read-only "talk about this page" mode, each task in its own tab group, chat history with edit-and-rerun and Markdown export, a feedback prompt after some use.

What each one ships as
- BrowserOS: desktop app (Chromium fork) with OS update feeds; agent server and UI extensions update separately.
- Nanobrowser: Chrome/Edge extension, side panel, user's own API key, no backend.
- browser-use: Python library and CLI plus a paid hosted browser/agent cloud.
- Skyvern: platform, hosted or self-hosted (docker-compose, k8s) with API, SDKs, workflow builder.
- Jagora (hosted browser + web client) is closest to Skyvern and browser-use cloud. Plan: web app for the demo (full screen on desktop), then a desktop app (.exe) packaged later.
