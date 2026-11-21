/**
 * Small per-test icon, shown next to each test in the list. A clean 3D icon
 * for the categories a lab owner supplied one for; CategoryIcon (plain line
 * SVG) is still the fallback for everything else, so a category with no
 * icon here never renders blank. Keyed by category name, same as
 * categoryPhotos.jsx — they're independent so one can change without the
 * other.
 */
import thyroid from "../assets/test-icons/thyroid.webp";
import kidney from "../assets/test-icons/kidney.webp";
import fever from "../assets/test-icons/fever.webp";
import infection from "../assets/test-icons/infection.webp";
import heart from "../assets/test-icons/heart.webp";
import hormones from "../assets/test-icons/hormones.webp";
import liver from "../assets/test-icons/liver.webp";
import vitamins from "../assets/test-icons/vitamins.webp";
import diabetes from "../assets/test-icons/diabetes.webp";
import routine from "../assets/test-icons/routine.webp";
import scans from "../assets/test-icons/scans.webp";
import allergy from "../assets/test-icons/allergy.webp";
import clotting from "../assets/test-icons/clotting.webp";
import markers from "../assets/test-icons/markers.webp";
import stool from "../assets/test-icons/stool.svg";
import urine from "../assets/test-icons/urine.webp";

const TEST_ICONS = {
  Thyroid: thyroid,
  Kidney: kidney,
  Fever: fever,
  Infection: infection,
  Heart: heart,
  Hormones: hormones,
  Liver: liver,
  Vitamins: vitamins,
  Diabetes: diabetes,
  Routine: routine,
  Scans: scans,
  Allergy: allergy,
  Clotting: clotting,
  Markers: markers,
  Stool: stool,
  Urine: urine,
};

export default TEST_ICONS;
