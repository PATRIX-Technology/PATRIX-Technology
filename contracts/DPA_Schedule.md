# Data Processing Agreement (Schedule 2 to the Logistics & Print Fulfilment Agreement)

**Status: DRAFT TEMPLATE — not a signed contract.** Review by qualified UAE
counsel before use. This schedule attaches to and forms part of
`Logistics_Agreement.md` with any printing or courier partner — it is not a
stand-alone document and should not be executed separately.

---

This Data Processing Agreement ("**DPA**") is entered into between **Ownly**
("**Controller**") and **[Vendor legal name]** ("**Processor**") as Schedule 2
to the Logistics & Print Fulfilment Agreement dated **[Date]** (the
"**Agreement**"), governing the Processor's handling of personal data under
UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data
("**PDPL**").

## 1. Roles

The Controller determines the purposes and means of processing the personal
data described below. The Processor processes that data only on the
Controller's documented instructions, as set out in this DPA and the
Agreement.

## 2. Personal data in scope

The Processor may receive, for the sole purpose of fulfilling a specific
customer order:

- The end customer's **full name**;
- The end customer's **mobile phone number**;
- The end customer's **physical delivery address**; and
- The **finished, already-illustrated storybook file** (PDF or print-ready
  format) for that order.

**The Processor will never receive**: the child's reference photo, the
child's name, the child's date of birth, any payment card data, or any
account credentials. If the Processor believes it has received any of these
in error, it must notify the Controller immediately and delete the data
without using it.

## 3. Purpose limitation — the core obligation

The Processor will use the personal data in Section 2 **solely** to produce
and/or deliver the specific order it relates to. Specifically, the Processor
must **not**:

- **Store** the personal data for any longer than is necessary to complete
  that order and any legally required post-delivery proof-of-delivery record
  (maximum **[90] days** after delivery, unless a longer period is required
  by applicable law, in which case only that longer period applies);
- **Use** the personal data for the Processor's own marketing, analytics,
  product development, or any purpose other than fulfilling the specific
  order;
- **Sell, rent, license, or otherwise disclose** the personal data to any
  third party, except a sub-processor engaged under Section 6 strictly for
  the same order, or where required by law (in which case the Processor must
  notify the Controller first, unless legally prohibited from doing so);
- **Combine** the personal data with any other data set the Processor holds
  (its own customer list, other clients' orders, etc.) to build a profile of
  the individual; or
- **Leak, expose, or allow unauthorised access** to the personal data through
  inadequate security — see Section 5.

A breach of this Section is a material breach of the Agreement entitling the
Controller to terminate immediately under Agreement clause 8.

## 4. Deletion

The Processor must permanently delete all personal data in scope (including
backups, to the extent technically feasible within normal backup-rotation
cycles) once the retention period in Section 3 expires, and in any event
within **[30] days** of the Agreement terminating, and must confirm deletion
to the Controller in writing on request.

## 5. Security measures

The Processor must implement appropriate technical and organisational
measures to protect the personal data, including at minimum:

- Encryption of the personal data in transit and, where stored, at rest;
- Access limited to Processor personnel who need it to fulfil the specific
  order, on a need-to-know basis;
- A documented process for detecting and responding to a security incident;
  and
- No personal data transmitted or stored via unsecured consumer messaging
  apps, personal email accounts, or personal devices.

## 6. Sub-processors

The Processor must not engage any sub-processor to handle the personal data
(e.g. a last-mile courier subcontracted by a printing partner) without the
Controller's prior written consent, and must impose data-protection
obligations on that sub-processor no less protective than this DPA. The
Processor remains fully liable to the Controller for any sub-processor's
acts or omissions.

## 7. Data subject rights

If the Processor receives a request from an individual to access, correct,
or delete their personal data, the Processor must forward it to the
Controller within **[2] business days** without responding to it directly,
since the Controller is responsible for fulfilling PDPL data-subject rights.
The Processor must reasonably assist the Controller in responding to such
requests concerning data the Processor holds.

## 8. Breach notification

The Processor must notify the Controller **without undue delay, and in any
event within [48] hours** of becoming aware of any actual or suspected
unauthorised access to, loss of, or disclosure of the personal data,
including: what happened, what data was affected, how many individuals are
affected, and what the Processor has done or will do to contain it. The
Controller is solely responsible for any notification to affected
individuals or to the relevant UAE data protection authority.

## 9. Audit

On reasonable written notice, the Controller (or an auditor it appoints) may
request evidence of the Processor's compliance with this DPA, and the
Processor will provide it or reasonably cooperate with an audit, no more
than **[once per 12 months]** absent a suspected breach.

## 10. Cross-border transfer

If the Processor processes or stores the personal data outside the UAE
(including via a sub-processor), it must disclose this to the Controller in
writing and confirm it maintains safeguards consistent with PDPL's
cross-border transfer requirements before any such transfer occurs.

## 11. Survival

This DPA survives termination of the Agreement for as long as the Processor
holds any personal data in scope, notwithstanding Agreement clause 8.

---

**Signed for and on behalf of Ownly (Controller):**
Name: _______________________  Title: _______________________  Date: _______

**Signed for and on behalf of the Processor:**
Name: _______________________  Title: _______________________  Date: _______

---

*This template was drafted to reflect Ownly's actual order data flow (see
`docs/DECISIONS.md` and `supabase/migrations/0037_print_orders.sql`) and the
UAE PDPL analysis already performed for Ownly's AI photo-processing (see the
"Ownly - Data Protection Impact Assessment (DPIA)" document). It has not been
reviewed by a licensed UAE lawyer and must be before use with any real
vendor — particularly the bracketed retention and notification periods,
which should be set to match counsel's advice and the vendor's actual
operational capability, not left at these placeholder defaults.*
