import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * OWNER PHRASE CONTRACT (final cleanliness pass, §8).
 *
 * The sentences below are the ones the owner directive names verbatim as
 * "chat should understand this". They are pinned here because five of them
 * were measured routing WRONG against the real classifier — not missing, but
 * confidently wrong, which is worse:
 *
 *   "pridėk šiandienos darbą"                     → find-work   (a request to
 *      RECORD work opened a JOB SEARCH — the opposite of the ask, on the
 *      product's most-used worker action)
 *   "ką šiandien dariau?"                         → calendar-view (a question
 *      about the past answered with the day's plan)
 *   "kas vyksta mano objekte?"                    → log-work    (a question
 *      answered with a form)
 *   "parodyk tinkamiausius žmones šitam darbui"   → unknown     (the noun stem
 *      `žmoni` never occurs in the ordinary plural "žmones")
 *   "kas vyksta mano įmonėje?"                    → unknown
 *
 * A rule table is easy to widen and easy to break: every weight added for one
 * sentence can quietly steal another. This file is the negative control for
 * that — it fails the moment a future pattern re-routes any of these.
 */
const OWNER_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ["kokias galimybes man gali pasiūlyti?", "opportunities"],
  ["kas susidomėjo mano poreikiu?", "interest-inbox"],
  ["parodyk man tinkamiausius darbus", "find-work"],
  ["parodyk tinkamiausius žmones šitam darbui", "find-workers"],
  ["kur mano projektai?", "open-project"],
  ["mano projektai", "open-project"],
  ["ką turiu patvirtinti?", "admin-approvals"],
  ["pridėk šiandienos darbą", "log-work"],
  ["noriu pateikti prašymą", "admin-requests"],
  ["parašyk tam žmogui", "write-employer"],
  ["kas vyksta mano įmonėje?", "company-overview"],
  ["ką šiandien dariau?", "journal-recent"],
  ["kas vyksta mano objekte?", "open-project"],
];

describe("the sentences the owner named route to the right product surface", () => {
  it.each(OWNER_PHRASES)("%s → %s", (phrase, expected) => {
    expect(classifyIntent(phrase).intent).toBe(expected);
  });

  /**
   * NEGATIVE CONTROLS. The widened patterns above must not swallow the
   * sentences they sit next to — each of these is the nearest neighbour of a
   * rule this pass touched.
   */
  it.each([
    // The today-question still reads the day: no past-tense verb in it.
    ["ką šiandien turiu padaryti?", "calendar-view"],
    ["šiandienos planas", "calendar-view"],
    // Recording work is still recording work: "kas vyksta" is absent, so the
    // widened open-project pattern cannot claim it.
    ["šiandien dirbau objekte nuo 8 iki 17", "log-work"],
    // The hours question stays a journal read (the pre-existing precedent
    // the new past-tense pattern was modelled on).
    ["kiek valandų dirbau šiandien?", "journal-recent"],
    // Worker-side job search is untouched by the employer-side stem widening.
    ["rask man darbą Nyderlanduose", "find-work"],
  ])("negative control: %s stays %s", (phrase, expected) => {
    expect(classifyIntent(phrase).intent).toBe(expected);
  });
});
