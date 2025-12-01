import React, { useCallback, useState } from 'react';
import { Icons } from './Icon';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  label?: string;
  compact?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  onFileSelect, 
  accept = ".pdf,.csv,image/*", 
  label = "Upload File",
  compact = false
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  }, [onFileSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-xl transition-all duration-200 text-center
        ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'}
        ${compact ? 'p-4' : 'p-8'}
      `}
    >
      <input
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
        <div className={`rounded-full bg-white shadow-sm ${compact ? 'p-2' : 'p-3'}`}>
          <Icons.Upload className={`${compact ? 'w-5 h-5' : 'w-8 h-8'} text-indigo-600`} />
        </div>
        <div className="text-gray-600">
          <span className="font-medium text-indigo-600">{label}</span>
          {!compact && <span className="text-gray-400"> or drag and drop</span>}
        </div>
        {!compact && (
          <p className="text-xs text-gray-500">PDF, CSV, PNG, JPG up to 10MB</p>
        )}
      </div>
    </div>
  );
};