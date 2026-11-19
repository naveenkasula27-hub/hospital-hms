/**
 * One photo per health-checkup package, keyed by the package's own code
 * (server/src/seed/catalog.js), not its name — a lab can rename a package
 * without losing its photo. AI-generated for this project, not real stock
 * photos or real identifiable people, same reasoning as audience/category
 * photos elsewhere in this app.
 *
 * A package code with no entry here falls back to a generic photo rather
 * than rendering blank, so a lab's own custom package still looks finished.
 */
import basicHealth from "../assets/packages/basic-checkup.webp";
import fullBody from "../assets/packages/full-body-checkup.webp";
import diabetesPanel from "../assets/packages/diabetes-panel.webp";
import feverPanel from "../assets/packages/fever-panel.webp";
import thyroidPanel from "../assets/packages/thyroid-panel.webp";
import heartCheckup from "../assets/packages/heart-checkup.webp";
import pregnancy from "../assets/packages/pregnancy-checkup.webp";
import womensWellness from "../assets/packages/womens-wellness.webp";
import seniorCitizen from "../assets/packages/senior-checkup.webp";

const PACKAGE_PHOTOS = {
  basic_health: basicHealth,
  full_body: fullBody,
  diabetes_panel: diabetesPanel,
  fever_panel: feverPanel,
  thyroid_panel: thyroidPanel,
  heart_panel: heartCheckup,
  pregnancy_first: pregnancy,
  women_wellness: womensWellness,
  senior_citizen: seniorCitizen,
};

const FALLBACK = fullBody;

export function packageImage(code) {
  return PACKAGE_PHOTOS[code] || FALLBACK;
}
