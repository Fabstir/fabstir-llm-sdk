'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, MoreVertical } from 'lucide-react';

export interface FolderNode {
  id: string;
  name: string;
  path: string;
  children: FolderNode[];
  fileCount: number;
}

interface FolderTreeProps {
  folders: FolderNode[];
  selectedPath?: string;
  onFolderSelect: (path: string) => void;
  onFolderAction?: (action: 'create' | 'rename' | 'delete', folder: FolderNode) => void;
}

interface FolderItemProps {
  folder: FolderNode;
  level: number;
  selectedPath?: string;
  onFolderSelect: (path: string) => void;
  onFolderAction?: (action: 'create' | 'rename' | 'delete', folder: FolderNode) => void;
}

function FolderItem({ folder, level, selectedPath, onFolderSelect, onFolderAction }: FolderItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const isSelected = selectedPath === folder.path;
  const hasChildren = folder.children.length > 0;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleSelect = () => {
    onFolderSelect(folder.path);
  };

  const handleAction = (e: React.MouseEvent, action: 'create' | 'rename' | 'delete') => {
    e.stopPropagation();
    setShowMenu(false);
    onFolderAction?.(action, folder);
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer transition-colors ${
          isSelected ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'
        }`}
        style={{
          paddingLeft: `${level * 20 + 12}px`,
          backgroundColor: isSelected ? 'rgb(239 246 255)' : undefined,
          color: isSelected ? 'rgb(30 58 138)' : undefined
        }}
        onClick={handleSelect}
      >
        {/* Expand/Collapse Button */}
        <button
          onClick={handleToggle}
          className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 ${
            !hasChildren ? 'invisible' : ''
          }`}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Folder Icon */}
        {isExpanded && hasChildren ? (
          <FolderOpen className={`h-4 w-4 flex-shrink-0 ${isSelected ? 'text-blue-700' : 'text-blue-600'}`} />
        ) : (
          <Folder className={`h-4 w-4 flex-shrink-0 ${isSelected ? 'text-blue-700' : 'text-blue-600'}`} />
        )}

        {/* Folder Name */}
        <span className={`flex-1 text-sm truncate font-medium ${isSelected ? 'text-blue-900' : ''}`}>{folder.name}</span>

        {/* File Count */}
        {folder.fileCount > 0 ? (
          <span className={`text-xs ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>{folder.fileCount}</span>
        ) : isSelected ? (
          <span className="text-xs text-blue-600 italic">empty</span>
        ) : null}

        {/* Actions Menu */}
        {onFolderAction && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 transition-opacity"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                <button
                  onClick={(e) => handleAction(e, 'create')}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                >
                  New Subfolder
                </button>
                <button
                  onClick={(e) => handleAction(e, 'rename')}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Rename
                </button>
                <button
                  onClick={(e) => handleAction(e, 'delete')}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              level={level + 1}
              selectedPath={selectedPath}
              onFolderSelect={onFolderSelect}
              onFolderAction={onFolderAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * FolderTree - Hierarchical folder navigation
 *
 * Features:
 * - Expand/collapse folders
 * - Select folders to view contents
 * - Context menu for folder actions
 * - File count badges
 */
export function FolderTree({ folders, selectedPath, onFolderSelect, onFolderAction }: FolderTreeProps) {
  return (
    <div className="space-y-1">
      {folders.length > 0 ? (
        folders.map((folder) => (
          <FolderItem
            key={folder.id}
            folder={folder}
            level={0}
            selectedPath={selectedPath}
            onFolderSelect={onFolderSelect}
            onFolderAction={onFolderAction}
          />
        ))
      ) : (
        <div className="text-center py-8 text-gray-500 text-sm">
          No folders yet
        </div>
      )}
    </div>
  );
}
