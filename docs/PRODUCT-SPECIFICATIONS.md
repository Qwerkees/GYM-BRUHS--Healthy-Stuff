# GYM BRUHS — Healthy Stuff — Product Specifications
Version 0.1 | App baseline described in README; production controls require verification | 2026-11-18

## Product purpose
A gym-oriented healthy-snack ordering platform: members browse and customize snacks, pay or pay at the counter, and collect orders using a QR code.

## Verified repository baseline (README)
- 18 items across 5 categories; English/Spanish toggle.
- Member QR ordering; staff code scan/manual entry; paid, ready, picked-up workflow.
- Server-side pricing; optional Stripe; local SQLite or hosted Postgres; staff PIN; PWA.
- README describes API and browser tests; demo payments are local only.
- The earlier dark + lime visual direction has been replaced with a light-only lime/orange palette in `public/styles.css` (commit `992e148e7979a49a3a753572d01752cadc63ac8c`). The matching production deployment reached READY. Runtime behavior and every page/state still require manual acceptance testing.

## Functional requirements
1. Browse products with ingredients, allergens, portion, price, and verified nutrition data.
2. Customize supported options; calculate totals server-side.
3. Create unique, time-limited pickup code/QR.
4. Distinguish pay-at-counter, sandbox, and live payment.
5. Staff authenticate and move orders through allowed states with audit history.
6. Maintain English/Spanish content parity.
7. Admin manages menu, availability, pricing, and order status.

## Security, nutrition and payments
Never trust client-supplied prices or payment status. Verify payment webhooks server-side; never store card data. Hash and rate-limit staff PINs. Prevent QR replay and unrelated order disclosure. Nutrition/allergen claims need sources and review dates; no medical or weight-loss guarantees. Demo and live modes must be distinct.

## Acceptance criteria
End-to-end member/staff tests pass; price tampering and unauthorized status changes are rejected; QR cannot expose other customers; both languages complete; sandbox/live payment modes verified independently; all UI states use light backgrounds.

## Roadmap (proposed)
Verified nutrition catalog; ingredient/allergen filters; kitchen prep queue; inventory/waste reporting; multi-gym tenant isolation; subscription entitlements if commercialized.

## CUSTOMER-SPECIFIC REQUIREMENTS
| Field | Customer input |
|---|---|
| Customer / Organization | |
| Primary Contact | |
| Contact Information | |
| Business Requirements | |
| Requested Features | |
| Custom Integrations | |
| Branding / White-labeling | |
| User Roles and Permissions | |
| Security / Compliance Requirements | |
| Hosting / Deployment Requirements | |
| Budget / Contract Reference | |
| Delivery Schedule | |
| Acceptance Criteria | |
| Special Instructions | |
| Customer Approval / Sign-off | |

Keep member records, payment credentials, and customer-specific pricing private; do not add them to this public repository.

## Revision history
| Version | Date | Change | Approval |
|---|---|---|---|
| 0.1 | 2026-11-18 | Initial baseline; light-only correction recorded | Pending |

## Global owner standards
Light-only UI; separate database/credentials per product; privacy-first; no paid upgrades without approval; free tier remains useful if subscriptions are introduced.