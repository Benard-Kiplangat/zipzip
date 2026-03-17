import React from 'react';
import { db } from '../db';

export default function SyncButton() {
  const handleBackup = async () => {
    const allDocs = await db.allDocs({ include_docs: true });
    const data = allDocs.rows.map(row => row.doc);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = JSON.parse(e.target.result);
      for (const doc of data) {
        delete doc._rev;
        try {
          const existing = await db.get(doc._id);
          await db.put({ ...doc, ...existing });
        } catch (err) {
          if (err.name === "not_found") {
             await db.put(doc);
          }
        }
      }
      alert('Data restored successfully!');
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex mt-4">
      <button
        onClick={handleBackup}
        className="bg-green-300 text-white px-4 py-2 rounded hover:bg-green-600"
      >
        Backup Data
      </button>
      <label className="bg-blue-300 text-white ml-2 px-4 py-2 rounded hover:bg-blue-600 cursor-pointer">
        Restore Data
        <input
          type="file"
          accept="application/json"
          onChange={handleRestore}
          className="hidden"
        />
      </label>
    </div>
  );
}