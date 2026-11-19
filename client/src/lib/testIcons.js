/**
 * Small per-test icon, shown next to each test in the list. A clean 3D icon
 * for the categories a lab owner supplied one for; CategoryIcon (plain line
 * SVG) is still the fallback for everything else, so a category with no
 * icon here never renders blank. Keyed by category name, same as
 * categoryPhotos.jsx — they're independent so one can change without the
 * other.
 */
import thyroid from "../assets/test-icons/thyroid.png";
import kidney from "../assets/test-icons/kidney.png";
import fever from "../assets/test-icons/fever.png";
import infection from "../assets/test-icons/infection.png";
import heart from "../assets/test-icons/heart.png";
import hormones from "../assets/test-icons/hormones.png";
import liver from "../assets/test-icons/liver.png";
import vitamins from "../assets/test-icons/vitamins.png";
import diabetes from "../assets/test-icons/diabetes.png";
import routine from "../assets/test-icons/routine.png";

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
};

export default TEST_ICONS;
