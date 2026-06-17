import React, { useRef } from 'react';
import { db } from '../db';

export default function SyncButton() {
  const fileInputRef = useRef(null);

  const handleBackup = async () => {
    const all = await db.allDocs({ include_docs: false });
    // fetch each doc with attachments to ensure full fidelity
    const docs = await Promise.all(all.rows.map(r => db.get(r.id, { attachments: true }).catch(() => null)));
    const filteredDocs = docs.filter(Boolean);

    const counts = filteredDocs.reduce((acc, d) => {
      const t = d.type || 'unknown';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    const data = {
      exportedAt: new Date().toISOString(),
      version: 2,
      summary: { total: filteredDocs.length, byType: counts },
      docs: filteredDocs,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `zippos-export-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      let payload;
      try {
        payload = JSON.parse(e.target.result);
      } catch (err) {
        alert('Invalid JSON file. Please select a valid export file.');
        return;
      }

      const docs = Array.isArray(payload) ? payload : payload.docs;
      if (!Array.isArray(docs)) {
        alert('This file does not appear to be a valid export.');
        return;
      }

      if (!window.confirm('Importing will replace all current data and restore the exported database state. Continue?')) {
        return;
      }

      try {
        const existing = await db.allDocs({ include_docs: true });
        // mark all existing docs as deleted
        const deletions = existing.rows.map(row => {
          const doc = row.doc || {};
          return { _id: doc._id || row.id, _rev: doc._rev, _deleted: true };
        }).filter(d => d._id && d._rev);

        if (deletions.length) {
          await db.bulkDocs(deletions);
        }

        // Insert exported docs preserving ids/revs/attachments
        // Some imports may include design docs or docs without _rev; bulkDocs with new_edits:false will accept provided _rev
        await db.bulkDocs(docs, { new_edits: false });
        alert('Import complete. Your database now matches the exported data.');
      } catch (err) {
        console.error('Import failed', err);
        alert('Failed to import data. Check the console for details.');
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      <button
        onClick={handleBackup}
        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
      >
        Export All Data
      </button>
      <label className="bg-blue-500 text-white ml-2 px-4 py-2 rounded hover:bg-blue-600 cursor-pointer">
        Import Data
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleRestore}
          className="hidden"
        />
      </label>
    </div>
  );
}