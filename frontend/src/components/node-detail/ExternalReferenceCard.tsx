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
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
  },
  stale: {
    label: 'Stale',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
  },
  unknown: {
    label: 'Unknown',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
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
    <div className="rounded-lg border border-gray-200 bg-white p-3 hover:border-gray-300 transition-colors">
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
            <span className="font-medium text-sm text-gray-900 truncate">
              {displayTitle}
            </span>
            {reference.canonical_url && (
              <a
                href={reference.canonical_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                title="Open in external system"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          {/* Meta row: Type + Status + Freshness */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-gray-500">
              {systemConfig.label} {reference.object_type}
            </span>
            {displayStatus && (
              <span className="inline-block px-1.5 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700">
                {displayStatus}
              </span>
            )}
            <span
              className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded ${freshnessConfig.bgColor} ${freshnessConfig.textColor}`}
            >
              {freshnessConfig.label}
            </span>
            <span className="inline-block px-1.5 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">
              {RELATIONSHIP_LABELS[nodeRef.relationship]}
            </span>
          </div>

          {/* Summary (if available) */}
          {displaySummary && (
            <p className="text-xs text-gray-600 mt-2 line-clamp-2">
              {displaySummary}
            </p>
          )}

          {/* Footer: Owner + Last fetched */}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
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
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
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
              <div className="absolute right-0 top-8 z-20 w-40 rounded-md border border-gray-200 bg-white shadow-lg">
                <button
                  onClick={() => {
                    onRefresh();
                    setShowMenu(false);
                  }}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={() => {
                    onSnapshot();
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50"
                >
                  <Camera className="h-4 w-4" />
                  Snapshot
                </button>
                <hr className="my-1" />
                <button
                  onClick={() => {
                    onUnlink();
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-red-600 hover:bg-red-50"
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
