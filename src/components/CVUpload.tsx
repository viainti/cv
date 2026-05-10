import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

const CVUpload: React.FC = () => {
  const { addCV, cvs } = useApp();
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      const cv = {
        id: Date.now().toString(),
        fileName: file.name,
        content: text,
        extractedData: {},
        uploadedAt: Date.now(),
      };
      await addCV(cv);
    } catch (error) {
      console.error('Error uploading CV:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">My CVs</h2>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        <p className="text-gray-600 mb-4">Upload your CV (PDF or Word)</p>
        <input
          type="file"
          onChange={handleFileUpload}
          disabled={uploading}
          className="hidden"
          id="cv-upload"
        />
        <label htmlFor="cv-upload" className="btn btn-primary cursor-pointer">
          {uploading ? 'Uploading...' : 'Select File'}
        </label>
      </div>

      {cvs.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Uploaded CVs</h3>
          {cvs.map((cv) => (
            <div key={cv.id} className="p-3 bg-gray-50 rounded-lg">
              <p className="font-medium">{cv.fileName}</p>
              <p className="text-xs text-gray-500">
                {new Date(cv.uploadedAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CVUpload;
