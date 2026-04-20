/**
 * indianStates.ts
 * ----------------------------------------------------------------------------
 * Single source of truth for the State / Union Territory dropdown used on
 * the Eligibility form. Sorted alphabetically (28 states + 8 UTs = 36 entries)
 * so the <Select> options render in a predictable order.
 *
 * The values stored in user form state are the human-readable names — these
 * also map 1:1 to entries in `schemes.allowed_states`, so equality checks in
 * the scorer are trivial string comparisons.
 */

export const INDIAN_STATES_AND_UTS: readonly string[] = [
  // ---- 28 States (alphabetical) ----
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  // ---- 8 Union Territories (alphabetical, merged into the same sorted list) ----
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
].sort((a, b) => a.localeCompare(b));
