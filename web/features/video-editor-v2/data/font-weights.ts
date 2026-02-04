/**
 * Font Weight Availability Data
 * 
 * This file contains information about which font weights are available
 * for each Google Font. This allows the UI to only show valid weight options.
 * 
 * Source: Google Fonts API
 */

export interface FontWeightInfo {
  value: string;
  label: string;
}

export const ALL_FONT_WEIGHTS: FontWeightInfo[] = [
  { value: "100", label: "Thin" },
  { value: "200", label: "Extra Light" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semi Bold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra Bold" },
  { value: "900", label: "Black" },
];

/**
 * Maps font family names to their available weights
 * Weights are stored as arrays of weight values (100-900)
 */
export const FONT_WEIGHT_AVAILABILITY: Record<string, string[]> = {
  // Variable fonts with all weights
  "Roboto": ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  "Open Sans": ["300", "400", "500", "600", "700", "800"],
  "Lato": ["100", "300", "400", "700", "900"],
  "Montserrat": ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  "Poppins": ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  "Inter": ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  "Raleway": ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  "Ubuntu": ["300", "400", "500", "700"],
  "Nunito": ["200", "300", "400", "500", "600", "700", "800", "900"],
  "Nunito Sans": ["200", "300", "400", "500", "600", "700", "800", "900"],
  "Work Sans": ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  "Quicksand": ["300", "400", "500", "600", "700"],
  "Rubik": ["300", "400", "500", "600", "700", "800", "900"],
  "Source Sans 3": ["200", "300", "400", "500", "600", "700", "800", "900"],
  "Source Sans Pro": ["200", "300", "400", "600", "700", "900"],
  "DM Sans": ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  "Mulish": ["200", "300", "400", "500", "600", "700", "800", "900"],
  "Manrope": ["200", "300", "400", "500", "600", "700", "800"],
  "Outfit": ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  "Plus Jakarta Sans": ["200", "300", "400", "500", "600", "700", "800"],
  "Lexend": ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  
  // Serif fonts
  "Playfair Display": ["400", "500", "600", "700", "800", "900"],
  "Merriweather": ["300", "400", "700", "900"],
  "Lora": ["400", "500", "600", "700"],
  "PT Serif": ["400", "700"],
  "Noto Serif": ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  "EB Garamond": ["400", "500", "600", "700", "800"],
  "Libre Baskerville": ["400", "700"],
  "Crimson Text": ["400", "600", "700"],
  "Bitter": ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  "Source Serif 4": ["200", "300", "400", "500", "600", "700", "800", "900"],
  "Georgia": ["400", "700"], // System font
  "Times New Roman": ["400", "700"], // System font
  
  // Display fonts
  "Bebas Neue": ["400"],
  "Pacifico": ["400"],
  "Dancing Script": ["400", "500", "600", "700"],
  "Comfortaa": ["300", "400", "500", "600", "700"],
  "Lobster": ["400"],
  "Caveat": ["400", "500", "600", "700"],
  "Anton": ["400", "700"],
  "Righteous": ["400"],
  "Satisfy": ["400"],
  "Great Vibes": ["400"],
  "Oswald": ["200", "300", "400", "500", "600", "700"],
  
  // Monospace fonts
  "Roboto Mono": ["100", "200", "300", "400", "500", "600", "700"],
  "Fira Code": ["300", "400", "500", "600", "700"],
  "JetBrains Mono": ["100", "200", "300", "400", "500", "600", "700", "800"],
  "Source Code Pro": ["200", "300", "400", "500", "600", "700", "800", "900"],
  "IBM Plex Mono": ["100", "200", "300", "400", "500", "600", "700"],
  "Inconsolata": ["200", "300", "400", "500", "600", "700", "800", "900"],
  
  // System fonts (conservative weights)
  "Arial": ["400", "700"],
  "Helvetica": ["300", "400", "700"],
  "Verdana": ["400", "700"],
  "Comic Sans MS": ["400", "700"],
  "PT Sans": ["400", "700"],
};

/**
 * Get available font weights for a given font family
 * Falls back to standard weights if font is not in the database
 */
export function getAvailableWeights(fontFamily: string): FontWeightInfo[] {
  const availableWeights = FONT_WEIGHT_AVAILABILITY[fontFamily];
  
  if (availableWeights) {
    return ALL_FONT_WEIGHTS.filter(w => availableWeights.includes(w.value));
  }
  
  // Default: assume standard weights (400, 700) are available
  return ALL_FONT_WEIGHTS.filter(w => ["400", "700"].includes(w.value));
}

/**
 * Check if a specific weight is available for a font
 */
export function isWeightAvailable(fontFamily: string, weight: string): boolean {
  const availableWeights = FONT_WEIGHT_AVAILABILITY[fontFamily];
  
  if (availableWeights) {
    return availableWeights.includes(weight);
  }
  
  // Default: assume 400 and 700 are always available
  return weight === "400" || weight === "700";
}

/**
 * Get the closest available weight for a font
 * Used when the user's selected weight isn't available
 */
export function getClosestWeight(fontFamily: string, desiredWeight: string): string {
  const availableWeights = FONT_WEIGHT_AVAILABILITY[fontFamily] || ["400", "700"];
  
  if (availableWeights.includes(desiredWeight)) {
    return desiredWeight;
  }
  
  // Find the closest available weight
  const desiredNum = parseInt(desiredWeight, 10);
  let closest = availableWeights[0];
  let minDiff = Math.abs(parseInt(closest, 10) - desiredNum);
  
  for (const weight of availableWeights) {
    const diff = Math.abs(parseInt(weight, 10) - desiredNum);
    if (diff < minDiff) {
      minDiff = diff;
      closest = weight;
    }
  }
  
  return closest;
}
