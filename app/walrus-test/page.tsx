'use client';

import { useEffect, useState } from 'react';
import {
  createBasicWalrusClient,
  writeWalrusBlob,
  readWalrusBlob,
  writeWalrusFiles,
  createWalrusFileFromString,
  readWalrusQuiltPatch,
  deleteWalrusBlob,
  listQuiltPatches,
  OWNER_KEYPAIR,
} from '@/lib/walrus';
import type { QuiltPatchSummary } from '@/lib/walrus';
import { getAllBlobObjects, type BlobObject } from '@/lib/graphql';

const generateEntryId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
};

export default function WalrusTestPage() {
  const uploadRelayHost =
    process.env.NEXT_PUBLIC_WALRUS_UPLOAD_RELAY_HOST || 'https://upload-relay.testnet.walrus.space';
  const [blobContent, setBlobContent] = useState('Hello from the TS SDK!!!\n');
  const [blobId, setBlobId] = useState('');
  const [readBlobId, setReadBlobId] = useState('');
  const [epochs, setEpochs] = useState(3);
  const [deletable, setDeletable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [blobs, setBlobs] = useState<BlobObject[]>([]);
  const [ownedLoading, setOwnedLoading] = useState(false);
  const [ownedError, setOwnedError] = useState<string>('');
  const [readingBlobAddress, setReadingBlobAddress] = useState<string | null>(null);
  const [deletingBlobAddress, setDeletingBlobAddress] = useState<string | null>(null);
  const [ownedReadResult, setOwnedReadResult] = useState<{ blobId: string; content: string } | null>(null);
  const [quiltEntries, setQuiltEntries] = useState([
    { id: generateEntryId(), identifier: 'entry-1', content: 'First quilt entry' },
  ]);
  const [quiltLoading, setQuiltLoading] = useState(false);
  const [quiltError, setQuiltError] = useState<string>('');
  const [quiltResult, setQuiltResult] = useState<{
    blobId: string;
    patches: { identifier: string; patchId: string }[];
  } | null>(null);
  const [quiltPatchId, setQuiltPatchId] = useState('');
  const [quiltPatchLoading, setQuiltPatchLoading] = useState(false);
  const [quiltPatchError, setQuiltPatchError] = useState<string>('');
  const [quiltPatchResult, setQuiltPatchResult] = useState<{
    identifier?: string;
    content: string;
  } | null>(null);
  const [quiltPatchStates, setQuiltPatchStates] = useState<
    Record<string, { loading: boolean; error?: string; patches?: QuiltPatchSummary[] }>
  >({});

  const handleWriteBlob = async () => {
    setLoading(true);
    setError('');
    setResult('');
    
    try {
      const client = createBasicWalrusClient();
      const blob = new TextEncoder().encode(blobContent);
      
      const { blobId: id } = await writeWalrusBlob(
        client,
        blob,
        epochs,
        deletable,
        OWNER_KEYPAIR
      );
      
      setBlobId(id);
      setResult(`Blob written successfully!\nBlob ID: ${id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to write blob');
    } finally {
      setLoading(false);
    }
  };

  const handleQuiltEntryChange = (
    entryId: string,
    field: 'identifier' | 'content',
    value: string
  ) => {
    setQuiltEntries((current) =>
      current.map((entry) =>
        entry.id === entryId ? { ...entry, [field]: value } : entry
      )
    );
  };

  const handleReadQuiltPatch = async () => {
    setQuiltPatchLoading(true);
    setQuiltPatchError('');
    setQuiltPatchResult(null);

    try {
      const client = createBasicWalrusClient();
      const patch = await readWalrusQuiltPatch(client, quiltPatchId.trim());
      const text = new TextDecoder().decode(patch.contents);
      setQuiltPatchResult({
        identifier: patch.identifier,
        content: text,
      });
    } catch (err: any) {
      setQuiltPatchError(err.message || 'Failed to read quilt patch');
    } finally {
      setQuiltPatchLoading(false);
    }
  };

  const handleAddQuiltEntry = () => {
    setQuiltEntries((current) => [
      ...current,
      {
        id: generateEntryId(),
        identifier: `entry-${current.length + 1}`,
        content: '',
      },
    ]);
  };

  const handleRemoveQuiltEntry = (entryId: string) => {
    setQuiltEntries((current) =>
      current.length > 1 ? current.filter((entry) => entry.id !== entryId) : current
    );
  };

  const handleWriteQuilt = async () => {
    const sanitizedEntries = quiltEntries
      .map((entry, index) => ({
        identifier: entry.identifier.trim() || `entry-${index + 1}`,
        content: entry.content,
      }))
      .filter((entry) => entry.content.trim().length > 0);

    if (sanitizedEntries.length === 0) {
      setQuiltError('Add at least one entry with content to create a quilt.');
      return;
    }

    setQuiltLoading(true);
    setQuiltError('');
    setQuiltResult(null);

    try {
      const client = createBasicWalrusClient();
      const files = sanitizedEntries.map((entry) =>
        createWalrusFileFromString(entry.content, entry.identifier, {
          'content-type': 'text/plain',
        })
      );

      const writeResults = await writeWalrusFiles(client, {
        files,
        epochs,
        deletable,
        signer: OWNER_KEYPAIR,
      });

      if (!writeResults.length) {
        throw new Error('Quilt write returned no patches.');
      }

      setQuiltResult({
        blobId: writeResults[0].blobId,
        patches: writeResults.map((result, index) => ({
          identifier: sanitizedEntries[index]?.identifier ?? `entry-${index + 1}`,
          patchId: result.id,
        })),
      });

      await loadOwnedBlobs();
    } catch (err: any) {
      setQuiltError(err.message || 'Failed to write quilt');
    } finally {
      setQuiltLoading(false);
    }
  };

  const handleReadBlob = async () => {
    setLoading(true);
    setError('');
    setResult('');
    
    try {
      const client = createBasicWalrusClient();
      const blob = await readWalrusBlob(client, readBlobId);
      const text = new TextDecoder().decode(blob);
      
      setResult(`Blob read successfully!\nContent:\n${text}`);
    } catch (err: any) {
      setError(err.message || 'Failed to read blob');
    } finally {
      setLoading(false);
    }
  };

  const loadOwnedBlobs = async () => {
    setOwnedLoading(true);
    setOwnedError('');
    try {
      const blobItems = await getAllBlobObjects();
      setBlobs(blobItems);
    } catch (err: any) {
      setOwnedError(err.message || 'Failed to load blobs');
    } finally {
      setOwnedLoading(false);
    }
  };

  const handleReadOwnedBlob = async (blob: BlobObject) => {
    setReadingBlobAddress(blob.address);
    setError('');
    setOwnedReadResult(null);
    
    try {
      const client = createBasicWalrusClient();
      const blobData = await readWalrusBlob(client, blob.blobId);
      const text = new TextDecoder().decode(blobData);
      setOwnedReadResult({ blobId: blob.address, content: text });
    } catch (err: any) {
      setError(`Failed to read blob: ${err.message}`);
    } finally {
      setReadingBlobAddress(null);
    }
  };

  const handleDeleteOwnedBlob = async (blob: BlobObject) => {
    if (!confirm('Delete this blob?')) {
      return;
    }

    setDeletingBlobAddress(blob.address);
    setError('');

    try {
      const client = createBasicWalrusClient();
      await deleteWalrusBlob(client, blob.address);
      setOwnedReadResult(null);
      await loadOwnedBlobs();
    } catch (err: any) {
      setError(`Failed to delete blob: ${err.message}`);
    } finally {
      setDeletingBlobAddress(null);
    }
  };

  const handleLoadQuiltPatches = async (blob: BlobObject) => {
    setQuiltPatchStates((prev) => ({
      ...prev,
      [blob.blobId]: { loading: true, error: undefined, patches: prev[blob.blobId]?.patches },
    }));

    try {
      const client = createBasicWalrusClient();
      const patches = await listQuiltPatches(client, blob.blobId);
      setQuiltPatchStates((prev) => ({
        ...prev,
        [blob.blobId]: { loading: false, error: undefined, patches },
      }));
    } catch (err: any) {
      setQuiltPatchStates((prev) => ({
        ...prev,
        [blob.blobId]: {
          loading: false,
          error: err.message || 'Failed to list quilt patches',
          patches: [],
        },
      }));
    }
  };

  useEffect(() => {
    loadOwnedBlobs();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-black dark:text-zinc-50">
          Walrus SDK Test Page
        </h1>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Using configured OWNER_KEYPAIR for all write operations.
          </p>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Upload relay: {uploadRelayHost}
          </p>
        </div>

        {/* Write Blob Section */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
            Write Blob
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-50">
                Blob Content
              </label>
              <textarea
                value={blobContent}
                onChange={(e) => setBlobContent(e.target.value)}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-black dark:text-zinc-50"
              />
            </div>
            <div className="flex gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-50">
                  Epochs
                </label>
                <input
                  type="number"
                  value={epochs}
                  onChange={(e) => setEpochs(parseInt(e.target.value) || 3)}
                  className="w-24 px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-black dark:text-zinc-50"
                />
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  checked={deletable}
                  onChange={(e) => setDeletable(e.target.checked)}
                  className="w-4 h-4"
                />
                <label className="text-sm text-black dark:text-zinc-50">
                  Deletable
                </label>
              </div>
            </div>
            <button
              onClick={handleWriteBlob}
              disabled={loading}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Writing...' : 'Write Blob'}
            </button>
            {blobId && (
              <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm text-green-800 dark:text-green-200">
                Blob ID: {blobId}
              </div>
            )}
          </div>
        </div>

        {/* Read Blob Section */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
            Read Blob
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-50">
                Blob ID
              </label>
              <input
                type="text"
                value={readBlobId}
                onChange={(e) => setReadBlobId(e.target.value)}
                placeholder="Enter blob ID to read"
                className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-black dark:text-zinc-50"
              />
            </div>
            <button
              onClick={handleReadBlob}
              disabled={loading || !readBlobId}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Reading...' : 'Read Blob'}
            </button>
          </div>
        </div>

        {/* Quilt Writer Section */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-2 text-black dark:text-zinc-50">
            Write Quilt (Batch)
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Combine multiple small files into a single Walrus blob to reduce storage and gas costs.
            Each entry becomes a quilt patch with its own identifier.
          </p>

          <div className="space-y-4">
            {quiltEntries.map((entry, index) => (
              <div
                key={entry.id}
                className="border border-gray-200 dark:border-zinc-800 rounded-lg p-4 bg-zinc-50 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-black dark:text-zinc-50">
                    Entry {index + 1}
                  </p>
                  {quiltEntries.length > 1 && (
                    <button
                      onClick={() => handleRemoveQuiltEntry(entry.id)}
                      className="text-sm text-red-600 hover:text-red-500"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-black dark:text-zinc-50">
                      Identifier
                    </label>
                    <input
                      type="text"
                      value={entry.identifier}
                      onChange={(e) =>
                        handleQuiltEntryChange(entry.id, 'identifier', e.target.value)
                      }
                      className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-black dark:text-zinc-50"
                      placeholder="e.g., summary-1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-black dark:text-zinc-50">
                      Content
                    </label>
                    <textarea
                      value={entry.content}
                      onChange={(e) =>
                        handleQuiltEntryChange(entry.id, 'content', e.target.value)
                      }
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-black dark:text-zinc-50"
                      placeholder="Enter the text you want to store"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <button
              onClick={handleAddQuiltEntry}
              className="px-4 py-2 border border-gray-300 dark:border-zinc-700 text-sm rounded-md text-black dark:text-zinc-50 hover:bg-gray-100 dark:hover:bg-zinc-800"
            >
              Add Entry
            </button>
            <button
              onClick={handleWriteQuilt}
              disabled={quiltLoading}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {quiltLoading ? 'Writing Quilt...' : 'Write Quilt'}
            </button>
          </div>

          {(quiltError || quiltResult) && (
            <div className="mt-4">
              {quiltError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-700 dark:text-red-300">
                  {quiltError}
                </div>
              )}
              {quiltResult && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded text-sm text-green-800 dark:text-green-200 space-y-3">
                  <div>
                    <p className="font-semibold">Quilt Blob ID</p>
                    <p className="font-mono break-all">{quiltResult.blobId}</p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Patches</p>
                    <ul className="space-y-2">
                      {quiltResult.patches.map((patch) => (
                        <li key={patch.patchId} className="font-mono text-sm break-all">
                          <span className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400 mr-2">
                            {patch.identifier}:
                          </span>
                          {patch.patchId}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Read Quilt Patch Section */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
            Read Quilt Patch
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Paste a quilt patch ID (from the write response) to retrieve the specific entry.
            Aggregator reads are attempted first, with automatic fallback to direct Walrus reads.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-50">
                Quilt Patch ID
              </label>
              <input
                type="text"
                value={quiltPatchId}
                onChange={(e) => setQuiltPatchId(e.target.value)}
                placeholder="Enter patch ID or quiltId::identifier"
                className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-black dark:text-zinc-50 font-mono"
              />
            </div>
            <button
              onClick={handleReadQuiltPatch}
              disabled={quiltPatchLoading || quiltPatchId.trim().length === 0}
              className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {quiltPatchLoading ? 'Reading Patch...' : 'Read Quilt Patch'}
            </button>
          </div>
          {(quiltPatchError || quiltPatchResult) && (
            <div className="mt-4">
              {quiltPatchError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-700 dark:text-red-300">
                  {quiltPatchError}
                </div>
              )}
              {quiltPatchResult && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded text-sm text-green-800 dark:text-green-200 space-y-3">
                  {quiltPatchResult.identifier && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400">
                        Identifier
                      </p>
                      <p className="font-mono break-all text-black dark:text-zinc-50">
                        {quiltPatchResult.identifier}
                      </p>
                    </div>
                  )}
                  <pre className="bg-white dark:bg-black/40 border border-gray-200 dark:border-zinc-800 rounded p-4 text-sm whitespace-pre-wrap break-words text-black dark:text-zinc-50">
                    {quiltPatchResult.content}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Owned Blobs Section */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              Owned Blobs
            </h2>
            <button
              onClick={loadOwnedBlobs}
              disabled={ownedLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
            >
              {ownedLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          {ownedError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded mb-4 text-sm text-red-700 dark:text-red-300">
              {ownedError}
            </div>
          )}
          {ownedLoading && blobs.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">Loading blobs...</p>
          ) : blobs.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">No blobs found.</p>
          ) : (
            <div className="space-y-4">
              {blobs.map((blob) => (
                <div
                  key={blob.address}
                  className="border border-gray-200 dark:border-zinc-800 rounded-lg p-4 bg-zinc-50 dark:bg-zinc-900"
                >
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Object Address</div>
                  <div className="text-sm font-mono break-all text-gray-800 dark:text-gray-200 mb-2">
                    {blob.address}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Blob ID</div>
                  <div className="text-sm font-mono break-all text-blue-600 dark:text-blue-400 mb-2">
                    {blob.blobId}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Size: {blob.size} bytes · Deletable: {blob.deletable ? 'Yes' : 'No'}
                  </div>
                  <div className="mt-4 flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleReadOwnedBlob(blob)}
                      disabled={
                        readingBlobAddress === blob.address ||
                        deletingBlobAddress === blob.address
                      }
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                    >
                      {readingBlobAddress === blob.address ? 'Reading...' : 'Read'}
                    </button>
                    {blob.deletable && (
                      <button
                        onClick={() => handleDeleteOwnedBlob(blob)}
                        disabled={
                          readingBlobAddress === blob.address ||
                          deletingBlobAddress === blob.address
                        }
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                      >
                        {deletingBlobAddress === blob.address ? 'Deleting...' : 'Delete'}
                      </button>
                    )}
                    <button
                      onClick={() => handleLoadQuiltPatches(blob)}
                      disabled={quiltPatchStates[blob.blobId]?.loading}
                      className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                    >
                      {quiltPatchStates[blob.blobId]?.loading ? 'Loading patches...' : 'Load Quilt Patches'}
                    </button>
                  </div>
                  {quiltPatchStates[blob.blobId] && (
                    <div className="mt-4">
                      {quiltPatchStates[blob.blobId]?.error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-700 dark:text-red-300">
                          {quiltPatchStates[blob.blobId]?.error}
                        </div>
                      )}
                      {!quiltPatchStates[blob.blobId]?.error && (
                        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded text-sm text-purple-900 dark:text-purple-200 space-y-2">
                          {(quiltPatchStates[blob.blobId]?.patches?.length ?? 0) > 0 ? (
                            <ul className="space-y-2">
                              {quiltPatchStates[blob.blobId]?.patches?.map((patch) => (
                                <li key={patch.patchId} className="flex flex-col gap-1">
                                  <span className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400">
                                    {patch.identifier || 'Unnamed patch'}
                                  </span>
                                  <code className="text-xs font-mono break-all text-purple-700 dark:text-purple-200">
                                    {patch.patchId}
                                  </code>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setQuiltPatchId(patch.patchId)}
                                      className="px-3 py-1 text-xs border border-purple-400 text-purple-700 dark:text-purple-200 rounded hover:bg-purple-100 dark:hover:bg-purple-800/40"
                                    >
                                      Use in reader
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs">
                              No quilt patches detected for this blob.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {ownedReadResult && (
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow mb-6">
            <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
              Owned Blob Content
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Blob ID</p>
            <p className="text-sm font-mono break-all text-gray-800 dark:text-gray-200 mb-4">
              {ownedReadResult.blobId}
            </p>
            <pre className="bg-zinc-50 dark:bg-black/40 border border-gray-200 dark:border-zinc-800 rounded p-4 text-sm whitespace-pre-wrap break-words text-gray-900 dark:text-zinc-100">
              {ownedReadResult.content}
            </pre>
          </div>
        )}

        {/* Results Section */}
        {(result || error) && (
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
              Results
            </h2>
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-md mb-4">
                <p className="text-red-800 dark:text-red-200 font-semibold">Error:</p>
                <pre className="text-red-700 dark:text-red-300 whitespace-pre-wrap text-sm mt-2">
                  {error}
                </pre>
              </div>
            )}
            {result && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-md">
                <p className="text-green-800 dark:text-green-200 font-semibold">Success:</p>
                <pre className="text-green-700 dark:text-green-300 whitespace-pre-wrap text-sm mt-2">
                  {result}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

