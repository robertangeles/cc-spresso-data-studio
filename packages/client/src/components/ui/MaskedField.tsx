import { useState } from 'react';
import { Button } from './Button';

interface MaskedFieldProps {
  label: string;
  value: string;
  maskedValue: string;
  onSave?: (newValue: string) => Promise<void>;
  editable?: boolean;
}

export function MaskedField({
  label,
  value,
  maskedValue,
  onSave,
  editable = false,
}: MaskedFieldProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div>
        <p className="mb-1 text-sm text-text-tertiary">{label}</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="flex-1 rounded-lg border border-border-default px-3 py-1.5 font-mono text-xs text-text-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:ring-offset-2"
          />
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1 text-sm text-text-tertiary">{label}</p>
      <div className="flex items-center gap-2">
        <p className="font-mono text-xs text-text-secondary">{isRevealed ? value : maskedValue}</p>
        <button
          type="button"
          onClick={() => setIsRevealed(!isRevealed)}
          className="text-text-tertiary hover:text-text-secondary transition-colors"
          title={isRevealed ? 'Hide' : 'Reveal'}
        >
          {isRevealed ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.092 1.092a4 4 0 00-5.558-5.558z"
                clipRule="evenodd"
              />
              <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
              <path
                fillRule="evenodd"
                d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
        {editable && onSave && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-text-tertiary hover:text-text-secondary transition-colors"
            title="Edit"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
