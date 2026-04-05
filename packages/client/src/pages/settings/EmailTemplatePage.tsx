import { useState, useEffect, useCallback } from 'react';
import { Mail, Eye, Save, Loader2, CheckCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';

interface EmailTemplate {
  id: string;
  eventType: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: string[];
  isActive: boolean;
}

interface PreviewData {
  subject: string;
  html: string;
  text: string;
}

function formatEventType(eventType: string): string {
  return eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EmailTemplatePage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    subject: '',
    bodyHtml: '',
    bodyText: '',
    isActive: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/admin/email-templates');
      if (data.data) {
        setTemplates(data.data);
        if (!selectedEventType && data.data.length > 0) {
          selectTemplate(data.data[0]);
        }
      }
    } catch {
      // keep defaults
    } finally {
      setIsLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const selectTemplate = (template: EmailTemplate) => {
    setSelectedEventType(template.eventType);
    setEditForm({
      subject: template.subject,
      bodyHtml: template.bodyHtml,
      bodyText: template.bodyText,
      isActive: template.isActive,
    });
    setPreview(null);
    setSaved(false);
  };

  const selectedTemplate = templates.find((t) => t.eventType === selectedEventType);

  const handleSave = async () => {
    if (!selectedEventType) return;
    try {
      setSaving(true);
      setSaved(false);
      await api.put(`/admin/email-templates/${selectedEventType}`, {
        subject: editForm.subject,
        bodyHtml: editForm.bodyHtml,
        bodyText: editForm.bodyText,
        isActive: editForm.isActive,
      });
      setSaved(true);
      await loadTemplates();
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // error handled by api interceptor
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    try {
      setPreviewing(true);
      const { data } = await api.post('/admin/email-templates/preview', {
        subject: editForm.subject,
        bodyHtml: editForm.bodyHtml,
        bodyText: editForm.bodyText,
      });
      if (data.data) {
        setPreview(data.data);
      }
    } catch {
      // error handled by api interceptor
    } finally {
      setPreviewing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">Email Templates</h3>
        <p className="text-sm text-text-secondary">
          Manage the email templates sent for various system events.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left Sidebar - Template List */}
        <div className="col-span-3">
          <Card padding="lg">
            <div className="rounded-xl bg-surface-2/50 backdrop-blur-xl border border-white/5 p-4">
              <div className="flex items-center gap-2 mb-4">
                <Mail className="h-4 w-4 text-accent" />
                <h4 className="font-medium text-text-primary text-sm">Templates</h4>
              </div>
              <div className="space-y-1.5">
                {templates.map((template) => (
                  <button
                    key={template.eventType}
                    type="button"
                    onClick={() => selectTemplate(template)}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                      selectedEventType === template.eventType
                        ? 'bg-accent-dim text-accent shadow-[0_0_12px_rgba(255,214,10,0.15)]'
                        : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{formatEventType(template.eventType)}</span>
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          template.isActive ? 'bg-green-500' : 'bg-neutral-500'
                        }`}
                      />
                    </div>
                  </button>
                ))}
                {templates.length === 0 && (
                  <p className="text-sm text-text-tertiary px-3 py-2">No templates found.</p>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Main Area - Editor */}
        <div className="col-span-6">
          {selectedTemplate ? (
            <Card padding="lg">
              <div className="rounded-xl bg-surface-2/50 backdrop-blur-xl border border-white/5 p-5">
                <div className="flex items-center justify-between mb-5">
                  <h4 className="font-medium text-text-primary">
                    {formatEventType(selectedTemplate.eventType)}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setEditForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
                    className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {editForm.isActive ? (
                      <>
                        <ToggleRight className="h-5 w-5 text-green-500" />
                        <span>Active</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="h-5 w-5 text-neutral-500" />
                        <span>Inactive</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Subject */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={editForm.subject}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, subject: e.target.value }))
                      }
                      placeholder="Email subject line..."
                      className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 shadow-inner"
                    />
                  </div>

                  {/* HTML Body */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                      HTML Body
                    </label>
                    <textarea
                      value={editForm.bodyHtml}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, bodyHtml: e.target.value }))
                      }
                      placeholder="<html>...</html>"
                      rows={10}
                      className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 shadow-inner"
                    />
                  </div>

                  {/* Text Body */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                      Text Body
                    </label>
                    <textarea
                      value={editForm.bodyText}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, bodyText: e.target.value }))
                      }
                      placeholder="Plain text version..."
                      rows={5}
                      className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 shadow-inner"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex items-center gap-3">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save
                      </>
                    )}
                  </Button>
                  <Button variant="secondary" onClick={handlePreview} disabled={previewing}>
                    {previewing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                      </>
                    )}
                  </Button>
                  {saved && (
                    <span className="flex items-center gap-1.5 text-sm text-green-400">
                      <CheckCircle className="h-4 w-4" />
                      Saved successfully
                    </span>
                  )}
                </div>

                {/* Preview */}
                {preview && (
                  <div className="mt-6 space-y-3">
                    <h4 className="font-medium text-text-primary text-sm">Preview</h4>
                    <div className="rounded-lg border border-border-default bg-surface-3 p-3">
                      <p className="text-sm text-text-secondary mb-2">
                        <span className="font-medium">Subject:</span> {preview.subject}
                      </p>
                      <div
                        className="rounded-lg bg-white p-4 text-sm text-gray-900"
                        dangerouslySetInnerHTML={{ __html: preview.html }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card padding="lg">
              <div className="rounded-xl bg-surface-2/50 backdrop-blur-xl border border-white/5 p-8 text-center">
                <Mail className="mx-auto h-10 w-10 text-text-tertiary mb-3" />
                <p className="text-text-secondary text-sm">
                  Select a template from the sidebar to begin editing.
                </p>
              </div>
            </Card>
          )}
        </div>

        {/* Right Panel - Variable Reference */}
        <div className="col-span-3">
          <Card padding="lg">
            <div className="rounded-xl bg-surface-2/50 backdrop-blur-xl border border-white/5 p-4">
              <h4 className="font-medium text-text-primary text-sm mb-3">Available Variables</h4>
              {selectedTemplate && selectedTemplate.variables.length > 0 ? (
                <div className="space-y-2">
                  {selectedTemplate.variables.map((variable) => (
                    <div
                      key={variable}
                      className="rounded-md bg-surface-3 px-2.5 py-1.5 font-mono text-xs text-accent"
                    >
                      {`{{${variable}}}`}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-tertiary">
                  {selectedTemplate
                    ? 'No variables available for this template.'
                    : 'Select a template to see available variables.'}
                </p>
              )}
              <div className="mt-4 pt-3 border-t border-border-subtle">
                <p className="text-xs text-text-tertiary">
                  Use double curly braces to insert variables into your template subject and body
                  fields.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
