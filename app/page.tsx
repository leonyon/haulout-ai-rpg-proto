'use client';

import { useState, useEffect } from 'react';
import { getAllBlobObjects, type BlobObject } from '@/lib/graphql';

export default function Home() {
  console.log('Home component rendering');
  
  const [blobs, setBlobs] = useState<BlobObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [readingBlobId, setReadingBlobId] = useState<string | null>(null);
  const [deletingBlobId, setDeletingBlobId] = useState<string | null>(null);
  const [readResult, setReadResult] = useState<{ blobId: string; content: string } | null>(null);

  const loadBlobs = async () => {
    setLoading(true);
    setError('');
    try {
      console.log('Loading blobs...');
      const blobItems = await getAllBlobObjects();
      console.log('Loaded blobs:', blobItems);
      setBlobs(blobItems);
    } catch (err: any) {
      console.error('Error loading blobs:', err);
      setError(err.message || 'Failed to load blobs');
    } finally {
      setLoading(false);
    }
  };

  const handleReadBlob = async (blob: BlobObject) => {
    setReadingBlobId(blob.address);
    setError('');
    setReadResult(null);
    
    try {
      const { createBasicWalrusClient, readWalrusBlob } = await import('@/lib/walrus');
      const client = createBasicWalrusClient();
      const blobData = await readWalrusBlob(client, blob.blobId);
      const text = new TextDecoder().decode(blobData);
      setReadResult({ blobId: blob.address, content: text });
    } catch (err: any) {
      setError(`Failed to read blob: ${err.message}`);
    } finally {
      setReadingBlobId(null);
    }
  };

  const handleDeleteBlob = async (blob: BlobObject) => {
    if (!confirm('Are you sure you want to delete this blob?')) {
      return;
    }

    setDeletingBlobId(blob.address);
    setError('');
    
    try {
      const { createBasicWalrusClient, deleteWalrusBlob } = await import('@/lib/walrus');
      const client = createBasicWalrusClient();
      const { digest } = await deleteWalrusBlob(client, blob.address);
      setReadResult(null);
      // Reload blobs after deletion
      await loadBlobs();
      alert(`Blob deleted successfully!\nTransaction Digest: ${digest}`);
    } catch (err: any) {
      setError(`Failed to delete blob: ${err.message}`);
    } finally {
      setDeletingBlobId(null);
    }
  };

  useEffect(() => {
    console.log('useEffect triggered, calling loadBlobs');
    loadBlobs();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-4xl flex-col py-32 px-16 bg-white dark:bg-black">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50 mb-4">
            Blob Objects
          </h1>
          <div className="flex gap-4 mb-4">
            <button
              onClick={loadBlobs}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-md mb-6">
            <p className="text-red-800 dark:text-red-200 font-semibold">Error:</p>
            <p className="text-red-700 dark:text-red-300 text-sm mt-2">{error}</p>
          </div>
        )}

        {loading && blobs.length === 0 ? (
          <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
            Loading blobs...
          </div>
        ) : blobs.length === 0 ? (
          <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
            No blobs found.
          </div>
        ) : (
          <div className="space-y-4">
            {blobs.map((blob) => (
              <div
                key={blob.address}
                className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 mb-1">
                      Object Address:
                    </p>
                    <p className="text-sm font-mono text-zinc-600 dark:text-zinc-400 break-all mb-2">
                      {blob.address}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 mb-1">
                      Blob ID (base64):
                    </p>
                    <p className="text-sm font-mono text-blue-600 dark:text-blue-400 break-all mb-2">
                      {blob.blobId}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
                      Size: {blob.size} bytes
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
                      Deletable: {blob.deletable ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleReadBlob(blob)}
                      disabled={readingBlobId === blob.address || deletingBlobId === blob.address}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                    >
                      {readingBlobId === blob.address ? 'Reading...' : 'Read'}
                    </button>
                    {blob.deletable && (
                      <button
                        onClick={() => handleDeleteBlob(blob)}
                        disabled={readingBlobId === blob.address || deletingBlobId === blob.address}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                      >
                        {deletingBlobId === blob.address ? 'Deleting...' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {readResult && (
          <div className="mt-8 bg-green-50 dark:bg-green-900/20 p-6 rounded-lg border border-green-200 dark:border-green-800">
            <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
              Blob Content
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2 font-mono break-all">
              Blob ID: {readResult.blobId}
            </p>
            <pre className="bg-white dark:bg-zinc-900 p-4 rounded border border-zinc-200 dark:border-zinc-800 text-sm text-black dark:text-zinc-50 whitespace-pre-wrap break-words overflow-auto max-h-96">
              {readResult.content}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
