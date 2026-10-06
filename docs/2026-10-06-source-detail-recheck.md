# Restored sources: access versus adopted passenger detail

Rechecked October 6 against live public pages and nine selected active production records. This is not an assertion that every page or hidden passenger-specific flight notification was searched.

| Source | Live public content checked | Current adoption and limits |
| --- | --- | --- |
| Trenord | News, notices, strike help page and official indexed line pages | The help page supplies weekday/Saturday 06–09 and 18–21, holiday 07–10 and 18–21 minimum-service bands, a guaranteed-train PDF, and EC82/83 information. These are useful candidate enrichment, currently **not integrated** into the six guarantee profiles or verified dated train lists. No future Trenord-specific production event was found; the latest indexed strike notice checked is October 2, already past. Do not project this onto RFI/security/customer-service or an unidentified national operator. |
| easyJet | All nine actual public help-page cards | No matching October 16 Italian crew notice or affected flight-number list found in these cards. Other travel information does not establish this strike's passenger impact. |
| Toscana Aeroporti | Complete public Italian news API index (32 articles) | Strike articles found are October 3 and June 20 **2025**, not October 16 **2026**. Neither provides dated detail for the current Pisa/Firenze event. This does not prove no announcement exists on other publisher channels. |
| CTM | Both comunicati and notizie indexes, current linked 64-page 2025–2026 service charter | No matching December 4 dated strike notice found. Charter promises essential services and notice at least five days ahead but does not specify strike guarantee clocks in the checked passages. Route changes for roadworks are unrelated. The older search-indexed charter URL returns 404; the current menu link is CTM_carta_dei_servizi.pdf. |
| CGSSE | Official easyJet October 16 detail, compared with actual stored row | The detail confirms 00:00–23:59, national aviation, USB and flight crew; no additional affected flight list. A real parser gap prevented this readable official detail from matching the event. Existing adopted CGSSE evidence on other events corroborates facts; access counts alone are not passenger-detail counts. |

## Minimal corrections

CGSSE detail pages use Drupal labelled fields under `#dettaglio-section`. The generic article parser could merge labels with values (e.g. `AziendaEASYJET`) and use the generic heading as geography, losing matching operator/national fields. Parse the single structured row, use event date rather than proclamation date, preserve explicit active/revoked status, separate provider/union/territory/sector/timing, and ignore other decisions and interventions. Missing/duplicate/changed required structure fails closed. Event/date/operator/union/geography matching remains in force; no widening or new AI stage.

Compare timing values by canonical field tuples rather than JSON object property order. PostgreSQL JSON key order must not manufacture a conflict between equal clock windows.

Register CTM's actual `notizie/` index alongside `comunicati/` so future announcements have both discovery paths. Both remain subject to dated-event and scope matching; generic charter/roadwork content cannot become strike facts.

No schema/API shape change and no UI edits. Based on Claude's committed `11b9969`; its UI is retained. Tests use the actual isolated official easyJet detail section and cover wrong union/geography, revocation, proclamation date, malformed/duplicate views, unrelated sections and database key ordering. 313 regression tests and TypeScript pass. Deployment or database adoption is only claimed after its separate live receipt.

The earlier statement “the recovered sites provide no detail” was too broad. More accurately: some offer reusable operator information; some currently corroborate already-known strike facts; the checked current pages do not yet supply more specific passenger impact for these future records. A functioning downloader is only one part of adoption.
