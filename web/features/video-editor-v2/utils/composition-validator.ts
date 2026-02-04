/**
 * Composition Validator
 * 
 * Runtime validation for CompositionDefinition to ensure data integrity
 * before saving or rendering.
 */

import type {
  CompositionDefinition,
  CompositionLayer,
  CompositionLayerType,
  LayerTransform,
  TextLayerProperties,
  ShapeLayerProperties,
  SolidLayerProperties,
  ImageLayerProperties,
  DEFAULT_LAYER_TRANSFORM,
} from '../types/composition';

// ============================================================
// TYPES
// ============================================================

export interface ValidationError {
  layerId?: string;
  layerName?: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ============================================================
// LAYER TYPE VALIDATORS
// ============================================================

function validateTextProperties(props: any): string[] {
  const errors: string[] = [];
  
  if (typeof props.text !== 'string') {
    errors.push('text property must be a string');
  }
  if (props.fontSize !== undefined && typeof props.fontSize !== 'number') {
    errors.push('fontSize must be a number');
  }
  if (props.fontWeight !== undefined && typeof props.fontWeight !== 'number') {
    errors.push('fontWeight must be a number');
  }
  if (props.color !== undefined && typeof props.color !== 'string') {
    errors.push('color must be a string');
  }
  
  return errors;
}

function validateShapeProperties(props: any): string[] {
  const errors: string[] = [];
  
  if (props.width !== undefined && typeof props.width !== 'number') {
    errors.push('width must be a number');
  }
  if (props.height !== undefined && typeof props.height !== 'number') {
    errors.push('height must be a number');
  }
  if (props.fillColor !== undefined && typeof props.fillColor !== 'string') {
    errors.push('fillColor must be a string');
  }
  
  return errors;
}

function validateSolidProperties(props: any): string[] {
  const errors: string[] = [];
  
  if (props.width !== undefined && typeof props.width !== 'number') {
    errors.push('width must be a number');
  }
  if (props.height !== undefined && typeof props.height !== 'number') {
    errors.push('height must be a number');
  }
  if (props.color !== undefined && typeof props.color !== 'string') {
    errors.push('color must be a string');
  }
  
  return errors;
}

function validateImageProperties(props: any): string[] {
  const errors: string[] = [];
  
  if (typeof props.src !== 'string') {
    errors.push('src property must be a string');
  }
  if (props.width !== undefined && typeof props.width !== 'number') {
    errors.push('width must be a number');
  }
  if (props.height !== undefined && typeof props.height !== 'number') {
    errors.push('height must be a number');
  }
  
  return errors;
}

// ============================================================
// TRANSFORM VALIDATOR
// ============================================================

function validateTransform(transform: any): string[] {
  const errors: string[] = [];
  const keys: (keyof LayerTransform)[] = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'anchorX', 'anchorY'];
  
  for (const key of keys) {
    if (transform[key] !== undefined && typeof transform[key] !== 'number') {
      errors.push(`transform.${key} must be a number`);
    }
  }
  
  // Validate ranges
  if (typeof transform.opacity === 'number' && (transform.opacity < 0 || transform.opacity > 1)) {
    errors.push('transform.opacity must be between 0 and 1');
  }
  if (typeof transform.anchorX === 'number' && (transform.anchorX < 0 || transform.anchorX > 1)) {
    errors.push('transform.anchorX must be between 0 and 1');
  }
  if (typeof transform.anchorY === 'number' && (transform.anchorY < 0 || transform.anchorY > 1)) {
    errors.push('transform.anchorY must be between 0 and 1');
  }
  
  return errors;
}

// ============================================================
// LAYER VALIDATOR
// ============================================================

function validateLayer(layer: any, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const layerId = layer.id || `layer-${index}`;
  const layerName = layer.name || `Layer ${index}`;
  
  // Required fields
  if (!layer.id) {
    errors.push({
      layerId,
      layerName,
      field: 'id',
      message: 'Layer is missing id',
      severity: 'error',
    });
  }
  
  if (!layer.type) {
    errors.push({
      layerId,
      layerName,
      field: 'type',
      message: 'Layer is missing type',
      severity: 'error',
    });
  }
  
  // Validate timing
  if (typeof layer.startTime !== 'number' || layer.startTime < 0) {
    errors.push({
      layerId,
      layerName,
      field: 'startTime',
      message: 'startTime must be a non-negative number',
      severity: 'error',
    });
  }
  
  if (typeof layer.duration !== 'number' || layer.duration <= 0) {
    errors.push({
      layerId,
      layerName,
      field: 'duration',
      message: 'duration must be a positive number',
      severity: 'error',
    });
  }
  
  // Validate transform
  if (layer.transform) {
    const transformErrors = validateTransform(layer.transform);
    for (const err of transformErrors) {
      errors.push({
        layerId,
        layerName,
        field: 'transform',
        message: err,
        severity: 'error',
      });
    }
  }
  
  // Validate layer type consistency
  if (layer.layerProperties) {
    const propsType = layer.layerProperties.type;
    const layerType = layer.type;
    
    if (propsType && propsType !== layerType) {
      errors.push({
        layerId,
        layerName,
        field: 'layerProperties.type',
        message: `Layer type mismatch: layer.type is '${layerType}' but layerProperties.type is '${propsType}'`,
        severity: 'error',
      });
    }
    
    // Validate type-specific properties
    const props = layer.layerProperties.properties || layer.layerProperties;
    let propErrors: string[] = [];
    
    switch (layerType) {
      case 'text':
        propErrors = validateTextProperties(props);
        break;
      case 'shape':
        propErrors = validateShapeProperties(props);
        break;
      case 'solid':
        propErrors = validateSolidProperties(props);
        break;
      case 'image':
        propErrors = validateImageProperties(props);
        break;
    }
    
    for (const err of propErrors) {
      errors.push({
        layerId,
        layerName,
        field: 'layerProperties',
        message: err,
        severity: 'warning',
      });
    }
  }
  
  // Validate keyframes
  if (layer.keyframes && Array.isArray(layer.keyframes)) {
    for (const propKf of layer.keyframes) {
      if (!propKf.propertyPath) {
        errors.push({
          layerId,
          layerName,
          field: 'keyframes',
          message: 'Keyframe collection missing propertyPath',
          severity: 'warning',
        });
      }
      
      if (propKf.keyframes && Array.isArray(propKf.keyframes)) {
        for (const kf of propKf.keyframes) {
          if (typeof kf.time !== 'number' || kf.time < 0) {
            errors.push({
              layerId,
              layerName,
              field: 'keyframes',
              message: `Invalid keyframe time: ${kf.time}`,
              severity: 'warning',
            });
          }
        }
      }
    }
  }
  
  return errors;
}

