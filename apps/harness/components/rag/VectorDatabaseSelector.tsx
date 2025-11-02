/**
 * VectorDatabaseSelector Component
 * Multi-database selection UI for RAG inference
 * Max 250 lines
 */

import React, { useState, useEffect } from 'react';
import type { DatabaseMetadata } from '@fabstir/sdk-core/database/types';

interface VectorDatabaseSelectorProps {
  /** Available databases from DatabaseRegistry */
  databases: DatabaseMetadata[];

  /** Currently selected database names */
  selectedDatabases: string[];

  /** Callback when selection changes */
  onSelectionChange: (selectedNames: string[]) => void;

  /** Optional CSS class */
  className?: string;
}

export function VectorDatabaseSelector({
  databases,
  selectedDatabases,
  onSelectionChange,
  className = '',
}: VectorDatabaseSelectorProps) {
  // Handle undefined databases with explicit fallback
  const safeDatabases = databases ?? [];
  const safeSelectedDatabases = selectedDatabases ?? [];

  // Filter only vector databases
  const vectorDatabases = safeDatabases.filter(db => db.type === 'vector');

  // Validate databases structure (error handling)
  const validDatabases = databases.map(database => ({
    ...database,
    name: database.databaseName // Alias for compatibility
  }));

  // Handle individual checkbox selection
  const handleSelectionChange = (databaseName: string) => {
    const isSelected = selectedDatabases.includes(databaseName);
    let updatedSelection: string[];

    if (isSelected) {
      // Deselect
      updatedSelection = selectedDatabases.filter(name => name !== databaseName);
    } else {
      // Select
      updatedSelection = [...selectedDatabases, databaseName];
    }

    onSelectionChange(updatedSelection);
  };

  // Handle Select All
  const handleSelectAll = () => {
    const allDatabaseNames = vectorDatabases.map(db => db.databaseName);
    onSelectionChange(allDatabaseNames);
  };

  // Handle Clear All
  const handleClearAll = () => {
    onSelectionChange([]);
  };

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className={`vector-database-selector ${className}`}>
      {/* Header */}
      <div className="selector-header">
        <h3>Vector Databases</h3>
        <div className="actions">
          <button
            onClick={handleSelectAll}
            disabled={vectorDatabases.length === 0}
            className="btn-select-all"
            aria-label="Select All"
          >
            Select All
          </button>
          <button
            onClick={handleClearAll}
            disabled={selectedDatabases.length === 0}
            className="btn-clear-all"
            aria-label="Clear All"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Database List */}
      {databases.length === 0 || vectorDatabases.length === 0 ? (
        <div className="empty-state">
          <p>No vector databases available</p>
        </div>
      ) : (
        <div className="database-list">
          {databases.map(database => {
            // Skip non-vector databases
            if (database.type !== 'vector') return null;

            // Validate database structure (ensure database.name exists)
            const databaseName = database.databaseName || database.name;
            const isSelected = selectedDatabases.includes(databaseName);

            return (
              <div key={database.databaseName} className="database-item">
                <label
                  htmlFor={`db-checkbox-${database.databaseName}`}
                  className="database-label"
                >
                  <input
                    id={`db-checkbox-${database.databaseName}`}
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectionChange(database.databaseName)}
                    className="database-checkbox"
                    aria-label={`Select ${database.databaseName}`}
                  />
                  <div className="database-info">
                    <div className="database-name">
                      {database.databaseName}
                    </div>
                    <div className="database-metadata">
                      <span className="metadata-item">
                        {database.vectorCount} vectors
                      </span>
                      <span className="metadata-item">
                        {formatBytes(database.storageSizeBytes)} size
                      </span>
                      {database.description && (
                        <span className="metadata-item description">
                          {database.description}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Workspace */}
      <div className="active-workspace">
        <h4>Active Workspace</h4>
        {selectedDatabases.length === 0 ? (
          <p className="no-selection">No databases selected</p>
        ) : (
          <div className="selected-list">
            <p className="selection-count">
              {selectedDatabases.length} database{selectedDatabases.length !== 1 ? 's' : ''} selected
            </p>
            <ul className="selected-items">
              {selectedDatabases.map(name => (
                <li key={name} className="selected-item">
                  {name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Inline Styles for Demo */}
      <style jsx>{`
        .vector-database-selector {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 16px;
          background: white;
        }

        .selector-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .selector-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .actions {
          display: flex;
          gap: 8px;
        }

        .btn-select-all,
        .btn-clear-all {
          padding: 6px 12px;
          font-size: 14px;
          border: 1px solid #007bff;
          background: white;
          color: #007bff;
          border-radius: 4px;
          cursor: pointer;
        }

        .btn-select-all:hover,
        .btn-clear-all:hover {
          background: #007bff;
          color: white;
        }

        .btn-select-all:disabled,
        .btn-clear-all:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .empty-state {
          padding: 32px;
          text-align: center;
          color: #666;
        }

        .database-list {
          max-height: 400px;
          overflow-y: auto;
          margin-bottom: 16px;
        }

        .database-item {
          padding: 12px;
          border: 1px solid #eee;
          border-radius: 4px;
          margin-bottom: 8px;
        }

        .database-item:hover {
          background: #f9f9f9;
        }

        .database-label {
          display: flex;
          align-items: flex-start;
          cursor: pointer;
        }

        .database-checkbox {
          margin-right: 12px;
          margin-top: 4px;
        }

        .database-info {
          flex: 1;
        }

        .database-name {
          font-weight: 600;
          margin-bottom: 4px;
        }

        .database-metadata {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 13px;
          color: #666;
        }

        .metadata-item {
          display: inline-block;
        }

        .metadata-item.description {
          font-style: italic;
        }

        .active-workspace {
          border-top: 1px solid #ddd;
          padding-top: 16px;
        }

        .active-workspace h4 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .no-selection {
          color: #999;
          font-style: italic;
        }

        .selected-list {
          padding: 12px;
          background: #f0f8ff;
          border-radius: 4px;
        }

        .selection-count {
          margin: 0 0 8px 0;
          font-weight: 600;
          color: #007bff;
        }

        .selected-items {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .selected-item {
          padding: 4px 0;
        }
      `}</style>
    </div>
  );
}
