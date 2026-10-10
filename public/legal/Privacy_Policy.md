# Ownly — Privacy Policy

*Last updated: October 2026*

> **Status: derived from the live, in-app Legal page** (src/messages/en.json, `legalPage.privacy` and `legalPage.pdpl`) — this file mirrors that canonical content, merged into one standalone document for external use. The in-app page at /legal is the always-current version; update that source first, then regenerate this file.

> Ownly is a brand operated by its founding team, currently completing incorporation as a licensed entity in Meydan Free Zone, Dubai, UAE. This page will be updated with the full registered legal name and trade license number once incorporation is complete.

---

## 1. What we collect

Account information (name, email or phone number); for children enrolled by a parent/guardian or nursery, the child's first name, a reference photo, and story preferences (e.g. language, pronoun); and basic usage data (pages viewed, stories generated) to operate the service.

## 2. Why we collect it

To create your account, generate the personalized storybooks you request, process payments, send service-related notifications, and provide support when you contact us.

## 3. Who can see it

Your data is isolated to your own account or Organisation by database-level access controls — it is never visible to other families or other Organisations on Ownly. Within an Organisation account, only invited staff with an active role can see that Organisation's children and stories.

## 4. Third parties we use

Google (Gemini API) to generate story text and illustrations; Supabase to host our database, authentication, and file storage; Stripe to process payments; Twilio to deliver SMS login codes; and Resend to deliver account emails. Each of these providers only receives the data necessary to perform its specific function.

## 5. Printed storybooks and shipping

If you order a printed copy of a storybook, we share only what's needed to fulfil that order — the recipient's name, phone number, and delivery address, and the approved story file itself — with our printing and/or courier partner(s). We require these partners to use that information solely to produce and deliver your order, and not to store, sell, or otherwise use it for any other purpose (see our DPA_Schedule.md template in /contracts, required of every such partner before they receive any order data). We never share a child's reference photo with a printing or logistics partner — only the finished, already-illustrated storybook file.

## 6. Where your data is processed

Our database, authentication, and file storage are hosted by Supabase in AWS's ap-southeast-1 region (Singapore); our application itself runs on Vercel's global edge network. This means all account, child, and story data is processed outside the UAE, not only the specific illustration requests sent to Google's Gemini API below. We only work with providers that maintain appropriate data protection safeguards, and this is one of the specific items flagged for formal legal review — see the "UAE PDPL Compliance" section below.

## 7. How long we keep it

Organisations can configure a data retention period in Settings (730 days / 24 months by default); child and story data is scheduled for deletion once that period elapses. If you request deletion of your account, a child's record, or your data generally, we commit to completing that deletion within 30 days of a verified request, even if it falls before your organisation's configured retention period would otherwise trigger it — see "Your rights" below.

## 8. Your rights

You can request access to, correction of, export of, or deletion of your personal data at any time. See the "UAE PDPL Compliance" section below for the full list of your rights under UAE law and how to exercise them.

## 9. Children's data

A child's photo and name are only ever processed with the explicit, informed consent of a parent or legal guardian, collected through our in-app consent flow before any image is generated. We never use a child's photo, name, or story data for advertising or behavioural profiling.

## 10. Security

Data is encrypted in transit. Story images are served only through short-lived, private signed links, never public URLs. Optional two-factor authentication (MFA) is available on every account, and mandatory for account owners handling billing.

## 11. Contact us

For any privacy question or request, reach out on our /contact page and we'll get back to you.

## UAE PDPL Compliance

### 12. Our commitment

Ownly is committed to complying with UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data ("PDPL") in how we collect, process, and store personal data, including children's data.

### 13. Legal basis for processing

We process account data on the basis of our contract with you (delivering the service you signed up for). We process a child's photo and personal details only on the basis of explicit consent, collected from a parent or legal guardian before that data is used.

### 14. Your rights under the PDPL

You have the right to: access the personal data we hold about you or your child; request correction of inaccurate data; request erasure of your data; object to or restrict certain processing; request a copy of your data in a portable format; and withdraw consent at any time (which may limit your ability to use features that depend on that data).

### 15. How to exercise your rights

Contact us via our /contact page with your request. We will verify your identity and respond within a reasonable timeframe consistent with PDPL requirements.

### 16. Cross-border data transfer

Our core infrastructure (database, authentication, file storage) is hosted outside the UAE, in AWS's ap-southeast-1 (Singapore) region via Supabase — this applies to all account, child, and story data, not only AI processing. Generating story content additionally involves sending relevant data to Google's Gemini API, which may process it outside the UAE. If you order a printed storybook, your name, phone number, and delivery address are also shared with our printing/logistics partner, strictly bound by a data processing agreement (see /contracts/DPA_Schedule.md) to use that data only to fulfil your order. The specific legal basis for each of these transfers is under active review with qualified UAE counsel — see our Data Protection Impact Assessment for the current status.

### 17. Data breach notification

In the event of a data breach affecting your personal data, we will notify affected users and, where required by law, the relevant UAE data protection authority, without undue delay — our internal breach-response procedure targets notifying the authority no later than 72 hours after a breach is confirmed, pending confirmation of the exact UAE PDPL deadline with counsel.

### 18. Data protection contact

Our designated data protection contact point will be published here once our Meydan Free Zone incorporation is complete. Until then, direct any request through our /contact page.