// ============================================================
// COMPOSITION VALIDATOR
// ============================================================

/**
 * Validate a composition definition
 * Returns validation result with errors and warnings
 */
export function validateComposition(composition: any): ValidationResult {
  const allErrors: ValidationError[] = [];
  
  // Validate composition-level fields
  if (!composition) {
    return {
      valid: false,
      errors: [{ field: 'composition', message: 'Composition is null or undefined', severity: 'error' }],
      warnings: [],
    };
  }
  
  if (!composition.id) {
    allErrors.push({
      field: 'id',
      message: 'Composition is missing id',
      severity: 'error',
    });
  }
  
  if (typeof composition.width !== 'number' || composition.width <= 0) {
    allErrors.push({
      field: 'width',
      message: 'width must be a positive number',
      severity: 'error',
    });
  }
  
  if (typeof composition.height !== 'number' || composition.height <= 0) {
    allErrors.push({
      field: 'height',
      message: 'height must be a positive number',
      severity: 'error',
    });
  }
  
  if (typeof composition.fps !== 'number' || composition.fps <= 0) {
    allErrors.push({
      field: 'fps',
      message: 'fps must be a positive number',
      severity: 'error',
    });
  }
  
  if (typeof composition.duration !== 'number' || composition.duration <= 0) {
    allErrors.push({
      field: 'duration',
      message: 'duration must be a positive number',
      severity: 'error',
    });
  }
  
  // Validate layers
  if (!Array.isArray(composition.layers)) {
    allErrors.push({
      field: 'layers',
      message: 'layers must be an array',
      severity: 'error',
    });
  } else {
    for (let i = 0; i < composition.layers.length; i++) {
      const layerErrors = validateLayer(composition.layers[i], i);
      allErrors.push(...layerErrors);
    }
  }
  
  // Separate errors and warnings
  const errors = allErrors.filter(e => e.severity === 'error');
  const warnings = allErrors.filter(e => e.severity === 'warning');
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate and fix a composition
 * Returns a fixed version of the composition with defaults applied
 */
export function validateAndFixComposition(composition: CompositionDefinition): CompositionDefinition {
  const fixed = { ...composition };
  
  // Fix layers
  if (fixed.layers && Array.isArray(fixed.layers)) {
    fixed.layers = fixed.layers.map((layer, index) => {
      const fixedLayer = { ...layer };
      
      // Ensure id
      if (!fixedLayer.id) {
        fixedLayer.id = `layer-${Date.now()}-${index}`;
      }
      
      // Ensure visible and locked are booleans
      if (typeof fixedLayer.visible !== 'boolean') {
        fixedLayer.visible = true;
      }
      if (typeof fixedLayer.locked !== 'boolean') {
        fixedLayer.locked = false;
      }
      
      // Ensure timing
      if (typeof fixedLayer.startTime !== 'number' || fixedLayer.startTime < 0) {
        fixedLayer.startTime = 0;
      }
      if (typeof fixedLayer.duration !== 'number' || fixedLayer.duration <= 0) {
        fixedLayer.duration = 150; // Default 5 seconds at 30fps
      }
      
      // Ensure transform has all required fields
      fixedLayer.transform = {
        x: fixedLayer.transform?.x ?? 0,
        y: fixedLayer.transform?.y ?? 0,
        scaleX: fixedLayer.transform?.scaleX ?? 1,
        scaleY: fixedLayer.transform?.scaleY ?? 1,
        rotation: fixedLayer.transform?.rotation ?? 0,
        opacity: fixedLayer.transform?.opacity ?? 1,
        anchorX: fixedLayer.transform?.anchorX ?? 0.5,
        anchorY: fixedLayer.transform?.anchorY ?? 0.5,
      };
      
      // Ensure layerProperties type matches layer type
      if (fixedLayer.layerProperties && fixedLayer.layerProperties.type !== fixedLayer.type) {
        fixedLayer.layerProperties = {
          ...fixedLayer.layerProperties,
          type: fixedLayer.type,
        } as any;
      }
      
      return fixedLayer as CompositionLayer;
    });
  }
  
  return fixed;
}

export default {
  validateComposition,
  validateAndFixComposition,
};
