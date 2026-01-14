/**
 * Step Order Constants
 * ============================================================================
 * Defines the execution order for all workflow steps.
 * Each phase has a reserved range to allow for future expansion.
 */

export const STEP_ORDER = {
  // =========================================================================
  // LEGACY WRITING WORKFLOW (1-99, 100-199, 200-299, 300+)
  // =========================================================================
  
  // Preprocessing (1-99)
  RESEARCH: 1,
  MASTER_OUTLINE: 2,
  CHARACTERS: 3,
  SETTINGS: 4,
  DETAILED_OUTLINE: 5,
  
  // Writing (100-199) - chapters use 100 + chapterNumber
  CHAPTER_BASE: 100,
  
  // Quality checks (200-299) - use 200 + chapterNumber
  QUALITY_CHECK_BASE: 200,
  
  // Postprocessing (300+)
  AI_CLEANUP: 300,
  CONTINUITY_CHECK: 301,
  PHONETIC_NORMALIZATION: 302,

  // =========================================================================
  // UNIVERSAL SCRIPT GENERATION (1000+)
  // =========================================================================
  
  // Phase 1: Research & Analysis (1000-1099)
  UNIVERSAL_TOPIC_DECOMPOSITION: 1000,
  UNIVERSAL_RESEARCH_SEARCH: 1010,
  UNIVERSAL_FACT_EXTRACTION: 1020,
  UNIVERSAL_FACT_VERIFICATION: 1030,
  UNIVERSAL_DOSSIER_ASSEMBLY: 1040,
  
  // Phase 2: Content Scoping & Duration (1100-1199)
  UNIVERSAL_CONTENT_DENSITY_ANALYSIS: 1100,
  UNIVERSAL_DURATION_CALCULATION: 1110,
  UNIVERSAL_CONTENT_ALLOCATION: 1120,
  
  // Phase 3: Spine Generation (1200-1299)
  UNIVERSAL_SPINE_SECTIONS: 1200,
  UNIVERSAL_SPINE_ENGAGEMENT_ANCHORS: 1210,
  UNIVERSAL_SPINE_BEAT_GENERATION: 1220,
  UNIVERSAL_SPINE_VALIDATION: 1230,
  
  // Phase 4: Asset Registry (1300-1399)
  UNIVERSAL_ASSET_ENTITY_SCAN: 1300,
  UNIVERSAL_ASSET_CHARACTER_PROFILES: 1310,
  UNIVERSAL_ASSET_LOCATION_PROFILES: 1320,
  UNIVERSAL_ASSET_OBJECT_PROFILES: 1330,
  UNIVERSAL_ASSET_CONSISTENCY_RULES: 1340,
  
  // Phase 5: Script Expansion (1400-1499) - beats use 1400 + beatIndex
  UNIVERSAL_EXPANSION_BEAT_BASE: 1400,
  
  // Phase 6: Assembly & Validation (1500-1599)
  UNIVERSAL_ASSEMBLY_CONCATENATE: 1500,
  UNIVERSAL_ASSEMBLY_SMOOTH_TRANSITIONS: 1510,
  UNIVERSAL_QUALITY_FACTUAL_CHECK: 1520,
  UNIVERSAL_QUALITY_CONSISTENCY_CHECK: 1530,
  UNIVERSAL_QUALITY_ENGAGEMENT_CHECK: 1540,
  UNIVERSAL_QUALITY_COMPLETENESS_CHECK: 1550,
  UNIVERSAL_QUALITY_ANTI_FILLER_CHECK: 1560,
  UNIVERSAL_OUTPUT_FORMATTING: 1570,
} as const;

/**
 * Phase names for the universal script generation system
 */
export const UNIVERSAL_PHASES = {
  RESEARCH: 'research',
  SCOPING: 'scoping',
  SPINE: 'spine_generation',
  ASSETS: 'asset_registry',
  EXPANSION: 'script_expansion',
  ASSEMBLY: 'assembly_validation',
} as const;

export type UniversalPhase = typeof UNIVERSAL_PHASES[keyof typeof UNIVERSAL_PHASES];
