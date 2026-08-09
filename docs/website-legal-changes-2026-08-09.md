# livralife.com — legal page changes owed

For the website repo's agent. Prepared 2026-08-09 from the live pages (loaded,
not inferred) and the in-app documents as shipped in `43571ff`, `58cfcf6`,
`df35984`.

Live pages read: `/terms` (Last updated August 2, 2026) and `/privacy` (Last
updated August 6, 2026).

Six changes. **Change 1 is a factual error and the only urgent one** — the rest
are under-disclosure or fragility. Every "REPLACE WITH" block below is final
text; paste it, do not paraphrase. Bump each page's "Last updated" to the date
you publish.

---

## 1. `/terms` § 7 — WRONG. Health data does leave the device.

**Currently on the live page:**

> If you connect Apple Health, health data is read on your device only, as described in the Privacy Policy.

This has been untrue since health auto-sync shipped on 2026-08-05. A qualifying
day writes a check-in row to our servers. The in-app privacy policy § 1.4 was
corrected for exactly this on 2026-08-05, and the in-app Terms § 7 on
2026-08-09; the website kept the old sentence. **This is the same claim this
project has already retracted twice — do not let a third version survive.**

**REPLACE WITH:**

> **7. Apple Health (Optional).** Connecting Apple Health is optional, is part of Livra+, and always starts with the iOS permission prompt. Livra checks your readings on your device and keeps only whether a day met your mark; when a day qualifies, Livra creates a check-in that syncs to our servers like any other check-in. The Privacy Policy describes this in full. Livra is not a medical device. Reflections and suggestions based on this data are informational, not medical advice.

---

## 2. `/privacy` § 2.1 — under-disclosure. Typed goal text is RETAINED, not just relayed.

**Currently on the live page:**

> When you use AI goal generation, the goal text you type and any optional context you add (up to 400 characters) are sent through our server to OpenAI to generate your plan.

"Sent through our server" describes transit only. `ai_goal_packages` retains the
goal text verbatim, a normalized copy, and the generated plan. § 6 mentions "AI
packages" in the deletion list, which implies storage without ever disclosing
it.

**KEEP the sentence above, then APPEND:**

> When you create a goal from a draft, Livra saves the goal text you typed, a simplified copy of that text used to recognise repeat requests, and the generated plan, in your account on our servers. Asking for the same goal again returns that saved plan instead of calling the model a second time. A draft you discard is not saved. Database access rules limit these records to your own account.

---

## 3. `/privacy` § 4 — WRONG NOW. The 30-day window does not apply to us.

**Currently on the live page:**

> Per OpenAI's API terms, API data is **not used to train OpenAI's models** and is retained by OpenAI for up to 30 days for abuse monitoring, then deleted

The founder confirmed on 2026-08-09 that the Livra OpenAI organisation has **not
opted in to data sharing** and that **Zero Data Retention is enabled**. Under
ZDR, OpenAI does not store the request after answering, so the 30-day
abuse-monitoring window does not apply to our traffic. The sentence describes
ordinary API use, not ours.

**REPLACE WITH:**

> We have not opted in to data sharing, so OpenAI does not use what we send to train or improve its models. Our account also has Zero Data Retention enabled, which means OpenAI does not store the request after it answers; the 30-day abuse-monitoring window that applies to ordinary API use does not apply to ours.

---

## 4. `/privacy` § 6 — same 30-day error, plus the deletion route is now out of date.

**Currently on the live page, two problems in one section.**

**4a.** Delete this sentence entirely — it is the same ZDR error as Change 3:

> OpenAI retains AI-generation inputs/outputs for up to 30 days for abuse monitoring, then deletes them

Change 3's replacement already states the correct position; do not restate it
here.

**4b.** The section says account deletion removes everything, which is true, but
there is now a per-item control that did not exist when the page was written.

**APPEND to § 6:**

> You can also remove your saved AI goal drafts at any time without deleting your account, from Settings › Data › Delete Saved AI Drafts in the App. This removes every saved goal text from your account and does not affect the goals or marks you have already created. Deleting a goal on its own does not remove the saved text.

---

## 5. `/subscription-terms` — hardcoded prices are a liability.

**Currently on the live page:**

> $3.99 per month (USD) … $24.99 per year (USD)

These go false the moment a price changes, and they are already wrong for
non-US storefronts even though the page notes that regional pricing varies. The
in-app Terms deliberately state no number for this reason.

**REPLACE the figures WITH:**

> Livra+ is offered as a monthly plan and an annual plan. The price and currency for your plan are shown on the purchase screen before you confirm, and vary by App Store storefront.

Not urgent, but it is the kind of clause that quietly becomes untrue without
anyone editing it.

---

## 6. Free-tier limits appear on neither live page.

The in-app Terms § 5 states them and they are what RLS enforces
(`lib/gating.ts`): 2 concurrent goals, 6 marks per account, 4 marks on any one
goal.

**ADD to `/terms` § 8, or to `/subscription-terms`:**

> A free account can run 2 goals at a time and hold up to 6 marks in total, with up to 4 marks on any one goal. Livra+ removes these limits.

---

## One caution for whoever publishes this

Changes 3 and 4a rest on two **OpenAI dashboard toggles** — data-sharing opt-in
and Zero Data Retention — not on anything in a repo. They were founder-confirmed
on 2026-08-09. If either is ever changed in the OpenAI account, both pages and
the in-app policy § 1.5 become wrong with no commit anywhere to signal it.
Re-confirm before restating them in any future revision.

---

## What is NOT owed

`/privacy` already names OpenAI, the 400-character context limit, and US
processing. `/terms` § 8's one-line subscription clause pointing at
`/subscription-terms` is fine as a structure — the in-app document carries the
detail inline because App Review reads the screen rather than following the
link, which is a different constraint, not a contradiction.
