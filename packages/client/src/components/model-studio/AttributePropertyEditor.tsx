import { useEffect, useState } from 'react';
import {
  BookOpen,
  Braces,
  FileText,
  History as HistoryIcon,
  KeyRound,
  Link as LinkIcon,
  List,
  Palette,
  ScrollText,
  Shield,
  StickyNote,
  Workflow,
} from 'lucide-react';
import type { AttributeUpdate } from '@cc/shared';
import type { AttributeHistoryEvent, AttributeSummary } from '../../hooks/useAttributes';
import { GeneralTab } from './attribute-tabs/GeneralTab';
import { HistoryTab } from './attribute-tabs/HistoryTab';
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
  | 'constraint'
  | 'link'
  | 'keyGroups'
  | 'style'
  | 'definition'
  | 'businessTerms'
  | 'whereUsed'
  | 'udp'
  | 'history'
  | 'notes'
  | 'extendedNotes';

interface TabMeta {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  wired: boolean;
}

const TABS: TabMeta[] = [
  { id: 'general', label: 'General', icon: <List className="h-3 w-3" />, wired: true },
  { id: 'constraint', label: 'Constraint', icon: <Shield className="h-3 w-3" />, wired: true },
  { id: 'link', label: 'Link', icon: <LinkIcon className="h-3 w-3" />, wired: false },
  { id: 'keyGroups', label: 'Key Groups', icon: <KeyRound className="h-3 w-3" />, wired: false },
  { id: 'style', label: 'Style', icon: <Palette className="h-3 w-3" />, wired: true },
  { id: 'definition', label: 'Definition', icon: <FileText className="h-3 w-3" />, wired: true },
  {
    id: 'businessTerms',
    label: 'Business Terms',
    icon: <BookOpen className="h-3 w-3" />,
    wired: false,
  },
  { id: 'whereUsed', label: 'Where Used', icon: <Workflow className="h-3 w-3" />, wired: false },
  { id: 'udp', label: 'UDP', icon: <Braces className="h-3 w-3" />, wired: true },
  { id: 'history', label: 'History', icon: <HistoryIcon className="h-3 w-3" />, wired: true },
  { id: 'notes', label: 'Notes', icon: <StickyNote className="h-3 w-3" />, wired: true },
  {
    id: 'extendedNotes',
    label: 'Extended',
    icon: <ScrollText className="h-3 w-3" />,
    wired: true,
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
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="text-xs italic text-text-secondary/60">
          Select an attribute above to inspect and edit its properties.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="attribute-property-editor">
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

function TabStrip({ active, onSelect }: { active: TabId; onSelect: (id: TabId) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Attribute properties"
      className="flex shrink-0 items-stretch gap-0 overflow-x-auto border-b border-white/10 bg-surface-2/60 backdrop-blur-sm"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-disabled={!tab.wired && !isActive}
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
    case 'history':
      return (
        <HistoryTab entityId={entityId} attributeId={attribute.id} loadHistory={loadHistory} />
      );
    case 'constraint':
      return (
        <StubTab
          title="Constraint"
          description="The scalar flags (PK / FK / NN / UQ) live in the grid above. Richer check constraints, domain rules, and referential actions will surface here when the check_constraint table lands."
          shipsIn="a follow-up"
        />
      );
    case 'definition':
      return (
        <StubTab
          title="Definition"
          description="Definition is editable inline from the grid and on the General tab. A richer Markdown-ready editor (with inline glossary links) lands in Step 11 polish."
          shipsIn="Step 11"
        />
      );
    case 'style':
      return (
        <StubTab
          title="Style"
          description="Per-attribute rendering hints — color, icon, visibility toggles — stored in the attribute's metadata JSONB. The editor UI is on deck."
          shipsIn="a follow-up"
        />
      );
    case 'udp':
      return (
        <StubTab
          title="User-Defined Properties"
          description="Free-form key-value pairs attached to an attribute. Backed by metadata JSONB. UI lights up when the first governance plugin needs them."
          shipsIn="a follow-up"
        />
      );
    case 'notes':
      return (
        <StubTab
          title="Notes"
          description="Short ephemeral notes distinct from the Definition. Reuses the description column for now until a dedicated notes column lands."
          shipsIn="a follow-up"
        />
      );
    case 'extendedNotes':
      return (
        <StubTab
          title="Extended Notes"
          description="Long-form documentation, stored in metadata JSONB so it doesn't bloat the attribute row. Upgrade path to full Markdown."
          shipsIn="Step 11"
        />
      );
    case 'link':
      return (
        <StubTab
          title="Attribute Links"
          description="Cross-layer attribute projections (logical ↔ physical) live in data_model_attribute_links. The UI ships when layers gain link-aware navigation."
          shipsIn="Step 7"
        />
      );
    case 'keyGroups':
      return (
        <StubTab
          title="Key Groups"
          description="Composite keys and unique constraint groupings. Inferred from PK + related attributes today; a dedicated schema arrives when physical-layer DDL demands it."
          shipsIn="Step 9"
        />
      );
    case 'businessTerms':
      return (
        <StubTab
          title="Business Terms Mapping"
          description="Binds physical columns to conceptual business terms via data_model_semantic_mappings. The editor lands with the semantic-layer bridge."
          shipsIn="Step 8"
        />
      );
    case 'whereUsed':
      return (
        <StubTab
          title="Where Used"
          description="Cross-model references — every relationship, link, or mapping pointing at this attribute. Needs a query layer that ships with the RAG chat work."
          shipsIn="Step 10"
        />
      );
    default:
      return null;
  }
}
