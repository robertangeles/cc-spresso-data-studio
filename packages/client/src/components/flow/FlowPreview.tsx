import type { FlowField } from '@cc/shared';

interface FlowPreviewProps {
  flowName: string;
  fields: FlowField[];
}

export function FlowPreview({ flowName, fields }: FlowPreviewProps) {
  return (
    <div className="w-96 border-l border-border-subtle bg-surface-2 p-6">
      <h3 className="text-sm font-medium text-text-tertiary">Preview</h3>
      <div className="mt-4 rounded-lg border border-border-subtle bg-surface-1 p-6">
        <h4 className="text-center text-lg font-semibold">{flowName}</h4>

        {fields.length === 0 ? (
          <div className="mt-4 text-center text-sm text-text-tertiary">
            Add fields to see a preview
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {fields.map((field, index) => (
              <div key={field.id}>
                <label className="mb-1 block text-sm text-text-secondary">
                  <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-xs text-accent">
                    {index + 1}
                  </span>
                  {field.label || 'Untitled'}
                  {field.required ? ' *' : ''}
                </label>
                {field.type === 'multiline' ? (
                  <textarea
                    disabled
                    placeholder={field.placeholder}
                    rows={2}
                    className="w-full rounded border border-border-subtle bg-surface-2 px-2 py-1 text-sm text-text-tertiary"
                  />
                ) : field.type === 'dropdown' ? (
                  <select
                    disabled
                    className="w-full rounded border border-border-subtle bg-surface-2 px-2 py-1 text-sm text-text-tertiary"
                  >
                    <option>{field.placeholder || 'Select...'}</option>
                    {(field.options ?? []).map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                ) : field.type === 'image' || field.type === 'document' ? (
                  <div className="rounded border border-dashed border-border-subtle bg-surface-2 px-2 py-3 text-center text-xs text-text-tertiary">
                    Upload {field.type}
                  </div>
                ) : (
                  <input
                    disabled
                    type="text"
                    placeholder={field.placeholder}
                    className="w-full rounded border border-border-subtle bg-surface-2 px-2 py-1 text-sm text-text-tertiary"
                  />
                )}
              </div>
            ))}
            <button
              disabled
              className="mt-2 rounded-lg border border-border-subtle px-4 py-1.5 text-sm text-text-tertiary"
            >
              Submit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
