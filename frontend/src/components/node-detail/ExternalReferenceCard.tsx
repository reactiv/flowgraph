'use client';

import { useState } from 'react';
import {
  ExternalLink,
  RefreshCw,
  Camera,
  Unlink,
  MoreVertical,
  FileText,
  Database,
  Folder,
} from 'lucide-react';
import type {
  NodeExternalRefWithDetails,
  ReferenceRelationship,
} from '@/types/external-reference';
import {
  getProjectionFreshnessStatus,
  formatTimeSinceFetch,
} from '@/types/external-reference';
import { card, button, elevatedCard } from '@/lib/theme';

interface ExternalReferenceCardProps {
  nodeRef: NodeExternalRefWithDetails;
  onRefresh: () => void;
  onSnapshot: () => void;
  onUnlink: () => void;
  isRefreshing?: boolean;
}

const SYSTEM_CONFIG: Record<string, { icon: typeof FileText; label: string; bgColor: string; textColor: string }> = {
  notion: {
    icon: FileText,
    label: 'Notion',
    bgColor: 'bg-gray-900',
    textColor: 'text-white',
  },
  gdrive: {
    icon: Folder,
    label: 'Google Drive',
    bgColor: 'bg-green-600',
    textColor: 'text-white',
  },
  github: {
    icon: Database,
    label: 'GitHub',
    bgColor: 'bg-gray-800',
    textColor: 'text-white',
  },
};

const RELATIONSHIP_LABELS: Record<ReferenceRelationship, string> = {
  source: 'Source',
  related: 'Related',
  derived_from: 'Derived From',
};

const FRESHNESS_CONFIG = {
  fresh: {
    label: 'Fresh',
    bgColor: 'bg-emerald-500/15',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
  },
  stale: {
    label: 'Stale',
    bgColor: 'bg-amber-500/15',
    textColor: 'text-amber-400',
    borderColor: 'border-amber-500/30',
  },
  unknown: {
    label: 'Unknown',
    bgColor: 'bg-slate-500/15',
    textColor: 'text-slate-400',
    borderColor: 'border-slate-500/30',
  },
};

export function ExternalReferenceCard({
  nodeRef,
  onRefresh,
  onSnapshot,
  onUnlink,
  isRefreshing = false,
}: ExternalReferenceCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const { reference } = nodeRef;
  const { projection } = reference;

  // Get system configuration
  const systemConfig = SYSTEM_CONFIG[reference.system] || {
    icon: FileText,
    label: reference.system,
    bgColor: 'bg-gray-600',
    textColor: 'text-white',
  };
  const SystemIcon = systemConfig.icon;

  // Get freshness status
  const freshnessStatus = getProjectionFreshnessStatus(projection);
  const freshnessConfig = FRESHNESS_CONFIG[freshnessStatus];

  // Display title
  const displayTitle = projection?.title || reference.display_name || 'Untitled';
  const displaySummary = projection?.summary;
  const displayOwner = projection?.owner;
  const displayStatus = projection?.status;

  return (
    <div className={`${card.base} p-3 ${card.hover} transition-colors`}>
      {/* Header row: System badge + Title + Actions */}
      <div className="flex items-start gap-3">
        {/* System badge */}
        <div
          className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded ${systemConfig.bgColor}`}
        >
          <SystemIcon className={`h-4 w-4 ${systemConfig.textColor}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground truncate">
              {displayTitle}
            </span>
            {reference.canonical_url && (
              <a
                href={reference.canonical_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Open in external system"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          {/* Meta row: Type + Status + Freshness */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {systemConfig.label} {reference.object_type}
            </span>
            {displayStatus && (
              <span className="inline-block px-1.5 py-0.5 text-xs font-medium rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
                {displayStatus}
              </span>
            )}
            <span
              className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded border ${freshnessConfig.bgColor} ${freshnessConfig.textColor} ${freshnessConfig.borderColor}`}
            >
              {freshnessConfig.label}
            </span>
            <span className="inline-block px-1.5 py-0.5 text-xs font-medium rounded bg-slate-500/15 text-slate-400 border border-slate-500/30">
              {RELATIONSHIP_LABELS[nodeRef.relationship]}
            </span>
          </div>

          {/* Summary (if available) */}
          {displaySummary && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
              {displaySummary}
            </p>
          )}

          {/* Footer: Owner + Last fetched */}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            {displayOwner && <span>Owner: {displayOwner}</span>}
            {projection && (
              <span>Fetched {formatTimeSinceFetch(projection)}</span>
            )}
          </div>
        </div>

        {/* Actions dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={button.icon}
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {showMenu && (
            <>
              {/* Backdrop to close menu */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />

              {/* Dropdown menu */}
              <div className={`absolute right-0 top-8 z-20 w-40 ${elevatedCard.base}`}>
                <button
                  onClick={() => {
                    onRefresh();
                    setShowMenu(false);
                  }}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={() => {
                    onSnapshot();
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors"
                >
                  <Camera className="h-4 w-4" />
                  Snapshot
                </button>
                <hr className="my-1 border-border" />
                <button
                  onClick={() => {
                    onUnlink();
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Unlink className="h-4 w-4" />
                  Unlink
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
