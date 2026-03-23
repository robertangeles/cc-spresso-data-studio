import type { FlowField } from '@cc/shared';

interface FlowPreviewProps {
  flowName: string;
  fields: FlowField[];
}

export function FlowPreview({ flowName, fields }: FlowPreviewProps) {
  return (
    <div className="w-96 border-l border-gray-200 bg-gray-50 p-6">
      <h3 className="text-sm font-medium text-gray-500">Preview</h3>
      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6">
        <h4 className="text-center text-lg font-semibold">{flowName}</h4>

        {fields.length === 0 ? (
          <div className="mt-4 text-center text-sm text-gray-400">
            Add fields to see a preview
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {fields.map((field, index) => (
              <div key={field.id}>
                <label className="mb-1 block text-sm text-gray-600">
                  <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-xs text-brand-600">
                    {index + 1}
                  </span>
                  {field.label || 'Untitled'}{field.required ? ' *' : ''}
                </label>
                {field.type === 'multiline' ? (
                  <textarea
                    disabled
                    placeholder={field.placeholder}
                    rows={2}
                    className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-400"
                  />
                ) : field.type === 'dropdown' ? (
                  <select disabled className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-400">
                    <option>{field.placeholder || 'Select...'}</option>
                    {(field.options ?? []).map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                ) : field.type === 'image' || field.type === 'document' ? (
                  <div className="rounded border border-dashed border-gray-200 bg-gray-50 px-2 py-3 text-center text-xs text-gray-400">
                    Upload {field.type}
                  </div>
                ) : (
                  <input
                    disabled
                    type="text"
                    placeholder={field.placeholder}
                    className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-400"
                  />
                )}
              </div>
            ))}
            <button
              disabled
              className="mt-2 rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-400"
            >
              Submit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
