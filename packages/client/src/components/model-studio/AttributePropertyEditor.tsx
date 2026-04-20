import { useEffect, useState } from 'react';
import {
  BookOpen,
  Braces,
  Code2,
  FileText,
  History as HistoryIcon,
  KeyRound,
  Link as LinkIcon,
  List,
  Palette,
  Shield,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import type { AttributeUpdate } from '@cc/shared';
import type { AttributeHistoryEvent, AttributeSummary } from '../../hooks/useAttributes';
import { GeneralTab } from './attribute-tabs/GeneralTab';
import { HistoryTab } from './attribute-tabs/HistoryTab';
import { RulesTab } from './attribute-tabs/RulesTab';
import { StubTab } from './attribute-tabs/StubTab';

/**
 * Step 5 follow-up — tabbed property editor below the attribute grid.
 *
 * Twelve tabs by design (matches Erwin's property sheet surface).
 * Wired tabs render real data; stubbed tabs show a consistent
 * placeholder with a "Ships in Step N" chip so the tab strip stays
 * visually stable across Steps 5–8.
 *
 * Plug-in pattern: add a real component file under `./attribute-tabs/`,
 * then swap the `<StubTab ... />` case below for the wired component.
 */

type TabId =
  | 'general'
  | 'constraints'
  | 'layerLinks'
  | 'keys'
  | 'appearance'
  | 'documentation'
  | 'glossary'
  | 'usage'
  | 'customFields'
  | 'audit'
  | 'rules'
  | 'governance';

interface TabMeta {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  wired: boolean;
  /** Short hover tooltip — the "idiot-proof" hint so a modeller doesn't
   *  need a manual to understand what each tab holds. */
  tooltip: string;
}

const TABS: TabMeta[] = [
  {
    id: 'general',
    label: 'General',
    icon: <List className="h-3 w-3" />,
    wired: true,
    tooltip: 'Core fields: business name, definition, default value, and lineage metadata.',
  },
  {
    id: 'constraints',
    label: 'Constraints',
    icon: <Shield className="h-3 w-3" />,
    wired: false,
    tooltip: 'Nullability, uniqueness, and check-constraint rules beyond the scalar flags above.',
  },
  {
    id: 'layerLinks',
    label: 'Layer Links',
    icon: <LinkIcon className="h-3 w-3" />,
    wired: false,
    tooltip: 'Cross-layer attribute projections (logical ↔ physical).',
  },
  {
    id: 'keys',
    label: 'Keys',
    icon: <KeyRound className="h-3 w-3" />,
    wired: false,
    tooltip: 'Composite primary keys and unique-constraint groupings.',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <Palette className="h-3 w-3" />,
    wired: false,
    tooltip: 'Per-attribute rendering hints (colour, icon, visibility) in metadata JSONB.',
  },
  {
    id: 'documentation',
    label: 'Documentation',
    icon: <FileText className="h-3 w-3" />,
    wired: false,
    tooltip: 'Markdown-ready long-form documentation. Short definition lives on General.',
  },
  {
    id: 'glossary',
    label: 'Glossary',
    icon: <BookOpen className="h-3 w-3" />,
    wired: false,
    tooltip: 'Bindings to conceptual business-glossary terms via the semantic layer.',
  },
  {
    id: 'usage',
    label: 'Usage',
    icon: <Workflow className="h-3 w-3" />,
    wired: false,
    tooltip: 'Cross-model references — every relationship or mapping that points here.',
  },
  {
    id: 'customFields',
    label: 'Custom Fields',
    icon: <Braces className="h-3 w-3" />,
    wired: false,
    tooltip: 'User-defined properties stored in metadata JSONB.',
  },
  {
    id: 'audit',
    label: 'Audit',
    icon: <HistoryIcon className="h-3 w-3" />,
    wired: true,
    tooltip: 'Full audit trail — every change made to this attribute.',
  },
  {
    id: 'rules',
    label: 'Rules',
    icon: <Code2 className="h-3 w-3" />,
    wired: true,
    tooltip: 'Business rules and transformation logic. Paste SQL, ETL snippets, or pseudocode.',
  },
  {
    id: 'governance',
    label: 'Governance',
    icon: <ShieldCheck className="h-3 w-3" />,
    wired: false,
    tooltip: 'Classification (set above), steward, retention, and compliance tags.',
  },
];

export interface AttributePropertyEditorProps {
  entityId: string;
  attribute: AttributeSummary | null;
  onUpdate: (attrId: string, patch: AttributeUpdate) => Promise<AttributeSummary>;
  loadHistory: (entityId: string, attrId: string) => Promise<AttributeHistoryEvent[]>;
}

export function AttributePropertyEditor({
  entityId,
  attribute,
  onUpdate,
  loadHistory,
}: AttributePropertyEditorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general');

  // When the selected attribute changes, land on General so tab state
  // doesn't feel stale after a row click.
  useEffect(() => {
    if (attribute) setActiveTab('general');
  }, [attribute?.id]);

  if (!attribute) {
    return (
      <div
        className="flex h-full items-center justify-center px-4 text-center"
        data-testid="attribute-property-editor"
        data-scope="empty"
      >
        <p className="text-xs italic text-text-secondary/60">
          Select an attribute above to inspect and edit its properties.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col border-t-2 border-t-accent/70 shadow-[inset_0_1px_0_0_rgba(255,214,10,0.2)]"
      data-testid="attribute-property-editor"
      data-scope="attribute"
    >
      <ScopeHeader attribute={attribute} />
      <TabStrip active={activeTab} onSelect={setActiveTab} />
      <div className="flex-1 overflow-auto" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
        <ActiveTabContent
          activeTab={activeTab}
          entityId={entityId}
          attribute={attribute}
          onUpdate={(patch) => onUpdate(attribute.id, patch)}
          loadHistory={loadHistory}
        />
      </div>
    </div>
  );
}

/** Scope header — makes it obvious the tabs below are scoped to the
 *  currently-selected attribute, not the entity. Sits flush under the
 *  amber top-border so the visual chain selected-row → header → tabs
 *  reads as one connected surface. */
function ScopeHeader({ attribute }: { attribute: AttributeSummary }) {
  return (
    <div
      data-testid="attribute-scope-header"
      className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-accent/[0.04] px-4 py-2"
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/80">
        Attribute
      </span>
      <span className="text-text-secondary/40">·</span>
      <span className="font-mono text-xs font-semibold text-text-primary" title="Attribute name">
        {attribute.name}
      </span>
      {attribute.dataType && (
        <span
          className="rounded-sm border border-white/10 bg-surface-1/60 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary"
          title="Data type"
        >
          {attribute.dataType}
        </span>
      )}
      {attribute.isPrimaryKey && (
        <span
          className="rounded-sm border border-accent/40 bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent"
          title="Primary key"
        >
          PK
        </span>
      )}
      {attribute.isForeignKey && (
        <span
          className="rounded-sm border border-indigo-400/40 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-200"
          title="Foreign key"
        >
          FK
        </span>
      )}
      {attribute.classification && (
        <span
          className="ml-auto rounded-sm border border-rose-400/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-200"
          title={`Classification: ${attribute.classification}`}
        >
          {attribute.classification}
        </span>
      )}
    </div>
  );
}

function TabStrip({ active, onSelect }: { active: TabId; onSelect: (id: TabId) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Attribute properties"
      className="flex shrink-0 items-stretch gap-0 overflow-x-auto border-b border-white/10 bg-surface-2/60 backdrop-blur-sm"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        const titleText = tab.wired ? tab.tooltip : `${tab.tooltip} (Ships later.)`;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-disabled={!tab.wired && !isActive}
            title={titleText}
            onClick={() => onSelect(tab.id)}
            data-testid={`attribute-tab-${tab.id}`}
            className={[
              'group relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors',
              isActive
                ? 'text-accent'
                : tab.wired
                  ? 'text-text-secondary hover:text-text-primary'
                  : 'text-text-secondary/40 hover:text-text-secondary/60',
            ].join(' ')}
          >
            <span className={isActive ? 'text-accent' : 'text-text-secondary/60'}>{tab.icon}</span>
            {tab.label}
            {!tab.wired && (
              <span
                className="ml-0.5 inline-flex h-1 w-1 rounded-full bg-amber-400/50"
                title="Stub — ships later"
              />
            )}
            {isActive && (
              <span
                aria-hidden
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-t bg-accent shadow-[0_0_8px_rgba(255,214,10,0.6)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ActiveTabContent({
  activeTab,
  entityId,
  attribute,
  onUpdate,
  loadHistory,
}: {
  activeTab: TabId;
  entityId: string;
  attribute: AttributeSummary;
  onUpdate: (patch: AttributeUpdate) => Promise<AttributeSummary>;
  loadHistory: (entityId: string, attrId: string) => Promise<AttributeHistoryEvent[]>;
}) {
  switch (activeTab) {
    case 'general':
      return <GeneralTab attribute={attribute} onUpdate={onUpdate} />;
    case 'audit':
      return (
        <HistoryTab entityId={entityId} attributeId={attribute.id} loadHistory={loadHistory} />
      );
    case 'rules':
      return <RulesTab attribute={attribute} onUpdate={onUpdate} />;
    case 'constraints':
      return (
        <StubTab
          title="Constraints"
          description="The scalar flags (PK / FK / NN / UQ) live in the grid above. Richer check constraints, domain rules, and referential actions will surface here."
          shipsIn="a follow-up"
        />
      );
    case 'documentation':
      return (
        <StubTab
          title="Documentation"
          description="Markdown-ready long-form documentation with inline glossary links. The short definition is editable on the General tab; this tab is the rich editor."
          shipsIn="Step 11"
        />
      );
    case 'appearance':
      return (
        <StubTab
          title="Appearance"
          description="Per-attribute rendering hints — colour, icon, visibility — stored in the attribute's metadata JSONB. The editor UI is on deck."
          shipsIn="a follow-up"
        />
      );
    case 'customFields':
      return (
        <StubTab
          title="Custom Fields"
          description="Free-form key-value pairs attached to an attribute. Backed by metadata JSONB. UI lights up when the first governance plugin needs them."
          shipsIn="a follow-up"
        />
      );
    case 'layerLinks':
      return (
        <StubTab
          title="Layer Links"
          description="Cross-layer attribute projections — bind a logical attribute to its physical column and back. Lives in data_model_attribute_links."
          shipsIn="Step 7"
        />
      );
    case 'keys':
      return (
        <StubTab
          title="Keys"
          description="Composite primary keys and unique-constraint groupings. Inferred from PK + related attributes today; a dedicated schema arrives when physical DDL demands it."
          shipsIn="Step 9"
        />
      );
    case 'glossary':
      return (
        <StubTab
          title="Glossary"
          description="Binds this attribute to conceptual business-glossary terms via data_model_semantic_mappings. Lands with the semantic-layer bridge."
          shipsIn="Step 8"
        />
      );
    case 'usage':
      return (
        <StubTab
          title="Usage"
          description="Cross-model references — every relationship, link, or mapping pointing at this attribute. Needs a query layer that ships with the RAG chat work."
          shipsIn="Step 10"
        />
      );
    case 'governance':
      return (
        <StubTab
          title="Governance"
          description="Classification is set as a column in the grid above. This tab will add steward assignment, retention policy, and compliance-framework tags (GDPR, SOX, HIPAA) when the governance module lands."
          shipsIn="a follow-up"
        />
      );
    default:
      return null;
  }
}
