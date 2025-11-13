'use client';

import { useState } from 'react';
import {
  createBasicWalrusClient,
  writeWalrusBlob,
  readWalrusBlob,
  writeWalrusFile,
  readWalrusFile,
  createWalrusFileFromString,
  getFileText,
  deleteWalrusBlob,
  OWNER_KEYPAIR,
} from '@/lib/walrus';

export default function WalrusTestPage() {
  const [blobContent, setBlobContent] = useState('Hello from the TS SDK!!!\n');
  const [fileContent, setFileContent] = useState('Hello from Walrus File!\n');
  const [fileIdentifier, setFileIdentifier] = useState('test.txt');
  const [blobId, setBlobId] = useState('');
  const [readBlobId, setReadBlobId] = useState('');
  const [readFileId, setReadFileId] = useState('');
  const [deleteBlobId, setDeleteBlobId] = useState('');
  const [epochs, setEpochs] = useState(3);
  const [deletable, setDeletable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

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

  const handleWriteFile = async () => {
    setLoading(true);
    setError('');
    setResult('');
    
    try {
      const client = createBasicWalrusClient();
      const file = createWalrusFileFromString(fileContent, fileIdentifier, {
        'content-type': 'text/plain',
      });
      
      const writeResult = await writeWalrusFile(
        client,
        file,
        epochs,
        deletable,
        OWNER_KEYPAIR
      );
      
      setResult(`File written successfully!\nBlob ID: ${writeResult.blobId}\nID: ${writeResult.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to write file');
    } finally {
      setLoading(false);
    }
  };

  const handleReadFile = async () => {
    setLoading(true);
    setError('');
    setResult('');
    
    try {
      const client = createBasicWalrusClient();
      const file = await readWalrusFile(client, readFileId);
      const text = await getFileText(file);
      const identifier = await file.getIdentifier();
      const tags = await file.getTags();
      
      setResult(`File read successfully!\nIdentifier: ${identifier || 'N/A'}\nTags: ${JSON.stringify(tags, null, 2)}\nContent:\n${text}`);
    } catch (err: any) {
      setError(err.message || 'Failed to read file');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBlob = async () => {
    setLoading(true);
    setError('');
    setResult('');
    
    try {
      const client = createBasicWalrusClient();
      const { digest } = await deleteWalrusBlob(client, deleteBlobId);
      
      setResult(`Blob deleted successfully!\nTransaction Digest: ${digest}`);
    } catch (err: any) {
      setError(err.message || 'Failed to delete blob');
    } finally {
      setLoading(false);
    }
  };


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

        {/* Write File Section */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
            Write File
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-50">
                File Content
              </label>
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-black dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-50">
                File Identifier
              </label>
              <input
                type="text"
                value={fileIdentifier}
                onChange={(e) => setFileIdentifier(e.target.value)}
                placeholder="e.g., test.txt"
                className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-black dark:text-zinc-50"
              />
            </div>
            <button
              onClick={handleWriteFile}
              disabled={loading}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Writing...' : 'Write File'}
            </button>
          </div>
        </div>

        {/* Read File Section */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
            Read File
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-50">
                File/Blob ID
              </label>
              <input
                type="text"
                value={readFileId}
                onChange={(e) => setReadFileId(e.target.value)}
                placeholder="Enter file/blob ID to read"
                className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-black dark:text-zinc-50"
              />
            </div>
            <button
              onClick={handleReadFile}
              disabled={loading || !readFileId}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Reading...' : 'Read File'}
            </button>
          </div>
        </div>

        {/* Delete Blob Section */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
            Delete Blob
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-50">
                Blob Object ID
              </label>
              <input
                type="text"
                value={deleteBlobId}
                onChange={(e) => setDeleteBlobId(e.target.value)}
                placeholder="Enter blob object ID to delete"
                className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-black dark:text-zinc-50"
              />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Note: Only deletable blobs owned by the configured owner can be deleted.
            </p>
            <button
              onClick={handleDeleteBlob}
              disabled={loading || !deleteBlobId}
              className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Deleting...' : 'Delete Blob'}
            </button>
          </div>
        </div>

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

