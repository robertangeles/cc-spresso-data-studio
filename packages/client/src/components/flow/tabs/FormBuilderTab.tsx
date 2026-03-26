import { useState, useRef, useCallback } from 'react';
import type { FlowField } from '@cc/shared';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';

interface FormBuilderTabProps {
  fields: FlowField[];
  onFieldsChange: (fields: FlowField[]) => void;
}

const FIELD_TYPES: Array<{ value: FlowField['type']; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'multiline', label: 'Multiline Text' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'image', label: 'Image' },
  { value: 'document', label: 'Document' },
];

export function FormBuilderTab({ fields, onFieldsChange }: FormBuilderTabProps) {
  const [localFields, setLocalFields] = useState<FlowField[]>(fields);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const debouncedSave = useCallback(
    (updated: FlowField[]) => {
      setLocalFields(updated);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => onFieldsChange(updated), 400);
    },
    [onFieldsChange],
  );

  const addField = () => {
    const newField: FlowField = {
      id: crypto.randomUUID(),
      type: 'text',
      label: '',
      placeholder: '',
      required: false,
    };
    debouncedSave([...localFields, newField]);
  };

  const updateField = (index: number, updates: Partial<FlowField>) => {
    const updated = localFields.map((f, i) => (i === index ? { ...f, ...updates } : f));
    debouncedSave(updated);
  };

  const removeField = (index: number) => {
    debouncedSave(localFields.filter((_, i) => i !== index));
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= localFields.length) return;
    const updated = [...localFields];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    debouncedSave(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900">Form Fields</h3>
          <p className="text-sm text-gray-500">Design the input form users will fill out.</p>
        </div>
        <Button size="sm" onClick={addField}>
          + Add Field
        </Button>
      </div>

      {localFields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
          <p className="text-gray-500">No fields yet. Click &quot;Add Field&quot; to start.</p>
        </div>
      ) : (
        localFields.map((field, index) => (
          <Card key={field.id} padding="md">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">Field {index + 1}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveField(index, -1)}
                    disabled={index === 0}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveField(index, 1)}
                    disabled={index === localFields.length - 1}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeField(index)}
                    className="rounded p-1 text-red-400 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
                  <select
                    value={field.type}
                    onChange={(e) =>
                      updateField(index, { type: e.target.value as FlowField['type'] })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                  >
                    {FIELD_TYPES.map((ft) => (
                      <option key={ft.value} value={ft.value}>
                        {ft.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Label"
                  value={field.label}
                  onChange={(e) => updateField(index, { label: e.target.value })}
                  placeholder="Field label"
                />
              </div>

              <Input
                label="Placeholder"
                value={field.placeholder ?? ''}
                onChange={(e) => updateField(index, { placeholder: e.target.value })}
                placeholder="Placeholder text"
              />

              {field.type === 'dropdown' && (
                <OptionsInput
                  options={field.options ?? []}
                  onChange={(options) => updateField(index, { options })}
                />
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.required ?? false}
                  onChange={(e) => updateField(index, { required: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Required
              </label>
            </div>
          </Card>
        ))
      )}

      <p className="text-xs text-gray-400">
        {localFields.length} field{localFields.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

function OptionsInput({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  const [raw, setRaw] = useState(options.join('; '));

  const handleBlur = () => {
    const parsed = raw
      .split(';')
      .map((o) => o.trim())
      .filter(Boolean);
    onChange(parsed);
  };

  return (
    <Input
      label="Options (semicolon-separated)"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={handleBlur}
      placeholder="Option 1; Option 2; Option 3"
    />
  );
}
