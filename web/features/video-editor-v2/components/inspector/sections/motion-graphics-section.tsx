/**
 * MotionGraphicsSection - Inspector section for motion graphics properties
 *
 * Dynamically renders property editors based on the template's editable properties.
 * Supports:
 * - Text inputs
 * - Color pickers
 * - Number inputs with sliders
 * - Select dropdowns
 * - Font selectors
 * - Location pickers (for Mapbox)
 * - Boolean toggles
 */

import React, { useCallback, useState, useMemo } from "react";
import { cn } from "../../../utils/general/utils";
import { Label } from "../../ui/label";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { Slider } from "../../ui/slider";
import { Badge } from "../../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { ColorPicker } from "../../ui/color-picker";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../ui/collapsible";
import {
  MotionGraphicsOverlay,
  EditableProperty,
  EditablePropertyGroup,
  MOTION_GRAPHICS_CATEGORY_NAMES,
} from "../../../types/motion-graphics";
import {
  Wand2,
  Type,
  Palette,
  Hash,
  List,
  MapPin,
  ToggleLeft,
  Image,
  Settings,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Sparkles,
  MessageSquare,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

interface MotionGraphicsSectionProps {
  overlay: MotionGraphicsOverlay;
  onUpdateProperty: (propertyId: string, value: any) => void;
  onEditWithAI?: () => void;
  onSaveAsTemplate?: () => void;
}

// ==========================================
// FONT FAMILIES
// ==========================================

const FONT_FAMILIES = [
  { value: "Inter", label: "Inter" },
  { value: "Arial", label: "Arial" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Georgia", label: "Georgia" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Poppins", label: "Poppins" },
  { value: "Lato", label: "Lato" },
  { value: "Oswald", label: "Oswald" },
];

// ==========================================
// PROPERTY ICONS
// ==========================================

const getPropertyIcon = (type: string) => {
  switch (type) {
    case 'text':
      return Type;
    case 'color':
      return Palette;
    case 'number':
      return Hash;
    case 'select':
      return List;
    case 'font':
      return Type;
    case 'location':
      return MapPin;
    case 'boolean':
      return ToggleLeft;
    case 'image':
      return Image;
    default:
      return Settings;
  }
};

// ==========================================
// SECTION HEADER
// ==========================================

interface SectionHeaderProps {
  icon: React.ElementType;
  title: string;
  children?: React.ReactNode;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ icon: Icon, title, children }) => (
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </span>
    </div>
    {children}
  </div>
);

// ==========================================
// PROPERTY EDITOR COMPONENTS
// ==========================================

interface PropertyEditorProps {
  property: EditableProperty;
  value: any;
  onChange: (value: any) => void;
}

/**
 * Text input editor
 */
