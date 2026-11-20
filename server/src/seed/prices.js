/**
 * Starting prices for demo labs, so a fresh page does not look empty.
 *
 * Kept out of seed.js so both the Nandu seed and the public demo seed can use
 * them without one importing the other and running it.
 *
 * These are plausible Telangana small-lab prices, not a real price list. A real
 * lab sets its own from the dashboard.
 */
export const DEMO_PRICES = {
  cbc: 300, hb: 100, esr: 100, bloodgroup: 150, crp: 500,
  platelet: 100, pbs: 150, retic: 200, crp_hs: 600, pct: 1800,
  fbs: 80, ppbs: 80, rbs: 80, hba1c: 500, ogtt: 300,
  insulin_f: 600, cpeptide: 1200, fructosamine: 500,
  lipid: 600, chol_total: 200, triglycerides: 200,
  hdl: 150, ldl: 150, apo_ab: 1200, lpa: 1500, homocysteine: 900,
  trop_i: 800, ck_mb: 500, bnp: 2500,
  lft: 700, sgpt: 200, sgot: 200, bilirubin: 200,
  alk_phos: 200, ggt: 250, protein_alb: 200,
  kft: 700, creatinine: 150, urea: 150, uric_acid: 200,
  bun: 150, egfr: 100, cystatin_c: 1500, microalbumin: 500, acr: 500,
  tsh: 250, thyroid_profile: 500, ft3_ft4: 600, anti_tpo: 700,
  prolactin: 600, testosterone: 600, estradiol: 600, fsh_lh: 700,
  amh: 2200, cortisol: 600, pth: 1500, hcg_beta: 500,
  vit_d: 1200, vit_b12: 1100, iron_studies: 900, ferritin: 700, calcium: 200,
  folate: 900, magnesium: 300, phosphorus: 200, electrolytes: 400, zinc: 1000,
  widal: 250, malaria_card: 300, malaria_smear: 200, dengue_ns1: 700, dengue_igm: 800, typhidot: 500,
  chikungunya: 900, scrub_typhus: 1200, leptospira: 1200, blood_culture: 900,
  hiv: 400, hbsag: 400, hcv: 500, hav_igm: 600, hev_igm: 700, vdrl: 250,
  mantoux: 300, tb_gold: 2800, covid_rtpcr: 500, covid_antigen: 250,
  urine_routine: 150, urine_culture: 600, urine_preg: 150, urine_24h_protein: 400,
  stool_routine: 200, stool_occult: 250, stool_culture: 600,
  pt_inr: 400, aptt: 400, ddimer: 900, fibrinogen: 700, bleeding_clotting: 150,
  ige_total: 900, ana: 900, ra_factor: 500, aso: 500, ccp: 1500,
  psa: 800, ca125: 1100, cea: 900, afp: 900, ca15_3: 1500, ca19_9: 1500,
  xray_chest: 350, usg_abdomen: 900, usg_preg: 800, ecg: 200, echo: 1200, tmt: 1500,
};

export const DEMO_PACKAGE_PRICES = {
  basic_health: 1500,
  full_body: 3500,
  diabetes_panel: 1400,
  fever_panel: 1200,
  thyroid_panel: 1100,
  heart_panel: 2800,
  pregnancy_first: 2500,
  women_wellness: 3200,
  senior_citizen: 4200,
};