const TextPropertyEditor: React.FC<PropertyEditorProps> = ({ property, value, onChange }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{property.label}</Label>
    <Input
      value={value ?? property.defaultValue ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={property.description}
      className="h-8 text-sm"
    />
  </div>
);

/**
 * Color picker editor
 */
const ColorPropertyEditor: React.FC<PropertyEditorProps> = ({ property, value, onChange }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{property.label}</Label>
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full h-8 justify-start gap-2 text-sm"
        >
          <div
            className="w-4 h-4 rounded border border-border"
            style={{ backgroundColor: value || property.defaultValue || '#000000' }}
          />
          <span className="flex-1 text-left truncate">
            {value || property.defaultValue || 'Select color'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <ColorPicker
          color={value || property.defaultValue || '#000000'}
          onChange={onChange}
        />
      </PopoverContent>
    </Popover>
  </div>
);

/**
 * Number input editor with optional slider
 */
const NumberPropertyEditor: React.FC<PropertyEditorProps> = ({ property, value, onChange }) => {
  const numValue = typeof value === 'number' ? value : (property.defaultValue ?? 0);
  const hasRange = property.min !== undefined && property.max !== undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{property.label}</Label>
        <span className="text-xs text-muted-foreground">{numValue}</span>
      </div>
      {hasRange ? (
        <Slider
          value={[numValue]}
          onValueChange={([v]) => onChange(v)}
          min={property.min}
          max={property.max}
          step={property.step ?? 1}
          className="py-2"
        />
      ) : (
        <Input
          type="number"
          value={numValue}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={property.min}
          max={property.max}
          step={property.step}
          className="h-8 text-sm"
        />
      )}
    </div>
  );
};

/**
 * Select dropdown editor
 */
const SelectPropertyEditor: React.FC<PropertyEditorProps> = ({ property, value, onChange }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{property.label}</Label>
    <Select value={value ?? property.defaultValue} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder={`Select ${property.label.toLowerCase()}`} />
      </SelectTrigger>
      <SelectContent>
        {property.options?.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

/**
 * Font family selector
 */
const FontPropertyEditor: React.FC<PropertyEditorProps> = ({ property, value, onChange }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{property.label}</Label>
    <Select value={value ?? property.defaultValue ?? 'Inter'} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder="Select font" />
      </SelectTrigger>
      <SelectContent>
        {FONT_FAMILIES.map((font) => (
          <SelectItem key={font.value} value={font.value}>
            <span style={{ fontFamily: font.value }}>{font.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

/**
 * Boolean toggle editor
 */
const BooleanPropertyEditor: React.FC<PropertyEditorProps> = ({ property, value, onChange }) => (
  <div className="flex items-center justify-between">
    <Label className="text-xs">{property.label}</Label>
    <Switch
      checked={value ?? property.defaultValue ?? false}
      onCheckedChange={onChange}
    />
  </div>
);

/**
 * Location picker editor (for Mapbox coordinates)
 */
const LocationPropertyEditor: React.FC<PropertyEditorProps> = ({ property, value, onChange }) => {
  const coords = value || property.defaultValue || [0, 0];
  const [lng, lat] = Array.isArray(coords) ? coords : [0, 0];

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{property.label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Longitude</Label>
          <Input
            type="number"
            value={lng}
            onChange={(e) => onChange([parseFloat(e.target.value) || 0, lat])}
            step={0.0001}
            className="h-7 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Latitude</Label>
          <Input
            type="number"
            value={lat}
            onChange={(e) => onChange([lng, parseFloat(e.target.value) || 0])}
            step={0.0001}
            className="h-7 text-xs"
          />
        </div>
      </div>
      {/* TODO: Add interactive map picker */}
    </div>
  );
};

/**
 * Property editor factory
 */
const PropertyEditor: React.FC<PropertyEditorProps> = (props) => {
  switch (props.property.type) {
    case 'text':
      return <TextPropertyEditor {...props} />;
    case 'color':
      return <ColorPropertyEditor {...props} />;
    case 'number':
      return <NumberPropertyEditor {...props} />;
    case 'select':
      return <SelectPropertyEditor {...props} />;
    case 'font':
      return <FontPropertyEditor {...props} />;
    case 'boolean':
      return <BooleanPropertyEditor {...props} />;
    case 'location':
      return <LocationPropertyEditor {...props} />;
    default:
      return <TextPropertyEditor {...props} />;
  }
};

// ==========================================
// PROPERTY GROUP COMPONENT
// ==========================================

interface PropertyGroupProps {
  group: EditablePropertyGroup;
  propertyValues: Record<string, any>;
  onUpdateProperty: (propertyId: string, value: any) => void;
}

const PropertyGroup: React.FC<PropertyGroupProps> = ({
  group,
  propertyValues,
  onUpdateProperty,
}) => {
  const [isOpen, setIsOpen] = useState(!group.collapsed);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 hover:bg-muted/50 rounded transition-colors">
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-medium">{group.label}</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {group.properties.length}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-5 space-y-3 py-2">
          {group.properties.map((property) => (
            <PropertyEditor
              key={property.id}
              property={property}
              value={propertyValues[property.id]}
              onChange={(value) => onUpdateProperty(property.id, value)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const MotionGraphicsSection: React.FC<MotionGraphicsSectionProps> = ({
  overlay,
  onUpdateProperty,
  onEditWithAI,
  onSaveAsTemplate,
}) => {
  const { template, propertyValues } = overlay;

  // Safety check - if template is missing, show a fallback UI
  if (!template) {
    return (
      <div className="space-y-4">
        <div className="bg-destructive/10 rounded-lg p-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded bg-destructive/10 flex items-center justify-center shrink-0">
              <Wand2 className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium">Template Missing</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                The motion graphics template data could not be loaded. Please try removing this clip and adding the motion graphic again.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Group properties by their group field
  const groupedProperties = useMemo(() => {
    const groups: Record<string, EditableProperty[]> = {};
    const ungrouped: EditableProperty[] = [];

    const editableProps = template.editableProperties || [];
    editableProps.forEach((prop) => {
      if (prop.group) {
        if (!groups[prop.group]) {
          groups[prop.group] = [];
        }
        groups[prop.group].push(prop);
      } else {
        ungrouped.push(prop);
      }
    });

    return { groups, ungrouped };
  }, [template.editableProperties]);

  // Handle reset to defaults
  const handleResetToDefaults = useCallback(() => {
    const editableProps = template.editableProperties || [];
    editableProps.forEach((prop) => {
      if (prop.defaultValue !== undefined) {
        onUpdateProperty(prop.id, prop.defaultValue);
      }
    });
  }, [template.editableProperties, onUpdateProperty]);

  return (
    <div className="space-y-4">
      {/* Template Info */}
      <div className="bg-muted/30 rounded-lg p-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center shrink-0">
            <Wand2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium truncate">{template.name}</h4>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {template.description}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-[10px]">
                {MOTION_GRAPHICS_CATEGORY_NAMES[template.category]}
              </Badge>
              {template.isPro && (
                <Badge className="text-[10px] bg-amber-500">PRO</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Edit Button */}
      {onEditWithAI && (
        <Button
          variant="outline"
          className="w-full h-9 text-sm"
          onClick={onEditWithAI}
        >
          <MessageSquare className="h-3.5 w-3.5 mr-2" />
          Edit with AI
        </Button>
      )}

      {/* Properties Section */}
      <div>
        <SectionHeader icon={Settings} title="Properties">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={handleResetToDefaults}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        </SectionHeader>

        {/* Ungrouped properties */}
        {groupedProperties.ungrouped.length > 0 && (
          <div className="space-y-3 mb-4">
            {groupedProperties.ungrouped.map((property) => (
              <PropertyEditor
                key={property.id}
                property={property}
                value={propertyValues[property.id]}
                onChange={(value) => onUpdateProperty(property.id, value)}
              />
            ))}
          </div>
        )}

        {/* Grouped properties */}
        {Object.entries(groupedProperties.groups).map(([groupName, properties]) => (
          <PropertyGroup
            key={groupName}
            group={{
              id: groupName,
              label: groupName,
              properties,
            }}
            propertyValues={propertyValues}
            onUpdateProperty={onUpdateProperty}
          />
        ))}

        {/* Use template's property groups if defined */}
        {template.propertyGroups?.map((group) => (
          <PropertyGroup
            key={group.id}
            group={group}
            propertyValues={propertyValues}
            onUpdateProperty={onUpdateProperty}
          />
        ))}
      </div>

      {/* Save as Template */}
      {onSaveAsTemplate && (
        <Button
          variant="secondary"
          className="w-full h-9 text-sm"
          onClick={onSaveAsTemplate}
        >
          <Sparkles className="h-3.5 w-3.5 mr-2" />
          Save as Template
        </Button>
      )}
    </div>
  );
};

export default MotionGraphicsSection;
